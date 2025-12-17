import type { Model } from '../types';

import {describe, expect, it, vi} from 'vitest';

import {Context} from '../context';
import {withModels, InterruptedError} from './with-models';

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

    it('should fail with undefined result (not valid JSON)', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const model = vi.fn(() => undefined) as unknown as Model;

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

        await expect(context.request(model, {test: 1})).rejects.toThrow(InterruptedError);
        expect(model).not.toBeCalled();
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

        await expect(context.request(model, {test: 1})).rejects.toThrow(InterruptedError);
        expect(model).toBeCalledWith({test: 1}, expect.anything());
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

    it('should handle models returning arrays', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const model = vi.fn(() => [1, 2, 3]) as unknown as Model;

        model.displayName = 'arrayModel';

        const result = await context.request(model, {test: 1});

        expect(model).toBeCalledWith({test: 1}, expect.anything());
        expect(result).toEqual([1, 2, 3]);
        expect(Array.isArray(result)).toBe(true);
    });

    it('should handle models returning null', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const model = vi.fn(() => null) as unknown as Model;

        model.displayName = 'nullModel';

        const result = await context.request(model, {test: 1});

        expect(model).toBeCalledWith({test: 1}, expect.anything());
        expect(result).toBe(null);
    });

    it('should handle models returning strings', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const model = vi.fn(() => 'hello world') as unknown as Model;

        model.displayName = 'stringModel';

        const result = await context.request(model, {test: 1});

        expect(model).toBeCalledWith({test: 1}, expect.anything());
        expect(result).toBe('hello world');
        expect(typeof result).toBe('string');
    });

    it('should handle models returning numbers', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const model = vi.fn(() => 42) as unknown as Model;

        model.displayName = 'numberModel';

        const result = await context.request(model, {test: 1});

        expect(model).toBeCalledWith({test: 1}, expect.anything());
        expect(result).toBe(42);
        expect(typeof result).toBe('number');
    });

    it('should handle models returning booleans', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const model = vi.fn(() => true) as unknown as Model;

        model.displayName = 'booleanModel';

        const result = await context.request(model, {test: 1});

        expect(model).toBeCalledWith({test: 1}, expect.anything());
        expect(result).toBe(true);
        expect(typeof result).toBe('boolean');
    });

    it('should memoize models returning arrays', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const model = vi.fn(() => [1, 2, 3]) as unknown as Model;

        model.displayName = 'arrayModel';

        const result1 = await context.request(model, {test: 1});
        const result2 = await context.request(model, {test: 1});

        expect(model).toHaveBeenCalledTimes(1);
        expect(result1 === result2).toBe(true);
        expect(result1).toEqual([1, 2, 3]);
    });

    it('should memoize models returning primitives', async () => {
        const registry = new Map();
        const context = withModels(registry)(new Context('request'));
        const stringModel = vi.fn(() => 'test') as unknown as Model;
        const numberModel = vi.fn(() => 123) as unknown as Model;
        const booleanModel = vi.fn(() => false) as unknown as Model;
        const nullModel = vi.fn(() => null) as unknown as Model;

        stringModel.displayName = 'stringModel';
        numberModel.displayName = 'numberModel';
        booleanModel.displayName = 'booleanModel';
        nullModel.displayName = 'nullModel';

        const str1 = await context.request(stringModel, {test: 1});
        const str2 = await context.request(stringModel, {test: 1});
        const num1 = await context.request(numberModel, {test: 1});
        const num2 = await context.request(numberModel, {test: 1});
        const bool1 = await context.request(booleanModel, {test: 1});
        const bool2 = await context.request(booleanModel, {test: 1});
        const null1 = await context.request(nullModel, {test: 1});
        const null2 = await context.request(nullModel, {test: 1});

        expect(stringModel).toHaveBeenCalledTimes(1);
        expect(numberModel).toHaveBeenCalledTimes(1);
        expect(booleanModel).toHaveBeenCalledTimes(1);
        expect(nullModel).toHaveBeenCalledTimes(1);

        expect(str1 === str2).toBe(true);
        expect(num1 === num2).toBe(true);
        expect(bool1 === bool2).toBe(true);
        expect(null1 === null2).toBe(true);
    });

    describe('ctx.set()', () => {
        it('should return pre-set value via ctx.set()', async () => {
            const registry = new Map();
            const context = withModels(registry)(new Context('request'));
            const model = vi.fn(() => {
                throw new Error('Model should not be called');
            }) as unknown as Model;
            model.displayName = 'preSetModel';

            // Set value via ctx.set()
            context.set(model, {result: 'pre-set value'});

            // Request should return pre-set value
            const result = await context.request(model);
            expect(result).toEqual({result: 'pre-set value'});
            expect(model).not.toHaveBeenCalled();
        });

        it('should memoize pre-set values', async () => {
            const registry = new Map();
            const context = withModels(registry)(new Context('request'));
            const model = vi.fn(() => {
                throw new Error('Model should not be called');
            }) as unknown as Model;
            model.displayName = 'preSetModel';

            context.set(model, {result: 'pre-set value'});

            // Multiple requests should return same value
            const result1 = await context.request(model);
            const result2 = await context.request(model);
            expect(result1).toEqual({result: 'pre-set value'});
            expect(result2).toEqual({result: 'pre-set value'});
            expect(model).not.toHaveBeenCalled();
        });

        it('should share pre-set values across child contexts', async () => {
            const registry = new Map();
            const context = withModels(registry)(new Context('parent'));
            const model = vi.fn(() => {
                throw new Error('Model should not be called');
            }) as unknown as Model;
            model.displayName = 'preSetModel';

            context.set(model, {result: 'pre-set value'});

            const child = context.create('child');
            const result = await child.request(model);
            expect(result).toEqual({result: 'pre-set value'});
            expect(model).not.toHaveBeenCalled();
        });

        it('should support props in ctx.set()', async () => {
            const registry = new Map();
            const context = withModels(registry)(new Context('request'));
            const model = vi.fn(() => {
                throw new Error('Model should not be called');
            }) as unknown as Model;
            model.displayName = 'preSetModel';

            context.set(model, {result: 'value1'}, {id: '1'});
            context.set(model, {result: 'value2'}, {id: '2'});

            const result1 = await context.request(model, {id: '1'});
            const result2 = await context.request(model, {id: '2'});
            expect(result1).toEqual({result: 'value1'});
            expect(result2).toEqual({result: 'value2'});
            expect(model).not.toHaveBeenCalled();
        });

        it('should throw error if value already exists in registry', async () => {
            const registry = new Map();
            const context = withModels(registry)(new Context('request'));
            const model = vi.fn(() => ({result: 'computed'})) as unknown as Model;
            model.displayName = 'testModel';

            // First compute via request
            await context.request(model, {id: '1'});

            // Try to set - should throw
            expect(() => {
                context.set(model, {result: 'pre-set'}, {id: '1'});
            }).toThrow('value already exists in registry');
        });
    });

    describe('cleanUndefined behavior', () => {
        it('should remove undefined values from props before passing to model', async () => {
            const registry = new Map();
            const ctx = withModels(registry)(new Context('test'));

            let receivedProps: any;

            function TestModel(props: {required: string; optional?: string}): string {
                receivedProps = props;
                // This check should not work - optional property should not be in props
                if ('optional' in props) {
                    throw new Error('Optional property should not be present in props');
                }
                return props.required;
            }
            TestModel.displayName = 'TestModel';

            const result = await ctx.request(TestModel, {
                required: 'value',
                optional: undefined as any
            });

            expect(result).toBe('value');
            expect(receivedProps).toEqual({required: 'value'});
            expect('optional' in receivedProps).toBe(false);
        });

        it('should ensure consistent memoization keys for props with undefined values', async () => {
            const registry = new Map();
            const ctx = withModels(registry)(new Context('test'));

            let callCount = 0;

            function TestModel(props: {required: string; optional?: string}): string {
                callCount++;
                return props.required;
            }
            TestModel.displayName = 'TestModel';

            // First call with undefined optional property
            const result1 = await ctx.request(TestModel, {
                required: 'value',
                optional: undefined as any
            });

            // Second call without optional property
            const result2 = await ctx.request(TestModel, {
                required: 'value'
            });

            // Both should return the same result and model should be called only once
            expect(result1).toBe('value');
            expect(result2).toBe('value');
            expect(callCount).toBe(1);
        });

        it('should clean nested undefined values', async () => {
            const registry = new Map();
            const ctx = withModels(registry)(new Context('test'));

            let receivedProps: any;

            function TestModel(props: {nested: {a: string; b?: string}}): string {
                receivedProps = props;
                if ('b' in props.nested) {
                    throw new Error('Optional property should not be present in nested object');
                }
                return props.nested.a;
            }
            TestModel.displayName = 'TestModel';

            const result = await ctx.request(TestModel, {
                nested: {
                    a: 'value',
                    b: undefined as any
                }
            });

            expect(result).toBe('value');
            expect(receivedProps).toEqual({nested: {a: 'value'}});
            expect('b' in receivedProps.nested).toBe(false);
        });
    });
});
