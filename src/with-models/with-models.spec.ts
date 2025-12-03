import type { Model } from '../types';

import {describe, expect, it, vi} from 'vitest';

import {Context} from '../context';
import {withModels, Dead} from './with-models';

describe('withModels', () => {
    it('should work', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const model = vi.fn(() => ({result: 1})) as unknown as Model;

        model.displayName = 'model';

        const result = await context.request(model, {test: 1});

        expect(model).toBeCalledWith({test: 1}, expect.anything());
        expect(result).toEqual({result: 1});
    });

    it('should work with async result', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const model = vi.fn(async () => ({result: 1})) as unknown as Model;

        model.displayName = 'model';

        const result = await context.request(model, {test: 1});

        expect(model).toBeCalledWith({test: 1}, expect.anything());
        expect(result).toEqual({result: 1});
    });

    it('should work with gen result', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const wait = (delay: number, result: any) => new Promise((resolve) => setTimeout(resolve, delay, result));
        const model = vi.fn(function * () {
            const result = yield wait(10, {result: 1});

            return result;
        }) as unknown as Model;

        model.displayName = 'model';

        const result = await context.request(model, {test: 1});

        expect(model).toBeCalledWith({test: 1}, expect.anything());
        expect(result).toEqual({result: 1});
    });

    it('should memoize models', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const model = vi.fn(() => ({result: 1})) as unknown as Model;

        model.displayName = 'model';

        const result1 = await context.request(model, {test: 1});
        const result2 = await context.request(model, {test: 1});

        expect(model).toHaveBeenCalledTimes(1);
        expect(result1 === result2).toBe(true);
    });

    it('should not memoize models with different props', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const model = vi.fn(() => ({result: 1})) as unknown as Model;

        model.displayName = 'model';

        const result1 = await context.request(model, {test: 1});
        const result2 = await context.request(model, {test: 2});

        expect(model).toHaveBeenCalledTimes(2);
        expect(result1 === result2).toBe(false);
    });

    it('should not memoize different models', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const model1 = vi.fn(() => ({})) as unknown as Model;
        const model2 = vi.fn(() => ({})) as unknown as Model;

        model1.displayName = 'model1';
        model2.displayName = 'model2';

        await context.request(model1, {test: 1});
        await context.request(model2, {test: 1});

        expect(model1).toHaveBeenCalledTimes(1);
        expect(model2).toHaveBeenCalledTimes(1);
    });

    it('should fail without displayName', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const model = vi.fn(() => ({})) as unknown as Model;

        await expect(() => context.request(model, {test: 1})).rejects
            .toThrow('Model should define static `displayName` property');
    });

    it('should fail with wrong result', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const model = vi.fn() as unknown as Model;

        model.displayName = 'model';

        await expect(() => context.request(model, {test: 1})).rejects
            .toThrow('Unexpected model result');
    });

    it('should prevent processing if dead', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const model = vi.fn(() => ({result: 1})) as unknown as Model;

        model.displayName = 'model';

        context.kill();

        const result = await context.request(model, {test: 1});

        expect(model).not.toBeCalled();
        expect(result).toEqual(Dead);
    });

    it('should prevent processing steps if dead', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const wait = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay));
        const model = vi.fn(function * () {
            yield wait(10);
            context.kill();
            yield wait(10);

            return {result: 1};
        }) as unknown as Model;

        model.displayName = 'model';

        const result = await context.request(model, {test: 1});

        expect(model).toBeCalledWith({test: 1}, expect.anything());
        expect(result).toEqual(Dead);
    });

    it('should work with model as object with action method', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const action = vi.fn(() => ({result: 1}));
        const model = {
            displayName: 'model',
            action
        } as unknown as Model;

        const result = await context.request(model, {test: 1});

        expect(action).toBeCalledWith({test: 1}, expect.anything());
        expect(result).toEqual({result: 1});
    });

    it('should work without props (undefined)', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const model = vi.fn(() => ({result: 1})) as unknown as Model;

        model.displayName = 'model';

        const result = await context.request(model);

        expect(model).toBeCalledWith({}, expect.anything());
        expect(result).toEqual({result: 1});
    });

    it('should handle nested generators', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const wait = (delay: number, result: any) => new Promise((resolve) => setTimeout(resolve, delay, result));
        
        function* innerGenerator() {
            const value = yield wait(10, {inner: 1});
            return value;
        }

        const model = vi.fn(function * () {
            const inner = yield innerGenerator();
            const final = yield wait(10, {final: 2});
            return {inner, final};
        }) as unknown as Model;

        model.displayName = 'model';

        const result = await context.request(model, {test: 1});

        expect(result).toEqual({inner: {inner: 1}, final: {final: 2}});
    });

    it('should handle generator with multiple yields', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const wait = (delay: number, result: any) => new Promise((resolve) => setTimeout(resolve, delay, result));
        
        const model = vi.fn(function * () {
            const step1 = yield wait(10, {step: 1});
            const step2 = yield wait(10, {step: 2});
            const step3 = yield wait(10, {step: 3});
            return {step1, step2, step3};
        }) as unknown as Model;

        model.displayName = 'model';

        const result = await context.request(model, {test: 1});

        expect(result).toEqual({
            step1: {step: 1},
            step2: {step: 2},
            step3: {step: 3}
        });
    });

    it('should handle errors in generator and propagate them', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const error = new Error('Generator error');
        
        const model = vi.fn(function * () {
            yield Promise.resolve({step: 1});
            throw error;
        }) as unknown as Model;

        model.displayName = 'model';

        await expect(() => context.request(model, {test: 1})).rejects.toThrow('Generator error');
    });

    it('should handle promise rejection and cleanup registry', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const error = new Error('Promise rejection');
        const model = vi.fn(async () => {
            throw error;
        }) as unknown as Model;

        model.displayName = 'model';

        await expect(() => context.request(model, {test: 1})).rejects.toThrow('Promise rejection');

        // Registry should be cleaned up after promise rejection
        const key = `model;test=1`;
        expect(registry.has(key as any)).toBe(false);
    });

    it('should share memoization across contexts with same registry', async () => {
        const registry = new Map();
        const context1 = withModels(registry)(new Context('request1'));
        const context2 = withModels(registry)(new Context('request2'));
        const model = vi.fn(() => ({result: 1})) as unknown as Model;

        model.displayName = 'model';

        const result1 = await context1.request(model, {test: 1});
        const result2 = await context2.request(model, {test: 1});

        expect(model).toHaveBeenCalledTimes(1);
        expect(result1 === result2).toBe(true);
    });

    it('should allow model to call other models', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        
        const dependencyModel = vi.fn(() => ({dep: 'value'})) as unknown as Model;
        dependencyModel.displayName = 'dependency';
        
        const model = vi.fn(function(props: any, ctx: any) {
            const dep = ctx.request(dependencyModel, {id: props.id});
            return {result: dep, id: props.id};
        }) as unknown as Model;
        model.displayName = 'model';

        // Note: this test shows the pattern, but ctx.request returns Promise
        // In real usage, the model would need to be async
        const asyncModel = vi.fn(async function(props: any, ctx: any) {
            const dep = await ctx.request(dependencyModel, {id: props.id});
            return {result: dep, id: props.id};
        }) as unknown as Model;
        asyncModel.displayName = 'asyncModel';

        const result = await context.request(asyncModel, {id: 123});

        expect(dependencyModel).toBeCalledWith({id: 123}, expect.anything());
        expect(result).toEqual({result: {dep: 'value'}, id: 123});
    });

    it('should memoize when model calls other models', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        
        const dependencyModel = vi.fn(() => ({dep: 'value'})) as unknown as Model;
        dependencyModel.displayName = 'dependency';
        
        const model1 = vi.fn(async function(props: any, ctx: any) {
            const dep = await ctx.request(dependencyModel, {id: props.id});
            return {result: dep, id: props.id};
        }) as unknown as Model;
        model1.displayName = 'model1';

        const model2 = vi.fn(async function(props: any, ctx: any) {
            const dep = await ctx.request(dependencyModel, {id: props.id});
            return {other: dep};
        }) as unknown as Model;
        model2.displayName = 'model2';

        await context.request(model1, {id: 123});
        await context.request(model2, {id: 123});

        // dependencyModel should be called only once due to memoization
        expect(dependencyModel).toHaveBeenCalledTimes(1);
    });

    it('should fail with unexpected model type (no function or action)', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const model = {
            displayName: 'model'
            // No function or action method
        } as unknown as Model;

        await expect(() => context.request(model, {test: 1})).rejects
            .toThrow('Unexpected model type for model');
    });
});
