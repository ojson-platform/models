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
});