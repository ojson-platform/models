import type {Context} from '../context';
import type {WithModels} from '../with-models';
import type {Model, OJson, Json} from '../types';
import type {Attributes, Span} from '@opentelemetry/api';

import {SpanKind, SpanStatusCode, trace} from '@opentelemetry/api';
import {api, core} from '@opentelemetry/sdk-node';

export type PropsFilter = '*' | Record<string, boolean | ((key: string, value: unknown) => boolean)>

export type ModelWithTelemetry<Props extends OJson, Result extends Json> = Model<Props, Result> & {
    displayProps?: PropsFilter;
    displayResult?: PropsFilter;
    displayTags?: Attributes;
};

export type WithTelemetry<T extends WithModels<Context>> = T & {
    [__Span__]: Span;
    [__ModelProps__]: (props: Attributes) => Span;
    [__ModelResult__]: (result: Attributes) => Span;
    [__ModelError__]: (error: unknown) => Span;
};

export type TelemetryConfig = {
    serviceName: string;
};

const __ModelProps__ = Symbol('TelModelProps');
const __ModelResult__ = Symbol('TelModelResult');
const __ModelError__ = Symbol('TelModelError');
const __Span__ = Symbol('TelSpan');
const __Handled__ = Symbol('TelErrorHandled');

const wrapRequest = (request: WithModels<Context>['request']) =>
    async function<Props extends OJson, Result extends Json>(
        this: WithTelemetry<WithModels<Context>>,
        model: ModelWithTelemetry<Props, Result>,
        props: Props
    ) {
        const {displayProps, displayResult, displayTags} = model;

        if (displayProps) {
            this[__ModelProps__](extractFields(props, displayProps, 'props.'));
        }

        if (displayTags) {
            this[__ModelProps__](displayTags);
        }

        const value = await request.call(this, model, props);

        if (displayResult) {
            this[__ModelResult__](extractFields(value, displayResult));
        }

        return value;
    };

const wrapCreate = (create: WithModels<Context>['create'], config: TelemetryConfig) =>
    function(this: WithTelemetry<WithModels<Context>>, name: string) {
        return wrapContext(create.call(this, name), config);
    };

const wrapEnd = (end: WithModels<Context>['end']) =>
    function(this: WithTelemetry<WithModels<Context>>) {
        end.call(this);
        this[__Span__].end(this.endTime);
    };

const wrapFail = (fail: WithModels<Context>['fail']) =>
    function(this: WithTelemetry<WithModels<Context>>, error: unknown) {
        fail.call(this, error);

        this[__Span__].setStatus({
            code: SpanStatusCode.ERROR,
            message: extractMessage(error),
        });

        this[__Span__].end(this.endTime);

        if (error && !error[__Handled__]) {
            error[__Handled__] = true;
            this[__ModelError__](error);
        }
    };

const wrapContext = <CTX extends WithModels<Context>>(ctx: CTX, config: TelemetryConfig) => {
    const tracer = trace.getTracer(config.serviceName);
    const context = trace.setSpan(api.context.active(), ctx.parent && ctx.parent[__Span__]);
    const span = tracer.startSpan(ctx.name, {kind: SpanKind.INTERNAL}, context);

    Object.assign(ctx, {
        create: wrapCreate(ctx.create, config),
        request: wrapRequest(ctx.request),
        end: wrapEnd(ctx.end),
        fail: wrapFail(ctx.fail),
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

export function withTelemetry(config: TelemetryConfig) {
    return function<CTX extends WithModels<Context>>(ctx: CTX) {
        return wrapContext(ctx, config);
    };
}

function extractField(acc, field, value, object, prefix: string) {
    if (core.isAttributeValue(value)) {
        return acc;
    }

    if (value === true) {
        acc[prefix + field] = object[field];
    }

    if (typeof value === 'string') {
        acc[prefix + field] = object[value];
    }

    if (typeof value === 'function') {
        acc[prefix + field] = value(object);
    }

    return acc;
}

function extractFields(object: OJson, filter: PropsFilter, prefix = '') {
    prefix = prefix ? prefix + '.' : prefix;

    if (filter === '*') {
        return Object.keys(object).reduce(
            (acc, key) => extractField(acc, key, true, object, prefix),
            {},
        );
    } else if (Array.isArray(filter)) {
        return filter.reduce((acc, prop) => extractField(acc, prop, prop, object, prefix), {});
    } else if (typeof filter === 'object') {
        return Object.keys(filter).reduce(
            (acc, key) => extractField(acc, key, filter[key], object, prefix),
            {},
        );
    }

    return {};
}

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

function extractStacktrace(error: unknown): string | undefined {
    if (error && typeof error === 'object' && 'stack' in error) {
        return String(error.stack);
    }
}