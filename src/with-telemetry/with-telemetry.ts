import type {BaseContext} from '../context';
import type {OJson, Json} from '../types';
import type {WithModels} from '../with-models';
import type {ModelWithTelemetry, TelemetryConfig, WithTelemetry} from './types';
import type {Attributes, Span} from '@opentelemetry/api';

import {AsyncLocalStorage} from 'node:async_hooks';

import {SpanKind, SpanStatusCode, trace, context as otelContext} from '@opentelemetry/api';

import {has} from '../utils';

import {__ModelStorage__, __Span__} from './types';
import {
  extractFields,
  extractMessage,
  extractResultFields,
  extractStacktrace,
  isAttributeValue,
  ensureNodeSDKInitialized,
  type ModelInfo,
} from './utils';

const __Handled__ = Symbol('TelErrorHandled');

/**
 * Returns the OpenTelemetry span associated with a telemetry-enabled context, if any.
 * Intended for testing and debugging only.
 */
export function getSpan(ctx: BaseContext | undefined): Span | undefined {
  if (!ctx) {
    return undefined;
  }

  if (has(ctx, __Span__)) {
    return (ctx as WithTelemetry<WithModels<BaseContext>>)[__Span__];
  }
  return undefined;
}

/** @internal Returns AsyncLocalStorage for model info, throws if not initialized. */
function requireModelStorage<CTX extends WithModels<BaseContext>>(
  ctx: WithTelemetry<CTX>,
): AsyncLocalStorage<ModelInfo> {
  const storage = ctx[__ModelStorage__];
  if (!storage) {
    throw new Error(
      'withTelemetry: modelStorage is not initialized on this context. Ensure `withTelemetry` wraps all created contexts.',
    );
  }
  return storage;
}

/** @internal Stores model info in AsyncLocalStorage for access in wrapCall. */
const wrapRequest = (request: WithModels<BaseContext>['request']) =>
  async function <Props extends OJson, Result extends Json>(
    this: WithTelemetry<WithModels<BaseContext>>,
    model: ModelWithTelemetry<Props, Result>,
    props: Props,
  ) {
    const {displayProps, displayResult, displayTags} = model;
    const modelStorage = requireModelStorage(this);

    // Store model information in AsyncLocalStorage for access in wrapCall
    // This supports parallel and nested model calls
    return modelStorage.run({displayProps, displayResult, displayTags, props}, async () => {
      return await request.call(this, model, props);
    });
  };

/** @internal Records events in the OpenTelemetry span. */
const wrapEvent = (event: WithModels<BaseContext>['event'], span: Span) =>
  function (
    this: WithTelemetry<WithModels<BaseContext>>,
    name: string,
    attributes?: Record<string, unknown>,
  ) {
    // Call the original event method from withModels (no-op by default)
    event.call(this, name, attributes);

    // Record the event in the span
    if (attributes) {
      // Filter attributes to only include valid OpenTelemetry attribute values
      const validAttributes: Attributes = {};
      for (const [key, value] of Object.entries(attributes)) {
        if (isAttributeValue(value)) {
          validAttributes[key] = value;
        }
      }
      span.addEvent(name, validAttributes);
    } else {
      span.addEvent(name);
    }
  };

/** @internal Records model telemetry (props, results, errors) on the child context's span. */
const wrapCall = <CTX extends WithModels<BaseContext>>(call: CTX['call']) =>
  async function (this: WithTelemetry<CTX>, name: string, action: Function) {
    // Get model information from AsyncLocalStorage (set by wrapRequest)
    // Use parent's storage if available (for nested contexts), otherwise use this context's storage
    const parent = this.parent as WithTelemetry<CTX> | undefined;
    const modelStorage = parent?.[__ModelStorage__] || requireModelStorage<CTX>(this);
    const modelInfo = modelStorage.getStore();

    // Call the original call method, which creates a child context
    return await call.call(this, name, async (child: WithTelemetry<CTX>) => {
      // Child context is already created and wrapped with telemetry via wrapCreate.
      // We want the model span (child's span) to be the active OpenTelemetry span
      // during model execution so that:
      // - api.context.getActiveSpan() inside the model returns the model span
      // - any nested spans created by instrumentation become children of the model span.
      const childSpan = child[__Span__];

      return otelContext.with(trace.setSpan(otelContext.active(), childSpan), async () => {
        if (modelInfo) {
          // Record props on the child span (model's span)
          if (modelInfo.displayProps) {
            childSpan.setAttributes(
              extractFields(modelInfo.props, modelInfo.displayProps, 'props'),
            );
          }

          // Record displayTags on the child span (model's span)
          if (modelInfo.displayTags) {
            childSpan.setAttributes(modelInfo.displayTags);
          }
        }

        // Execute the model action
        try {
          const result = await action(child);

          // Record result on the child span (model's span)
          if (modelInfo?.displayResult) {
            childSpan.addEvent('result', extractResultFields(result, modelInfo.displayResult));
          }

          return result;
        } catch (error) {
          // Error will be handled by wrapFail on the child context
          // But we can also record it here if needed
          if (error && typeof error === 'object' && !error[__Handled__]) {
            childSpan.addEvent('error', {
              message: extractMessage(error),
              stack: extractStacktrace(error),
            });
          }
          throw error;
        }
      });
    });
  };

/** @internal Ensures child contexts inherit telemetry. */
const wrapCreate = <CTX extends WithModels<BaseContext>>(
  create: CTX['create'],
  config: TelemetryConfig,
) =>
  function (this: WithTelemetry<CTX>, name: string): WithTelemetry<CTX> {
    const child = create.call(this, name) as CTX;
    return wrapContext(child, config);
  };

/** @internal Ends the span if still recording. */
const wrapEnd = (end: WithModels<BaseContext>['end']) =>
  function (this: WithTelemetry<WithModels<BaseContext>>) {
    end.call(this);

    const span = this[__Span__];
    if (span.isRecording()) {
      // Use endTime if available (from Context class), otherwise use current time
      const endTime = has(this, 'endTime', 'number') ? this.endTime : Date.now();
      span.end(endTime);
    }
  };

/** @internal Marks span as failed and records error details. */
const wrapFail = (fail: WithModels<BaseContext>['fail']) =>
  function (this: WithTelemetry<WithModels<BaseContext>>, error: unknown) {
    fail.call(this, error);

    const span = this[__Span__];
    if (span.isRecording()) {
      // Record error event if it's an object error
      if (error && typeof error === 'object' && !error[__Handled__]) {
        error[__Handled__] = true;
        span.addEvent('error', {
          message: extractMessage(error),
          stack: extractStacktrace(error),
        });
      }

      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: extractMessage(error),
      });
      // Use endTime if available (from Context class), otherwise use current time
      const endTime = has(this, 'endTime', 'number') ? this.endTime : Date.now();
      span.end(endTime);
    }
  };

const wrapContext = <CTX extends WithModels<BaseContext>>(
  ctx: CTX,
  config: TelemetryConfig,
): WithTelemetry<CTX> => {
  // Ensure proper SDK is initialized before creating spans
  ensureNodeSDKInitialized();

  const tracer = trace.getTracer(config.serviceName);
  const activeCtx = otelContext.active();
  const parentSpan = getSpan(ctx.parent);

  // If we have a parent span from our hierarchy, use it (ignore active OTEL context)
  // Otherwise, try to use active OTEL context (which may contain a span set via otelContext.with)
  const baseCtx = parentSpan ? trace.setSpan(activeCtx, parentSpan) : activeCtx;
  const span = tracer.startSpan(ctx.name, {kind: SpanKind.INTERNAL}, baseCtx);

  // Create AsyncLocalStorage for this context (or reuse parent's if available)
  const parent = ctx.parent as WithTelemetry<CTX> | undefined;
  const modelStorage = parent?.[__ModelStorage__] || new AsyncLocalStorage<ModelInfo>();

  Object.assign(ctx, {
    create: wrapCreate<CTX>(ctx.create, config),
    call: wrapCall<CTX>(ctx.call),
    request: wrapRequest(ctx.request),
    end: wrapEnd(ctx.end),
    fail: wrapFail(ctx.fail),
    event: wrapEvent(ctx.event, span),
    [__Span__]: span,
    [__ModelStorage__]: modelStorage,
  });

  return ctx as WithTelemetry<CTX>;
};

/**
 * Enhances a `WithModels` context with OpenTelemetry tracing.
 *
 * Creates spans for contexts, tracks model execution, and records props/result/errors.
 * Models can provide telemetry config via `displayProps`, `displayResult`, `displayTags`.
 *
 * @param config - Telemetry configuration with service name
 * @returns Wrapper function that adds tracing capabilities
 * @throws {Error} If `serviceName` is empty or NodeSDK is not initialized
 */
export function withTelemetry(config: TelemetryConfig) {
  // Validate configuration
  if (
    !config.serviceName ||
    typeof config.serviceName !== 'string' ||
    config.serviceName.trim().length === 0
  ) {
    throw new Error('withTelemetry: serviceName must be a non-empty string');
  }

  return function <CTX extends WithModels<BaseContext>>(ctx: CTX) {
    return wrapContext(ctx, config);
  };
}
