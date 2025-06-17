import type {WithCacheModel} from './with-cache';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Context} from '../context';
import {withModels} from '../with-models';
import {withCache} from './with-cache';
import {compose} from '../utils';

import {MemoryCache} from './cache-provider';
import {StaleWhileRevalidate, CacheFirst, CacheOnly, NetworkOnly} from './cache-strategy';

describe('withCache', () => {
    let cache;

    function context() {
        const wrap = compose([
            withModels(new Map()),
            withCache({default: {ttl: 3600}}, cache),
        ]);

        return wrap(new Context('request'));
    }

    describe('CacheFirst', () => {
        beforeEach(() => {
            cache = new MemoryCache();
        });

        afterEach(() => {
            cache.release();
        });

        it('should share cache between contexts', async () => {
            const context1 = context();
            const context2 = context();

            let inc = 1;
            const model = vi.fn(() => {
                return {result: inc++};
            }) as unknown as WithCacheModel;

            model.displayName = 'model';
            model.cacheStrategy = CacheFirst;

            expect(await context1.request(model, {test: 1})).toEqual({result: 1});
            expect(model).toBeCalledTimes(1);

            expect(await context2.request(model, {test: 1})).toEqual({result: 1});
            expect(model).toBeCalledTimes(1);
        });

        it('should skip empty cache', async () => {
            const context1 = context();
            const context2 = context();
            const context3 = context();

            let inc = 1;
            const model = vi.fn(() => {
                return {result: inc++};
            }) as unknown as WithCacheModel;

            model.displayName = 'model';
            model.cacheStrategy = CacheFirst;

            expect(await context1.request(model, {test: 1})).toEqual({result: 1});
            expect(model).toBeCalledTimes(1);

            expect(await context2.request(model, {test: 1})).toEqual({result: 1});
            expect(model).toBeCalledTimes(1);

            cache.release();

            expect(await context3.request(model, {test: 1})).toEqual({result: 2});
            expect(model).toBeCalledTimes(2);
        });
    });
});