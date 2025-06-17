import type { Model } from '../types';

import {describe, expect, it, vi} from 'vitest';

import {Context} from '../context';
import {withModels} from '../with-models';
import {compose} from '../utils';

import {withOverrides} from './with-overrides';

describe('withOverrides', () => {
    it('should override single model', async () => {
        const model1 = vi.fn(() => ({result: 1})) as unknown as Model;
        const model2 = vi.fn(() => ({result: 2})) as unknown as Model;

        model1.displayName = 'model1';
        model2.displayName = 'model2';

        const overrides = new Map([[model1, model2]]);
        const wrap = compose([
            withModels(new Map()),
            withOverrides(overrides),
        ]);

        const context = wrap(new Context('request'));

        expect(await context.request(model1, {test: 1})).toEqual({result: 2});
        expect(model1).toBeCalledTimes(0);
        expect(model2).toBeCalledTimes(1);
    });

    it('should sequentially override models', async () => {
        const model1 = vi.fn(() => ({result: 1})) as unknown as Model;
        const model2 = vi.fn(() => ({result: 2})) as unknown as Model;
        const model3 = vi.fn(() => ({result: 3})) as unknown as Model;

        model1.displayName = 'model1';
        model2.displayName = 'model2';
        model3.displayName = 'model3';

        const overrides = new Map([
            [model1, model2],
            [model2, model3],
        ]);
        const wrap = compose([
            withModels(new Map()),
            withOverrides(overrides),
        ]);

        const context = wrap(new Context('request'));

        expect(await context.request(model1, {test: 1})).toEqual({result: 3});
        expect(await context.request(model2, {test: 2})).toEqual({result: 3});
        expect(await context.request(model3, {test: 3})).toEqual({result: 3});
        expect(model1).toBeCalledTimes(0);
        expect(model2).toBeCalledTimes(0);
        expect(model3).toBeCalledTimes(3);
    });

    it('should memoize overriden model', async () => {
        const model1 = vi.fn(() => ({result: 1})) as unknown as Model;
        const model2 = vi.fn(() => ({result: 2})) as unknown as Model;
        const model3 = vi.fn(() => ({result: 3})) as unknown as Model;

        model1.displayName = 'model1';
        model2.displayName = 'model2';
        model3.displayName = 'model3';

        const overrides = new Map([
            [model1, model2],
            [model2, model3],
        ]);
        const wrap = compose([
            withModels(new Map()),
            withOverrides(overrides),
        ]);

        const context = wrap(new Context('request'));

        expect(await context.request(model1, {test: 1})).toEqual({result: 3});
        expect(await context.request(model2, {test: 1})).toEqual({result: 3});
        expect(await context.request(model3, {test: 1})).toEqual({result: 3});
        expect(model1).toBeCalledTimes(0);
        expect(model2).toBeCalledTimes(0);
        expect(model3).toBeCalledTimes(1);
    });
});