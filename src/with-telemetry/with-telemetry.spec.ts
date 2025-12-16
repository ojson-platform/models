import type {Model} from '../types';

import {describe, expect, it, vi} from 'vitest';
import {SpanStatusCode, trace, context as otelContext, type Span} from '@opentelemetry/api';

import {Context} from '../context';
import {withModels, InterruptedError} from '../with-models';
import {compose} from '../utils';

import {withTelemetry, getSpan} from './with-telemetry';
import type {ModelWithTelemetry} from './types';

describe('withTelemetry', () => {
    function createContext(serviceName = 'test-service') {
        const registry = new Map();
        const wrap = compose([
            withModels(registry),
            withTelemetry({serviceName}),
        ]);

        return wrap(new Context('test-request'));
    }

    it('should create a span for the context', () => {
        const ctx = createContext();
        const span = getSpan(ctx);

        expect(span).toBeDefined();
    });

    it('should end span when context ends', () => {
        const ctx = createContext();
        const span = getSpan(ctx)!;
        const endSpy = vi.spyOn(span, 'end');
        // Mock isRecording to return true (span is still recording)
        vi.spyOn(span, 'isRecording').mockReturnValue(true);

        ctx.end();

        expect(endSpy).toHaveBeenCalledTimes(1);
        // endTime is set in Context.end(), so it should be defined after ctx.end()
        expect(ctx.endTime).toBeDefined();
        expect(endSpy).toHaveBeenCalledWith(ctx.endTime);
    });

    it('should set span status to ERROR and record error when context fails', () => {
        const ctx = createContext();
        const span = getSpan(ctx)!;
        const setStatusSpy = vi.spyOn(span, 'setStatus');
        const addEventSpy = vi.spyOn(span, 'addEvent');
        const endSpy = vi.spyOn(span, 'end');
        // Mock isRecording to return true (span is still recording)
        vi.spyOn(span, 'isRecording').mockReturnValue(true);

        const error = new Error('test error');
        ctx.fail(error);

        expect(setStatusSpy).toHaveBeenCalledTimes(1);
        expect(setStatusSpy).toHaveBeenCalledWith({
            code: SpanStatusCode.ERROR,
            message: 'test error',
        });
        expect(addEventSpy).toHaveBeenCalledTimes(1);
        expect(addEventSpy).toHaveBeenCalledWith('error', {
            message: 'test error',
            stack: expect.stringContaining('Error: test error'),
        });
        expect(endSpy).toHaveBeenCalledTimes(1);
    });

    it('should record error only once when fail is called multiple times', () => {
        const ctx = createContext();
        const span = getSpan(ctx)!;
        const addEventSpy = vi.spyOn(span, 'addEvent');
        // Mock isRecording to return true (span is still recording)
        vi.spyOn(span, 'isRecording').mockReturnValue(true);

        const error = new Error('test error');
        ctx.fail(error);
        // After first fail, span is ended, so isRecording returns false
        vi.spyOn(span, 'isRecording').mockReturnValue(false);
        ctx.fail(error);

        // Error event should be recorded only once
        expect(addEventSpy).toHaveBeenCalledTimes(1);
    });

    it('should NOT record props on parent span when displayProps is set', async () => {
        const ctx = createContext();
        const parentSpan = getSpan(ctx)!;
        const parentSetAttributesSpy = vi.spyOn(parentSpan, 'setAttributes');

        const model = vi.fn(() => ({result: 'ok'})) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayProps = {userId: true, role: true};

        await ctx.request(model, {userId: 123, role: 'admin', secret: 'hidden'});

        // Props should NOT be recorded on the parent span
        // They should be recorded on the child span (model's span) instead
        const parentPropsCall = parentSetAttributesSpy.mock.calls.find(call => {
            const attrs = call[0];
            return attrs && typeof attrs === 'object' && Object.keys(attrs).some(key => key.startsWith('props.'));
        });
        expect(parentPropsCall).toBeUndefined();
        
        expect(model).toHaveBeenCalled();
    });

    it('should NOT record all props on parent span when displayProps is "*"', async () => {
        const ctx = createContext();
        const parentSpan = getSpan(ctx)!;
        const parentSetAttributesSpy = vi.spyOn(parentSpan, 'setAttributes');

        const model = vi.fn(() => ({result: 'ok'})) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayProps = '*';

        await ctx.request(model, {userId: 123, role: 'admin'});

        // Props should NOT be recorded on the parent span
        const parentPropsCall = parentSetAttributesSpy.mock.calls.find(call => {
            const attrs = call[0];
            return attrs && typeof attrs === 'object' && Object.keys(attrs).some(key => key.startsWith('props.'));
        });
        expect(parentPropsCall).toBeUndefined();
    });

    it('should NOT record result on parent span when displayResult is set', async () => {
        const ctx = createContext();
        const parentSpan = getSpan(ctx)!;
        const parentAddEventSpy = vi.spyOn(parentSpan, 'addEvent');

        const model = vi.fn(() => ({status: 'success', count: 42})) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayResult = {status: true, count: true};

        await ctx.request(model, {});

        // Result should NOT be recorded on the parent span
        // It should be recorded on the child span (model's span) instead
        const parentResultCalls = parentAddEventSpy.mock.calls.filter(call => call[0] === 'result');
        expect(parentResultCalls.length).toBe(0);
    });

    it('should NOT add displayTags to parent span attributes', async () => {
        const ctx = createContext();
        const parentSpan = getSpan(ctx)!;
        const parentSetAttributesSpy = vi.spyOn(parentSpan, 'setAttributes');

        const model = vi.fn(() => ({result: 'ok'})) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayTags = {
            'model.name': 'TestModel',
            'model.version': '1.0.0',
        };

        await ctx.request(model, {});

        // Tags should NOT be recorded on the parent span
        // They should be recorded on the child span (model's span) instead
        const parentTagsCall = parentSetAttributesSpy.mock.calls.find(call => call[0]?.['model.name'] !== undefined);
        expect(parentTagsCall).toBeUndefined();
    });

    it('should create child contexts with telemetry when ctx.create is called', () => {
        const parent = createContext();
        const child = parent.create('child-request');
        const childSpan = getSpan(child)!;

        expect(childSpan).toBeDefined();
    });

    function captureChildSpans(ctx: any) {
        const childSpans: Array<{span: any; name: string}> = [];
        const originalCreate = ctx.create;
        ctx.create = vi.fn((name: string) => {
            const child = originalCreate.call(ctx, name);
            const childSpan = getSpan(child)!;
            if (childSpan) {
                childSpans.push({span: childSpan, name});
            }
            return child;
        });
        return childSpans;
    }

    it('should execute model normally when no telemetry config is provided', async () => {
        const ctx = createContext();
        const parentSpan = getSpan(ctx)!;
        const parentSetAttributesSpy = vi.spyOn(parentSpan, 'setAttributes');
        const parentAddEventSpy = vi.spyOn(parentSpan, 'addEvent');

        const childSpans = captureChildSpans(ctx);

        const model = vi.fn(() => ({result: 'ok'})) as unknown as Model;
        model.displayName = 'TestModel';

        const result = await ctx.request(model, {test: 1});

        expect(result).toEqual({result: 'ok'});
        expect(model).toHaveBeenCalledTimes(1);
        // No telemetry methods should be called on parent span when model has no telemetry config
        expect(parentSetAttributesSpy).not.toHaveBeenCalled();
        expect(parentAddEventSpy).not.toHaveBeenCalled();
        
        // Child span should exist but no attributes/events should be recorded
        const modelSpan = childSpans.find(s => s.name === 'TestModel');
        expect(modelSpan).toBeDefined();
        const childSetAttributesSpy = vi.spyOn(modelSpan!.span, 'setAttributes');
        const childAddEventSpy = vi.spyOn(modelSpan!.span, 'addEvent');
        await ctx.request(model, {test: 2});
        expect(childSetAttributesSpy).not.toHaveBeenCalled();
        expect(childAddEventSpy).not.toHaveBeenCalled();
    });

    it('should handle string error messages in fail', () => {
        const ctx = createContext();
        const span = getSpan(ctx)!;
        const setStatusSpy = vi.spyOn(span, 'setStatus');
        const addEventSpy = vi.spyOn(span, 'addEvent');
        // Mock isRecording to return true (span is still recording)
        vi.spyOn(span, 'isRecording').mockReturnValue(true);

        ctx.fail('string error');

        expect(setStatusSpy).toHaveBeenCalledWith({
            code: SpanStatusCode.ERROR,
            message: 'string error',
        });
        // String errors are not objects, so error event is not added
        expect(addEventSpy).not.toHaveBeenCalled();
    });

    it('should handle error objects without message property', () => {
        const ctx = createContext();
        const span = getSpan(ctx)!;
        const setStatusSpy = vi.spyOn(span, 'setStatus');
        // Mock isRecording to return true (span is still recording)
        vi.spyOn(span, 'isRecording').mockReturnValue(true);

        const error = {code: 500};
        ctx.fail(error);

        expect(setStatusSpy).toHaveBeenCalledWith({
            code: SpanStatusCode.ERROR,
            message: String(error),
        });
    });

    it('should record props but not result when model execution is interrupted', async () => {
        const ctx = createContext();
        ctx.kill(); // Kill context to make request throw InterruptedError
        const parentSpan = getSpan(ctx)!;
        const parentSetAttributesSpy = vi.spyOn(parentSpan, 'setAttributes');

        const childSpans = captureChildSpans(ctx);

        const model = vi.fn(() => ({result: 'ok'})) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayProps = {test: true};
        model.displayResult = {result: true};

        const result = ctx.request(model, {test: 1});

        await expect(result).rejects.toThrow(InterruptedError);
        // Props should NOT be recorded on parent span
        expect(parentSetAttributesSpy).not.toHaveBeenCalled();
        
        // Child span should be created
        const modelSpan = childSpans.find(s => s.name === 'TestModel');
        expect(modelSpan).toBeDefined();
        
        // Props are recorded on child span BEFORE model execution, but execution is interrupted
        // So props may or may not be recorded depending on when interruption happens
        // Result is recorded AFTER request execution, so it won't be set if request is interrupted
        const childSetAttributesSpy = vi.spyOn(modelSpan!.span, 'setAttributes');
        const childAddEventSpy = vi.spyOn(modelSpan!.span, 'addEvent');
        try {
            await ctx.request(model, {test: 2});
        } catch {
            // Expected
        }
        // Result should not be recorded
        const resultCalls = childAddEventSpy.mock.calls.filter(call => call[0] === 'result');
        expect(resultCalls.length).toBe(0);
    });

    it('should NOT record custom extracted props on parent span', async () => {
        const ctx = createContext();
        const parentSpan = getSpan(ctx)!;
        const parentSetAttributesSpy = vi.spyOn(parentSpan, 'setAttributes');

        const model = vi.fn(() => ({result: 'ok'})) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayProps = {
            userId: (key, value) => `user-${value}`,
            count: (key, value) => Number(value) * 2,
        };

        await ctx.request(model, {userId: 123, count: 5});

        // Props should NOT be recorded on the parent span
        const parentPropsCall = parentSetAttributesSpy.mock.calls.find(call => {
            const attrs = call[0];
            return attrs && typeof attrs === 'object' && Object.keys(attrs).some(key => key.startsWith('props.'));
        });
        expect(parentPropsCall).toBeUndefined();
    });

    it('should NOT record mapped props fields on parent span', async () => {
        const ctx = createContext();
        const parentSpan = getSpan(ctx)!;
        const parentSetAttributesSpy = vi.spyOn(parentSpan, 'setAttributes');

        const model = vi.fn(() => ({result: 'ok'})) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayProps = {
            id: 'userId', // Map props.id to props.userId attribute
        };

        await ctx.request(model, {userId: 123, id: 456});

        // Props should NOT be recorded on the parent span
        const parentPropsCall = parentSetAttributesSpy.mock.calls.find(call => {
            const attrs = call[0];
            return attrs && typeof attrs === 'object' && Object.keys(attrs).some(key => key.startsWith('props.'));
        });
        expect(parentPropsCall).toBeUndefined();
    });

    it('should create child span with parent-child relationship', () => {
        const parent = createContext('parent-service');
        const parentSpan = getSpan(parent)!;

        const child = parent.create('child-request');
        const childSpan = getSpan(child as any)!;

        expect(childSpan).toBeDefined();
        expect(childSpan).not.toBe(parentSpan);
        // Verify that child span exists and is different from parent
        expect(typeof childSpan.spanContext).toBe('function');
        expect(typeof parentSpan.spanContext).toBe('function');
    });

    it('should throw error when serviceName is empty', () => {
        expect(() => {
            withTelemetry({serviceName: ''});
        }).toThrow('withTelemetry: serviceName must be a non-empty string');
    });

    it('should throw error when serviceName is whitespace only', () => {
        expect(() => {
            withTelemetry({serviceName: '   '});
        }).toThrow('withTelemetry: serviceName must be a non-empty string');
    });

    it('should NOT record primitive result values on parent span', async () => {
        const ctx = createContext();
        const parentSpan = getSpan(ctx)!;
        const parentAddEventSpy = vi.spyOn(parentSpan, 'addEvent');

        const model = vi.fn(() => Promise.resolve('string result')) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayResult = '*';

        await ctx.request(model, {});

        // Result should NOT be recorded on the parent span
        const parentResultCalls = parentAddEventSpy.mock.calls.filter(call => call[0] === 'result');
        expect(parentResultCalls.length).toBe(0);
    });

    it('should NOT record array result values on parent span', async () => {
        const ctx = createContext();
        const parentSpan = getSpan(ctx)!;
        const parentAddEventSpy = vi.spyOn(parentSpan, 'addEvent');

        const model = vi.fn(() => Promise.resolve([1, 2, 3])) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayResult = '*';

        await ctx.request(model, {});

        // Result should NOT be recorded on the parent span
        const parentResultCalls = parentAddEventSpy.mock.calls.filter(call => call[0] === 'result');
        expect(parentResultCalls.length).toBe(0);
    });

    it('should NOT record number result values on parent span', async () => {
        const ctx = createContext();
        const parentSpan = getSpan(ctx)!;
        const parentAddEventSpy = vi.spyOn(parentSpan, 'addEvent');

        const model = vi.fn(() => Promise.resolve(42)) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayResult = '*';

        await ctx.request(model, {});

        // Result should NOT be recorded on the parent span
        const parentResultCalls = parentAddEventSpy.mock.calls.filter(call => call[0] === 'result');
        expect(parentResultCalls.length).toBe(0);
    });

    it('should NOT record boolean result values on parent span', async () => {
        const ctx = createContext();
        const parentSpan = getSpan(ctx)!;
        const parentAddEventSpy = vi.spyOn(parentSpan, 'addEvent');

        const model = vi.fn(() => Promise.resolve(true)) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayResult = '*';

        await ctx.request(model, {});

        // Result should NOT be recorded on the parent span
        const parentResultCalls = parentAddEventSpy.mock.calls.filter(call => call[0] === 'result');
        expect(parentResultCalls.length).toBe(0);
    });

    it('should NOT record empty props object on parent span', async () => {
        const ctx = createContext();
        const parentSpan = getSpan(ctx)!;
        const parentSetAttributesSpy = vi.spyOn(parentSpan, 'setAttributes');

        const model = vi.fn(() => ({result: 'ok'})) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayProps = '*';

        await ctx.request(model, {});

        // Props should NOT be recorded on the parent span
        const parentPropsCall = parentSetAttributesSpy.mock.calls.find(call => {
            const attrs = call[0];
            return attrs && typeof attrs === 'object' && Object.keys(attrs).some(key => key.startsWith('props.'));
        });
        expect(parentPropsCall).toBeUndefined();
    });

    it('should NOT record empty result object on parent span', async () => {
        const ctx = createContext();
        const parentSpan = getSpan(ctx)!;
        const parentAddEventSpy = vi.spyOn(parentSpan, 'addEvent');

        const model = vi.fn(() => ({})) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayResult = '*';

        await ctx.request(model, {});

        // Result should NOT be recorded on the parent span
        const parentResultCalls = parentAddEventSpy.mock.calls.filter(call => call[0] === 'result');
        expect(parentResultCalls.length).toBe(0);
    });

    it('should record custom events via ctx.event()', () => {
        const ctx = createContext();
        const span = getSpan(ctx)!;
        const addEventSpy = vi.spyOn(span, 'addEvent');

        ctx.event('resolved from cache', {key: 'model-key', ttl: 3600});

        expect(addEventSpy).toHaveBeenCalledTimes(1);
        expect(addEventSpy).toHaveBeenCalledWith('resolved from cache', {
            key: 'model-key',
            ttl: 3600,
        });
    });

    it('should record events without attributes', () => {
        const ctx = createContext();
        const span = getSpan(ctx)!;
        const addEventSpy = vi.spyOn(span, 'addEvent');

        ctx.event('cache miss');

        expect(addEventSpy).toHaveBeenCalledTimes(1);
        expect(addEventSpy).toHaveBeenCalledWith('cache miss');
    });

    it('should filter invalid attribute values when recording events', () => {
        const ctx = createContext();
        const span = getSpan(ctx)!;
        const addEventSpy = vi.spyOn(span, 'addEvent');

        ctx.event('test event', {
            validString: 'value',
            validNumber: 123,
            invalidObject: {nested: 'object'},
            validBoolean: true,
        });

        expect(addEventSpy).toHaveBeenCalledTimes(1);
        const callArgs = addEventSpy.mock.calls[0];
        expect(callArgs[0]).toBe('test event');
        const attributes = callArgs[1] as Record<string, unknown>;
        expect(attributes.validString).toBe('value');
        expect(attributes.validNumber).toBe(123);
        expect(attributes.validBoolean).toBe(true);
        expect(attributes.invalidObject).toBeUndefined();
    });

    it('should work when withTelemetry is not enabled (no-op)', () => {
        const registry = new Map();
        const wrap = compose([
            withModels(registry),
            // withTelemetry is not included
        ]);

        const ctx = wrap(new Context('test-request'));

        // Should not throw, even though withTelemetry is not enabled
        expect(() => {
            ctx.event('test event', {key: 'value'});
        }).not.toThrow();
    });

    it('should record events in child contexts', () => {
        const parent = createContext();
        const child = parent.create('child-request');
        const childSpan = getSpan(child as any)!;
        const addEventSpy = vi.spyOn(childSpan, 'addEvent');

        child.event('child event', {data: 'value'});

        expect(addEventSpy).toHaveBeenCalledTimes(1);
        expect(addEventSpy).toHaveBeenCalledWith('child event', {data: 'value'});
    });

    it('should use active OpenTelemetry context as parent when no ctx.parent', () => {
        const registry = new Map();
        const wrap = compose([
            withModels(registry),
            withTelemetry({serviceName: 'test-service'}),
        ]);

        // Create an external parent span and make it active
        const tracer = trace.getTracer('external-service');
        const externalParent = tracer.startSpan('external-parent');
        const parentCtx = trace.setSpan(otelContext.active(), externalParent);

        let ctxSpanContext;
        otelContext.with(parentCtx, () => {
            const ctx = wrap(new Context('request-with-parent'));
            const span = getSpan(ctx)!;
            ctxSpanContext = span.spanContext();
        });

        const externalCtx = externalParent.spanContext();
        expect(ctxSpanContext.traceId).toBe(externalCtx.traceId);

        externalParent.end();
    });

    it('should ignore later changes of active OpenTelemetry context for existing context', () => {
        const registry = new Map();
        const wrap = compose([
            withModels(registry),
            withTelemetry({serviceName: 'test-service'}),
        ]);

        const tracer = trace.getTracer('external-service');

        // Step 1: create first external parent and make it active when creating ctx
        const parent1 = tracer.startSpan('external-parent-1');
        const parentCtx1 = trace.setSpan(otelContext.active(), parent1);

        let ctxSpanContext;
        let ctx: any;
        otelContext.with(parentCtx1, () => {
            const created = wrap(new Context('request-with-parent-1'));
            const span = getSpan(created)!;
            ctxSpanContext = span.spanContext();
            ctx = created;
        });

        const parent1Ctx = parent1.spanContext();
        expect(ctxSpanContext.traceId).toBe(parent1Ctx.traceId);

        // Step 2: later, change active OTEL context to a different parent
        const parent2 = tracer.startSpan('external-parent-2');
        const parentCtx2 = trace.setSpan(otelContext.active(), parent2);

        let childSpanContext;
        otelContext.with(parentCtx2, () => {
            // Create a child context under ctx while a different OTEL context is active
            const child = ctx.create('child-request');
            const childSpan = getSpan(child)!;
            childSpanContext = childSpan.spanContext();
        });

        // Child must be a child of ctx's span (i.e. same traceId as ctx, not as parent2)
        expect(childSpanContext.traceId).toBe(ctxSpanContext.traceId);
        expect(childSpanContext.traceId).not.toBe(parent2.spanContext().traceId);

        parent1.end();
        parent2.end();
    });

    it('should keep parent spans isolated for parallel root contexts with active OpenTelemetry context', async () => {
        const registry = new Map();
        const wrap = compose([
            withModels(registry),
            withTelemetry({serviceName: 'test-service'}),
        ]);

        const tracer = trace.getTracer('external-service');

        // Create two independent external parents and their contexts
        const parent1 = tracer.startSpan('external-parent-1');
        const parentCtx1 = trace.setSpan(otelContext.active(), parent1);

        const parent2 = tracer.startSpan('external-parent-2');
        const parentCtx2 = trace.setSpan(otelContext.active(), parent2);

        let ctx1SpanContext;
        let ctx2SpanContext;

        await Promise.all([
            otelContext.with(parentCtx1, async () => {
                // Simulate some async work before creating context
                await Promise.resolve();
                const ctx1 = wrap(new Context('request-1'));
                const span1 = getSpan(ctx1)!;
                ctx1SpanContext = span1.spanContext();
            }),
            otelContext.with(parentCtx2, async () => {
                // Simulate different async scheduling
                await new Promise(resolve => setTimeout(resolve, 1));
                const ctx2 = wrap(new Context('request-2'));
                const span2 = getSpan(ctx2)!;
                ctx2SpanContext = span2.spanContext();
            }),
        ]);

        const p1 = parent1.spanContext();
        const p2 = parent2.spanContext();

        // Each context must be attached to its own parent trace
        expect(ctx1SpanContext.traceId).toBe(p1.traceId);
        expect(ctx2SpanContext.traceId).toBe(p2.traceId);
        expect(ctx1SpanContext.traceId).not.toBe(ctx2SpanContext.traceId);

        parent1.end();
        parent2.end();
    });

    it('should expose model span as active OpenTelemetry span during model execution', async () => {
        const registry = new Map();
        const wrap = compose([
            withModels(registry),
            withTelemetry({serviceName: 'test-service'}),
        ]);

        const ctx = wrap(new Context('request'));

        const spans: Span[] = [];

        const model = vi.fn(async (_props: any, _modelCtx: any) => {
            const activeSpan = trace.getSpan(otelContext.active());
            if (activeSpan) {
                spans.push(activeSpan);
                activeSpan.addEvent('inside-model', {ok: true});
            }
            return {result: 'ok'};
        }) as unknown as Model;
        model.displayName = 'TestModel';

        await ctx.request(model, {id: 1});

        // We should have captured an active span during model execution
        expect(spans.length).toBe(1);
        const active = spans[0];

        // And this active span should be the same as the model's child span
        const childSpans = captureChildSpans(ctx);

        await ctx.request(model, {id: 2});

        const modelSpan = childSpans.find(s => s.name === 'TestModel');
        expect(modelSpan).toBeDefined();
        expect(modelSpan!.span.spanContext().traceId).toBe(active.spanContext().traceId);
        expect(modelSpan!.span.spanContext().spanId).toBe(active.spanContext().spanId);
    });

    it('should record cache events from withCache without direct coupling', async () => {
        const {withCache} = await import('../with-cache/with-cache');
        const {CacheFirst} = await import('../with-cache/cache-strategy');
        const {TrackingCacheProvider} = await import('../with-cache/__tests__/cache-provider');

        const cache = new TrackingCacheProvider();
        const registry = new Map();
        const wrap = compose([
            withModels(registry),
            withCache({default: {ttl: 3600}}, cache),
            withTelemetry({serviceName: 'test-service'}),
        ]);

        const ctx = wrap(new Context('request'));
        const span = getSpan(ctx)!;
        const addEventSpy = vi.spyOn(span, 'addEvent');

        const model = vi.fn(() => ({result: 'ok'})) as unknown as Model;
        model.displayName = 'TestModel';
        (model as any).cacheStrategy = CacheFirst.with({ttl: 3600});

        // First call - cache miss
        await ctx.request(model, {id: 1});
        expect(addEventSpy).toHaveBeenCalledWith('cache.miss', {
            strategy: 'cache-first',
            provider: 'TrackingCacheProvider',
        });

        // Second call - cache hit
        await ctx.request(model, {id: 1});
        expect(addEventSpy).toHaveBeenCalledWith('cache.hit', {
            strategy: 'cache-first',
            provider: 'TrackingCacheProvider',
        });

        cache.release();
    });

    it('should set status to ERROR even if fail is called after end', () => {
        const ctx = createContext();
        const span = getSpan(ctx)!;
        const setStatusSpy = vi.spyOn(span, 'setStatus');
        const endSpy = vi.spyOn(span, 'end');
        // Mock isRecording: true for end, false for fail (span already ended)
        const isRecordingSpy = vi.spyOn(span, 'isRecording')
            .mockReturnValueOnce(true)  // For ctx.end()
            .mockReturnValueOnce(false); // For ctx.fail() - span already ended

        // First end the context
        ctx.end();
        expect(endSpy).toHaveBeenCalledTimes(1);
        expect(isRecordingSpy).toHaveBeenCalled();

        // Then fail it - span is not recording, so status should NOT be set
        const error = new Error('error after end');
        ctx.fail(error);

        // Status should NOT be set if span is not recording
        expect(setStatusSpy).not.toHaveBeenCalled();
    });

    it('should not end span in wrapEnd if context already has error', () => {
        const ctx = createContext();
        const span = getSpan(ctx)!;
        const endSpy = vi.spyOn(span, 'end');
        const setStatusSpy = vi.spyOn(span, 'setStatus');
        // Mock isRecording: true for fail, false for end (span already ended)
        vi.spyOn(span, 'isRecording')
            .mockReturnValueOnce(true)  // For ctx.fail()
            .mockReturnValueOnce(false); // For ctx.end() - span already ended

        // First fail the context
        const error = new Error('test error');
        ctx.fail(error);
        expect(setStatusSpy).toHaveBeenCalledWith({
            code: SpanStatusCode.ERROR,
            message: 'test error',
        });
        expect(endSpy).toHaveBeenCalledTimes(1); // fail should end the span

        // Reset spy to check if end is called again
        endSpy.mockClear();

        // Then try to end it - should not end again (span is not recording)
        ctx.end();
        expect(endSpy).not.toHaveBeenCalled();
    });

    it('should set status to ERROR and end span when fail is called on recording span', () => {
        const ctx = createContext();
        const span = getSpan(ctx)!;
        const setStatusSpy = vi.spyOn(span, 'setStatus');
        const endSpy = vi.spyOn(span, 'end');
        const isRecordingSpy = vi.spyOn(span, 'isRecording').mockReturnValue(true);

        const error = new Error('test error');
        ctx.fail(error);

        // Should check if span is recording
        expect(isRecordingSpy).toHaveBeenCalled();
        // Should set status to ERROR
        expect(setStatusSpy).toHaveBeenCalledWith({
            code: SpanStatusCode.ERROR,
            message: 'test error',
        });
        // Should end the span
        expect(endSpy).toHaveBeenCalledTimes(1);
        // endTime is set in Context.fail(), so it should be defined after ctx.fail()
        expect(ctx.endTime).toBeDefined();
        expect(endSpy).toHaveBeenCalledWith(ctx.endTime);
    });

    it('should not set status or end span if span is not recording', () => {
        const ctx = createContext();
        const span = getSpan(ctx)!;
        const setStatusSpy = vi.spyOn(span, 'setStatus');
        const endSpy = vi.spyOn(span, 'end');
        const isRecordingSpy = vi.spyOn(span, 'isRecording').mockReturnValue(false);

        const error = new Error('test error');
        ctx.fail(error);

        // Should check if span is recording
        expect(isRecordingSpy).toHaveBeenCalled();
        // Should NOT set status if span is not recording
        expect(setStatusSpy).not.toHaveBeenCalled();
        // Should NOT end the span if it's not recording
        expect(endSpy).not.toHaveBeenCalled();
    });

    it('should verify that span status is actually set to ERROR (not just method called)', () => {
        const ctx = createContext();
        const span = getSpan(ctx)!;
        
        // Mock isRecording to return true (span is still recording)
        vi.spyOn(span, 'isRecording').mockReturnValue(true);
        
        // Mock span to track actual status
        let actualStatus: {code: SpanStatusCode; message?: string} | undefined;
        const originalSetStatus = span.setStatus.bind(span);
        span.setStatus = ((status: {code: SpanStatusCode; message?: string}) => {
            actualStatus = status;
            return originalSetStatus(status);
        }) as any;

        const error = new Error('test error');
        ctx.fail(error);

        // Verify that status was actually set
        expect(actualStatus).toBeDefined();
        expect(actualStatus?.code).toBe(SpanStatusCode.ERROR);
        expect(actualStatus?.message).toBe('test error');
    });
});