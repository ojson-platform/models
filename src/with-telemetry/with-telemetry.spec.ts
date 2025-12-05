import type {Model} from '../types';

import {describe, expect, it, vi} from 'vitest';
import {SpanStatusCode, trace} from '@opentelemetry/api';

import {Context} from '../context';
import {withModels, Dead, InterruptedError} from '../with-models';
import {compose} from '../utils';

import {withTelemetry, type ModelWithTelemetry, __TelSpan__} from './with-telemetry';

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
        const span = (ctx as any)[__TelSpan__];

        expect(span).toBeDefined();
    });

    it('should end span when context ends', () => {
        const ctx = createContext();
        const span = (ctx as any)[__TelSpan__];
        const endSpy = vi.spyOn(span, 'end');

        ctx.end();

        expect(endSpy).toHaveBeenCalledTimes(1);
        expect(endSpy).toHaveBeenCalledWith(ctx.endTime);
    });

    it('should set span status to ERROR and record error when context fails', () => {
        const ctx = createContext();
        const span = (ctx as any)[__TelSpan__];
        const setStatusSpy = vi.spyOn(span, 'setStatus');
        const addEventSpy = vi.spyOn(span, 'addEvent');
        const endSpy = vi.spyOn(span, 'end');

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
        const span = (ctx as any)[__TelSpan__];
        const addEventSpy = vi.spyOn(span, 'addEvent');

        const error = new Error('test error');
        ctx.fail(error);
        ctx.fail(error);

        // Error event should be recorded only once
        expect(addEventSpy).toHaveBeenCalledTimes(1);
    });

    it('should record props in span attributes when displayProps is set', async () => {
        const ctx = createContext();
        const span = (ctx as any)[__TelSpan__];
        const setAttributesSpy = vi.spyOn(span, 'setAttributes');

        const model = vi.fn(() => ({result: 'ok'})) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayProps = {userId: true, role: true};

        await ctx.request(model, {userId: 123, role: 'admin', secret: 'hidden'});

        expect(setAttributesSpy).toHaveBeenCalled();
        // Find the call that contains props attributes
        const propsCall = setAttributesSpy.mock.calls.find(call => {
            const attrs = call[0];
            return attrs && typeof attrs === 'object' && Object.keys(attrs).some(key => key.startsWith('props.'));
        });
        expect(propsCall).toBeDefined();
        const propsAttrs = propsCall![0] as Record<string, unknown>;
        expect(propsAttrs['props.userId']).toBe(123);
        expect(propsAttrs['props.role']).toBe('admin');
        expect(propsAttrs['props.secret']).toBeUndefined();
    });

    it('should record all props when displayProps is "*"', async () => {
        const ctx = createContext();
        const span = (ctx as any)[__TelSpan__];
        const setAttributesSpy = vi.spyOn(span, 'setAttributes');

        const model = vi.fn(() => ({result: 'ok'})) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayProps = '*';

        await ctx.request(model, {userId: 123, role: 'admin'});

        expect(setAttributesSpy).toHaveBeenCalled();
        // Find the call that contains props attributes
        const propsCall = setAttributesSpy.mock.calls.find(call => {
            const attrs = call[0];
            return attrs && typeof attrs === 'object' && Object.keys(attrs).some(key => key.startsWith('props.'));
        });
        expect(propsCall).toBeDefined();
        const propsAttrs = propsCall![0] as Record<string, unknown>;
        expect(propsAttrs['props.userId']).toBe(123);
        expect(propsAttrs['props.role']).toBe('admin');
    });

    it('should record result in span events when displayResult is set', async () => {
        const ctx = createContext();
        const span = (ctx as any)[__TelSpan__];
        const addEventSpy = vi.spyOn(span, 'addEvent');

        const model = vi.fn(() => ({status: 'success', count: 42})) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayResult = {status: true, count: true};

        await ctx.request(model, {});

        expect(addEventSpy).toHaveBeenCalled();
        const resultCalls = addEventSpy.mock.calls.filter(call => call[0] === 'result');
        expect(resultCalls.length).toBeGreaterThan(0);
        const resultAttrs = resultCalls[0][1] as Record<string, unknown>;
        expect(resultAttrs.status).toBe('success');
        expect(resultAttrs.count).toBe(42);
    });

    it('should add displayTags to span attributes', async () => {
        const ctx = createContext();
        const span = (ctx as any)[__TelSpan__];
        const setAttributesSpy = vi.spyOn(span, 'setAttributes');

        const model = vi.fn(() => ({result: 'ok'})) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayTags = {
            'model.name': 'TestModel',
            'model.version': '1.0.0',
        };

        await ctx.request(model, {});

        expect(setAttributesSpy).toHaveBeenCalled();
        const tagsCall = setAttributesSpy.mock.calls.find(call => call[0]?.['model.name'] !== undefined);
        expect(tagsCall).toBeDefined();
        const tagsAttrs = tagsCall![0] as Record<string, unknown>;
        expect(tagsAttrs['model.name']).toBe('TestModel');
        expect(tagsAttrs['model.version']).toBe('1.0.0');
    });

    it('should create child contexts with telemetry when ctx.create is called', () => {
        const parent = createContext();
        const child = parent.create('child-request');
        const childSpan = (child as any)[__TelSpan__];

        expect(childSpan).toBeDefined();
    });

    it('should execute model normally when no telemetry config is provided', async () => {
        const ctx = createContext();
        const span = (ctx as any)[__TelSpan__];
        const setAttributesSpy = vi.spyOn(span, 'setAttributes');
        const addEventSpy = vi.spyOn(span, 'addEvent');

        const model = vi.fn(() => ({result: 'ok'})) as unknown as Model;
        model.displayName = 'TestModel';

        const result = await ctx.request(model, {test: 1});

        expect(result).toEqual({result: 'ok'});
        expect(model).toHaveBeenCalledTimes(1);
        // No telemetry methods should be called when model has no telemetry config
        expect(setAttributesSpy).not.toHaveBeenCalled();
        expect(addEventSpy).not.toHaveBeenCalled();
    });

    it('should handle string error messages in fail', () => {
        const ctx = createContext();
        const span = (ctx as any)[__TelSpan__];
        const setStatusSpy = vi.spyOn(span, 'setStatus');
        const addEventSpy = vi.spyOn(span, 'addEvent');

        ctx.fail('string error');

        expect(setStatusSpy).toHaveBeenCalledWith({
            code: SpanStatusCode.ERROR,
            message: 'string error',
        });
        // String errors are not objects, so __ModelError__ is not called
        // Only the status is set, no error event is added
        expect(addEventSpy).not.toHaveBeenCalled();
    });

    it('should handle error objects without message property', () => {
        const ctx = createContext();
        const span = (ctx as any)[__TelSpan__];
        const setStatusSpy = vi.spyOn(span, 'setStatus');

        const error = {code: 500};
        ctx.fail(error);

        expect(setStatusSpy).toHaveBeenCalledWith({
            code: SpanStatusCode.ERROR,
            message: String(error),
        });
    });

    it('should record props but not result when model returns Dead', async () => {
        const ctx = createContext();
        ctx.kill(); // Kill context to make request return Dead
        const span = (ctx as any)[__TelSpan__];
        const setAttributesSpy = vi.spyOn(span, 'setAttributes');
        const addEventSpy = vi.spyOn(span, 'addEvent');

        const model = vi.fn(() => ({result: 'ok'})) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayProps = {test: true};
        model.displayResult = {result: true};

        const result = ctx.request(model, {test: 1});

        await expect(result).rejects.toThrow(InterruptedError);
        // Props are recorded BEFORE request execution, so they will be set even if request returns Dead
        expect(setAttributesSpy).toHaveBeenCalled();
        // Result is recorded AFTER request execution, so it won't be set if request returns Dead
        const resultCalls = addEventSpy.mock.calls.filter(call => call[0] === 'result');
        expect(resultCalls.length).toBe(0);
    });

    it('should use custom extractor function for props', async () => {
        const ctx = createContext();
        const span = (ctx as any)[__TelSpan__];
        const setAttributesSpy = vi.spyOn(span, 'setAttributes');

        const model = vi.fn(() => ({result: 'ok'})) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayProps = {
            userId: (key, value) => `user-${value}`,
            count: (key, value) => Number(value) * 2,
        };

        await ctx.request(model, {userId: 123, count: 5});

        expect(setAttributesSpy).toHaveBeenCalled();
        const propsCall = setAttributesSpy.mock.calls.find(call => {
            const attrs = call[0];
            return attrs && typeof attrs === 'object' && Object.keys(attrs).some(key => key.startsWith('props.'));
        });
        expect(propsCall).toBeDefined();
        const propsAttrs = propsCall![0] as Record<string, unknown>;
        expect(propsAttrs['props.userId']).toBe('user-123');
        expect(propsAttrs['props.count']).toBe(10);
    });

    it('should map props fields using string values', async () => {
        const ctx = createContext();
        const span = (ctx as any)[__TelSpan__];
        const setAttributesSpy = vi.spyOn(span, 'setAttributes');

        const model = vi.fn(() => ({result: 'ok'})) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayProps = {
            id: 'userId', // Map props.id to props.userId attribute
        };

        await ctx.request(model, {userId: 123, id: 456});

        expect(setAttributesSpy).toHaveBeenCalled();
        const propsCall = setAttributesSpy.mock.calls.find(call => {
            const attrs = call[0];
            return attrs && typeof attrs === 'object' && Object.keys(attrs).some(key => key.startsWith('props.'));
        });
        expect(propsCall).toBeDefined();
        const propsAttrs = propsCall![0] as Record<string, unknown>;
        // Should record props.id with value from props.userId (mapped field)
        expect(propsAttrs['props.id']).toBe(123);
    });

    it('should create child span with parent-child relationship', () => {
        const parent = createContext('parent-service');
        const parentSpan = (parent as any)[__TelSpan__];

        const child = parent.create('child-request');
        const childSpan = (child as any)[__TelSpan__];

        expect(childSpan).toBeDefined();
        expect(childSpan).not.toBe(parentSpan);
        // Verify that child span exists and is different from parent
        expect(childSpan.spanContext).toBeDefined();
        expect(parentSpan.spanContext).toBeDefined();
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

    it('should handle primitive result values via Promise', async () => {
        const ctx = createContext();
        const span = (ctx as any)[__TelSpan__];
        const addEventSpy = vi.spyOn(span, 'addEvent');

        const model = vi.fn(() => Promise.resolve('string result')) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayResult = '*';

        await ctx.request(model, {});

        expect(addEventSpy).toHaveBeenCalled();
        const resultCalls = addEventSpy.mock.calls.filter(call => call[0] === 'result');
        expect(resultCalls.length).toBeGreaterThan(0);
        const resultAttrs = resultCalls[0][1] as Record<string, unknown>;
        // Primitive values should be recorded as 'value' attribute
        expect(resultAttrs.value).toBe('string result');
    });

    it('should handle array result values via Promise', async () => {
        const ctx = createContext();
        const span = (ctx as any)[__TelSpan__];
        const addEventSpy = vi.spyOn(span, 'addEvent');

        const model = vi.fn(() => Promise.resolve([1, 2, 3])) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayResult = '*';

        await ctx.request(model, {});

        expect(addEventSpy).toHaveBeenCalled();
        const resultCalls = addEventSpy.mock.calls.filter(call => call[0] === 'result');
        expect(resultCalls.length).toBeGreaterThan(0);
        const resultAttrs = resultCalls[0][1] as Record<string, unknown>;
        // Arrays should be recorded as value
        expect(resultAttrs.value).toEqual([1, 2, 3]);
    });

    it('should handle number result values via Promise', async () => {
        const ctx = createContext();
        const span = (ctx as any)[__TelSpan__];
        const addEventSpy = vi.spyOn(span, 'addEvent');

        const model = vi.fn(() => Promise.resolve(42)) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayResult = '*';

        await ctx.request(model, {});

        expect(addEventSpy).toHaveBeenCalled();
        const resultCalls = addEventSpy.mock.calls.filter(call => call[0] === 'result');
        expect(resultCalls.length).toBeGreaterThan(0);
        const resultAttrs = resultCalls[0][1] as Record<string, unknown>;
        expect(resultAttrs.value).toBe(42);
    });

    it('should handle boolean result values via Promise', async () => {
        const ctx = createContext();
        const span = (ctx as any)[__TelSpan__];
        const addEventSpy = vi.spyOn(span, 'addEvent');

        const model = vi.fn(() => Promise.resolve(true)) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayResult = '*';

        await ctx.request(model, {});

        expect(addEventSpy).toHaveBeenCalled();
        const resultCalls = addEventSpy.mock.calls.filter(call => call[0] === 'result');
        expect(resultCalls.length).toBeGreaterThan(0);
        const resultAttrs = resultCalls[0][1] as Record<string, unknown>;
        expect(resultAttrs.value).toBe(true);
    });

    it('should handle empty props object', async () => {
        const ctx = createContext();
        const span = (ctx as any)[__TelSpan__];
        const setAttributesSpy = vi.spyOn(span, 'setAttributes');

        const model = vi.fn(() => ({result: 'ok'})) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayProps = '*';

        await ctx.request(model, {});

        expect(setAttributesSpy).toHaveBeenCalled();
    });

    it('should handle empty result object', async () => {
        const ctx = createContext();
        const span = (ctx as any)[__TelSpan__];
        const addEventSpy = vi.spyOn(span, 'addEvent');

        const model = vi.fn(() => ({})) as unknown as ModelWithTelemetry<any, any>;
        model.displayName = 'TestModel';
        model.displayResult = '*';

        await ctx.request(model, {});

        expect(addEventSpy).toHaveBeenCalled();
        const resultCalls = addEventSpy.mock.calls.filter(call => call[0] === 'result');
        expect(resultCalls.length).toBeGreaterThan(0);
    });

    it('should record custom events via ctx.event()', () => {
        const ctx = createContext();
        const span = (ctx as any)[__TelSpan__];
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
        const span = (ctx as any)[__TelSpan__];
        const addEventSpy = vi.spyOn(span, 'addEvent');

        ctx.event('cache miss');

        expect(addEventSpy).toHaveBeenCalledTimes(1);
        expect(addEventSpy).toHaveBeenCalledWith('cache miss');
    });

    it('should filter invalid attribute values when recording events', () => {
        const ctx = createContext();
        const span = (ctx as any)[__TelSpan__];
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
        const childSpan = (child as any)[__TelSpan__];
        const addEventSpy = vi.spyOn(childSpan, 'addEvent');

        child.event('child event', {data: 'value'});

        expect(addEventSpy).toHaveBeenCalledTimes(1);
        expect(addEventSpy).toHaveBeenCalledWith('child event', {data: 'value'});
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
        const span = (ctx as any)[__TelSpan__];
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
});