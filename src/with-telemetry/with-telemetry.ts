import type {Context} from '../context';
import type {WithModels} from '../with-models';
import type {Model, OJson, Json} from '../types';
import type {Attributes, Span} from '@opentelemetry/api';

import {SpanKind, SpanStatusCode, trace} from '@opentelemetry/api';
import {api, core} from '@opentelemetry/sdk-node';
import {isPlainObject} from '../utils';

/**
 * Filter configuration for extracting fields from props or results.
 *
 * - `'*'` - Include all fields
 * - Object with field names as keys:
 *   - `true` - Include the field as-is
 *   - `string` - Include field with a different name (mapping)
 *   - `function` - Custom extractor function `(key, value) => attributeValue`
 */
export type PropsFilter = '*' | Record<string, boolean | string | ((key: string, value: unknown) => unknown)>;

/**
 * Extended model type that supports telemetry configuration.
 *
 * Models can optionally specify:
 * - `displayProps` - Which props fields to include in span attributes
 * - `displayResult` - Which result fields to include in span events
 * - `displayTags` - Additional static attributes to add to spans
 */
export type ModelWithTelemetry<Props extends OJson, Result extends Json> = Model<Props, Result> & {
    displayProps?: PropsFilter;
    displayResult?: PropsFilter;
    displayTags?: Attributes;
};

/**
 * Context extension type that adds OpenTelemetry tracing capabilities.
 *
 * Extends a `WithModels` context with:
 * - A span for tracking this context's execution
 * - Methods to record model props, results, and errors as span attributes/events
 * - Automatic span lifecycle management (start on context creation, end on `ctx.end()` or `ctx.fail()`)
 *
 * All standard `WithModels` and `Context` methods remain available.
 */
export type WithTelemetry<T extends WithModels<Context>> = T & {
    /** @internal OpenTelemetry span for this context */
    [__Span__]: Span;
    /** @internal Sets span attributes for model props */
    [__ModelProps__]: (props: Attributes) => Span;
    /** @internal Adds span event for model result */
    [__ModelResult__]: (result: Attributes) => Span;
    /** @internal Records error in span event */
    [__ModelError__]: (error: unknown) => Span;
    /**
     * Emits an event that will be recorded in the OpenTelemetry span.
     * 
     * This method is used by other helpers (e.g., `withCache`) to log events
     * without knowing if telemetry is enabled. If telemetry is not enabled,
     * the base `Context.event()` no-op method is used.
     * 
     * @param name - Event name (e.g., 'cache.hit', 'cache.miss', 'cache.update')
     * @param attributes - Optional attributes to attach to the event
     * 
     * @example
     * ```typescript
     * ctx.event('cache.hit', { key: 'model-key', ttl: 3600 });
     * ```
     */
    event(name: string, attributes?: Record<string, unknown>): void;
};

/**
 * Configuration for the telemetry helper.
 *
 * @property serviceName - Service name used for tracer identification in OpenTelemetry.
 *   This name appears in traces and helps identify which service generated the span.
 */
export type TelemetryConfig = {
    serviceName: string;
};

const __ModelProps__ = Symbol('TelModelProps');
const __ModelResult__ = Symbol('TelModelResult');
const __ModelError__ = Symbol('TelModelError');
const __Span__ = Symbol('TelSpan');
const __Handled__ = Symbol('TelErrorHandled');

// Export symbol for testing purposes
export const __TelSpan__ = __Span__;

/**
 * @internal
 * Wraps the context's request method to add telemetry instrumentation.
 */
const wrapRequest = (request: WithModels<Context>['request']) =>
    async function<Props extends OJson, Result extends Json>(
        this: WithTelemetry<WithModels<Context>>,
        model: ModelWithTelemetry<Props, Result>,
        props: Props
    ) {
        const {displayProps, displayResult, displayTags} = model;

        if (displayProps) {
            this[__ModelProps__](extractFields(props, displayProps, 'props'));
        }

        if (displayTags) {
            this[__ModelProps__](displayTags);
        }

        const value = await request.call(this, model, props);
        if (displayResult) {
            this[__ModelResult__](extractResultFields(value, displayResult));
        }
        return value;
    };

/**
 * @internal
 * Wraps the context's event method to record events in the OpenTelemetry span.
 */
const wrapEvent = (event: Context['event'], span: Span) =>
    function(this: WithTelemetry<WithModels<Context>>, name: string, attributes?: Record<string, unknown>) {
        // Call the original event method (in case there's any additional logic)
        event.call(this, name, attributes);

        // Record the event in the span
        if (attributes) {
            // Filter attributes to only include valid OpenTelemetry attribute values
            const validAttributes: Attributes = {};
            for (const [key, value] of Object.entries(attributes)) {
                if (core.isAttributeValue(value)) {
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
 * Wraps the context's create method to ensure child contexts also have telemetry.
 */
const wrapCreate = (create: WithModels<Context>['create'], config: TelemetryConfig) =>
    function(this: WithTelemetry<WithModels<Context>>, name: string) {
        return wrapContext(create.call(this, name), config);
    };

/**
 * @internal
 * Wraps the context's end method to end the OpenTelemetry span.
 */
const wrapEnd = (end: WithModels<Context>['end']) =>
    function(this: WithTelemetry<WithModels<Context>>) {
        end.call(this);
        this[__Span__].end(this.endTime);
    };

/**
 * @internal
 * Wraps the context's fail method to mark the span as failed and record error details.
 */
const wrapFail = (fail: WithModels<Context>['fail']) =>
    function(this: WithTelemetry<WithModels<Context>>, error: unknown) {
        fail.call(this, error);

        this[__Span__].setStatus({
            code: SpanStatusCode.ERROR,
            message: extractMessage(error),
        });

        this[__Span__].end(this.endTime);

        if (error && typeof error === 'object' && !error[__Handled__]) {
            error[__Handled__] = true;
            this[__ModelError__](error);
        }
    };

/**
 * @internal
 * Wraps a context to add OpenTelemetry tracing capabilities.
 * Creates a span for the context and sets up parent-child relationships.
 */
/**
 * @internal
 * Safely retrieves the parent span if the parent context has telemetry enabled.
 */
function getParentSpan(parent: Context | undefined): Span | undefined {
    if (!parent) {
        return undefined;
    }
    // Check if parent has telemetry (has __Span__ symbol)
    const parentSpan = (parent as WithTelemetry<WithModels<Context>>)[__Span__];
    return parentSpan;
}

const wrapContext = <CTX extends WithModels<Context>>(ctx: CTX, config: TelemetryConfig) => {
    const tracer = trace.getTracer(config.serviceName);
    const parentSpan = getParentSpan(ctx.parent);
    const context = trace.setSpan(api.context.active(), parentSpan);
    const span = tracer.startSpan(ctx.name, {kind: SpanKind.INTERNAL}, context);

    Object.assign(ctx, {
        create: wrapCreate(ctx.create, config),
        request: wrapRequest(ctx.request),
        end: wrapEnd(ctx.end),
        fail: wrapFail(ctx.fail),
        event: wrapEvent(ctx.event, span),
        [__Span__]: span,
        [__ModelProps__]: (props: Attributes) => span.setAttributes(props),
        [__ModelResult__]: (result: Attributes) => span.addEvent('result', result),
        [__ModelError__]: (error: unknown) => span.addEvent('error', {
            message: extractMessage(error),
            stack: extractStacktrace(error),
        }),
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
 * const ctx = wrap(new Context('request'));
 * await ctx.request(MyModel); // Creates span for context and model execution
 * ```
 */
export function withTelemetry(config: TelemetryConfig) {
    // Validate configuration
    if (!config.serviceName || typeof config.serviceName !== 'string' || config.serviceName.trim().length === 0) {
        throw new Error('withTelemetry: serviceName must be a non-empty string');
    }

    return function<CTX extends WithModels<Context>>(ctx: CTX) {
        return wrapContext(ctx, config);
    };
}

/**
 * @internal
 * Extracts a single field from an object based on filter configuration.
 */
function extractField(acc: Attributes, field: string, value: boolean | string | ((key: string, value: unknown) => unknown), object: OJson, prefix: string): Attributes {
    let extractedValue: unknown;

    if (value === true) {
        extractedValue = object[field];
    } else if (typeof value === 'string') {
        extractedValue = object[value];
    } else if (typeof value === 'function') {
        extractedValue = value(field, object[field]);
    } else {
        return acc;
    }

    if (core.isAttributeValue(extractedValue)) {
        acc[prefix + field] = extractedValue;
    }

    return acc;
}

/**
 * @internal
 * Checks if a value is an object (OJson) that can be used with extractFields.
 * Uses isPlainObject to ensure it's a plain object, not a class instance.
 */
function isOJsonObject(value: unknown): value is OJson {
    return isPlainObject(value);
}

/**
 * @internal
 * Safely extracts fields from a result value that can be any Json type.
 * For non-object values (arrays, primitives, booleans), records them directly.
 */
function extractResultFields(value: Json, filter: PropsFilter): Attributes {
    if (!isOJsonObject(value)) {
        // For non-object values (arrays, primitives, booleans), record the value directly
        if (core.isAttributeValue(value)) {
            return {value} as Attributes;
        }
        // If value is not a valid attribute value, convert to string
        return {value: String(value)} as Attributes;
    }

    // For objects, use the existing extractFields logic
    return extractFields(value, filter);
}

/**
 * @internal
 * Extracts fields from an object based on filter configuration.
 * Returns an Attributes object suitable for OpenTelemetry spans.
 */
function extractFields(object: OJson, filter: PropsFilter, prefix = ''): Attributes {
    prefix = prefix ? prefix + '.' : prefix;

    if (filter === '*') {
        return Object.keys(object).reduce(
            (acc, key) => extractField(acc, key, true, object, prefix),
            {} as Attributes,
        );
    } else if (typeof filter === 'object') {
        return Object.keys(filter).reduce(
            (acc, key) => extractField(acc, key, filter[key], object, prefix),
            {} as Attributes,
        );
    }

    return {};
}

/**
 * @internal
 * Extracts a readable error message from an error object.
 */
function extractMessage(error: unknown): string {
    if (!error) {
        return '';
    }

    if (typeof error === 'string') {
        return error;
    }

    if (typeof error === 'object' && 'message' in error) {
        return String(error.message);
    }

    return String(error);
}

/**
 * @internal
 * Extracts stack trace from an error object if available.
 */
function extractStacktrace(error: unknown): string | undefined {
    if (error && typeof error === 'object' && 'stack' in error) {
        return String(error.stack);
    }
}