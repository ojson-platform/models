import type {BaseContext} from '../context';
import type {WithModels} from '../with-models';
import type {OJson, Json} from '../types';
import type {ModelWithTelemetry, TelemetryConfig, WithTelemetry} from './types';
import type {Attributes, Span} from '@opentelemetry/api';

import {SpanKind, SpanStatusCode, trace, context as otelBaseContext} from '@opentelemetry/api';
import {AsyncLocalStorage} from 'node:async_hooks';

import {extractFields, extractMessage, extractResultFields, extractStacktrace, isAttributeValue, type ModelInfo} from './utils';
import {__ModelStorage__, __Span__} from './types';

const __Handled__ = Symbol('TelErrorHandled');

/**
 * Returns the OpenTelemetry span associated with a telemetry-enabled context, if any.
 *
 * This helper is intended primarily for testing and debugging. It accepts a plain
 * `BaseContext` (or any extended context) and uses structural typing to read the
 * internal span symbol if telemetry is enabled.
 */
export function getSpan(ctx: BaseContext | undefined): Span | undefined {
    if (!ctx) {
        return undefined;
    }

    return (ctx as any)[__Span__] as Span | undefined;
}

/**
 * @internal
 * Ensures AsyncLocalStorage for model info exists on the context and returns it.
 * This helper centralizes the invariant that withTelemetry has been applied to
 * the context. If storage is missing, it's a programming error (helper was not
 * applied correctly) and we throw to surface it early.
 */
function requireModelStorage<CTX extends WithModels<BaseContext>>(ctx: WithTelemetry<CTX>): AsyncLocalStorage<ModelInfo> {
    const storage = ctx[__ModelStorage__];
    if (!storage) {
        throw new Error('withTelemetry: modelStorage is not initialized on this context. Ensure `withTelemetry` wraps all created contexts.');
    }
    return storage;
}

/**
 * @internal
 * Wraps the context's request method to store model information in AsyncLocalStorage.
 * The actual telemetry recording happens in wrapCall on the child context's span.
 */
const wrapRequest = (request: WithModels<BaseContext>['request']) =>
    async function<Props extends OJson, Result extends Json>(
        this: WithTelemetry<WithModels<BaseContext>>,
        model: ModelWithTelemetry<Props, Result>,
        props: Props
    ) {
        const {displayProps, displayResult, displayTags} = model;
        const modelStorage = requireModelStorage(this);

        // Store model information in AsyncLocalStorage for access in wrapCall
        // This supports parallel and nested model calls
        return modelStorage.run(
            {displayProps, displayResult, displayTags, props},
            async () => {
                return await request.call(this, model, props);
            }
        );
    };

/**
 * @internal
 * Wraps the context's event method (from withModels) to record events in the OpenTelemetry span.
 */
const wrapEvent = (event: WithModels<BaseContext>['event'], span: Span) =>
    function(this: WithTelemetry<WithModels<BaseContext>>, name: string, attributes?: Record<string, unknown>) {
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

/**
 * @internal
 * Wraps the context's call method to record model telemetry on the child context's span.
 * This is where props, results, and errors are recorded - on the model's span, not the parent's.
 */
const wrapCall = <CTX extends WithModels<BaseContext>>(call: CTX['call']) =>
    async function(this: WithTelemetry<CTX>, name: string, action: Function) {
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

            return otelBaseContext.with(trace.setSpan(otelBaseContext.active(), childSpan), async () => {
                if (modelInfo) {
                    // Record props on the child span (model's span)
                    if (modelInfo.displayProps) {
                        childSpan.setAttributes(
                            extractFields(modelInfo.props, modelInfo.displayProps, 'props')
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

/**
 * @internal
 * Wraps the context's create method to ensure child contexts also have telemetry.
 *
 * Typing is generic so that `ctx.create()` returns the same telemetry-augmented
 * type as the parent, which keeps type inference consistent in user code and tests.
 */
const wrapCreate = <CTX extends WithModels<BaseContext>>(
    create: CTX['create'],
    config: TelemetryConfig,
) =>
    function (this: WithTelemetry<CTX>, name: string): WithTelemetry<CTX> {
        const child = create.call(this, name) as CTX;
        return wrapBaseContext(child, config);
    };

/**
 * @internal
 * Wraps the context's end method to end the OpenTelemetry span.
 * Only ends the span if it's still recording (not already ended via fail).
 * Also checks if context has an error - if so, don't end (fail should handle it).
 */
const wrapEnd = (end: WithModels<BaseContext>['end']) =>
    function(this: WithTelemetry<WithModels<BaseContext>>) {
        end.call(this);
        
        const span = this[__Span__];
        if (span.isRecording()) {
            // Use endTime if available (from Context class), otherwise use current time
            const endTime = (this as any).endTime ?? Date.now();
            span.end(endTime);
        }
    };

/**
 * @internal
 * Wraps the context's fail method to mark the span as failed and record error details.
 */
const wrapFail = (fail: WithModels<BaseContext>['fail']) =>
    function(this: WithTelemetry<WithModels<BaseContext>>, error: unknown) {
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
            const endTime = (this as any).endTime ?? Date.now();
            span.end(endTime);
        }
    };

const wrapBaseContext = <CTX extends WithModels<BaseContext>>(ctx: CTX, config: TelemetryConfig): WithTelemetry<CTX> => {
    const tracer = trace.getTracer(config.serviceName);
    const activeCtx = otelBaseContext.active();
    const parentSpan = getSpan(ctx.parent);
    // If there is a parent span from our own context hierarchy, use it;
    // otherwise, fall back to whatever span is currently active in OpenTelemetry
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
 * Factory function that enhances a `WithModels` context with OpenTelemetry tracing.
 *
 * It automatically creates spans for contexts and tracks model execution:
 * - Creates a span for each context (named after `ctx.name`)
 * - Sets up parent-child span relationships based on context hierarchy
 * - Records model props/result/errors as span attributes and events
 * - Marks spans as failed when `ctx.fail()` is called
 *
 * Models can optionally provide telemetry configuration via:
 * - `displayProps` - Which props fields to include in span attributes
 * - `displayResult` - Which result fields to include in span events
 * - `displayTags` - Additional static attributes to add to spans
 *
 * This helper is typically composed after `withModels` using `compose`.
 *
 * @param config - Telemetry configuration with service name
 * @returns Wrapper function that adds tracing capabilities to a `WithModels` context
 *
 * @throws {Error} If `serviceName` is empty or not a string
 *
 * @example
 * ```typescript
 * const wrap = compose([
 *   withModels(registry),
 *   withTelemetry({serviceName: 'my-api'}),
 * ]);
 *
 * const ctx = wrap(new BaseContext('request'));
 * await ctx.request(MyModel); // Creates span for context and model execution
 * ```
 */
export function withTelemetry(config: TelemetryConfig) {
    // Validate configuration
    if (!config.serviceName || typeof config.serviceName !== 'string' || config.serviceName.trim().length === 0) {
        throw new Error('withTelemetry: serviceName must be a non-empty string');
    }

    return function<CTX extends WithModels<BaseContext>>(ctx: CTX) {
        return wrapBaseContext(ctx, config);
    };
}
