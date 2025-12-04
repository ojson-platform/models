import type {WithCacheModel} from './with-cache';
import type {Key} from '../types';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Context} from '../context';
import {withModels} from '../with-models';
import {withCache} from './with-cache';
import {compose} from '../utils';

import {StaleWhileRevalidate, CacheFirst} from './cache-strategy';
import {TrackingCacheProvider} from './__tests__/cache-provider';

describe('Strategy.with()', () => {
    let cache: TrackingCacheProvider;

    function context() {
        const wrap = compose([
            withModels(new Map()),
            withCache({default: {ttl: 3600}}, cache),
        ]);

        return wrap(new Context('request'));
    }

    beforeEach(() => {
        cache = new TrackingCacheProvider();
    });

    afterEach(() => {
        cache.release();
    });

    it('should accept simple { ttl: number } config for strategy-specific TTL', async () => {
        const ctx = context();

        let inc = 1;
        const model = vi.fn(() => {
            return {result: inc++};
        }) as unknown as WithCacheModel;

        model.displayName = 'model';
        const customTTL = 1800; // 30 minutes
        model.cacheStrategy = StaleWhileRevalidate.with({ ttl: customTTL });

        // First call should execute model and cache result
        const result1 = await ctx.request(model, {test: 1});
        expect(result1).toEqual({result: 1});
        expect(model).toBeCalledTimes(1);

        // Check that value was cached with correct TTL
        const cacheKey = `model;test=1` as Key;
        expect(cache.set).toHaveBeenCalledWith(cacheKey, {result: 1}, customTTL);

        // Second call should return cached value
        const result2 = await ctx.request(model, {test: 1});
        expect(result2).toEqual({result: 1});
        
        // Background update starts asynchronously for StaleWhileRevalidate
        // Wait for it to complete
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Background update calls model second time and updates cache
        expect(model).toBeCalledTimes(2);
        // Check that all cache.set calls use correct TTL
        expect(cache.set).toHaveBeenCalledWith(cacheKey, {result: 1}, customTTL);
        expect(cache.set).toHaveBeenCalledWith(cacheKey, {result: 2}, customTTL);
    });

    it('should work with CacheFirst strategy using simple { ttl: number }', async () => {
        const ctx = context();

        let inc = 1;
        const model = vi.fn(() => {
            return {result: inc++};
        }) as unknown as WithCacheModel;

        model.displayName = 'model';
        const customTTL = 2400; // 40 minutes
        model.cacheStrategy = CacheFirst.with({ ttl: customTTL });

        // First call should execute model and cache result
        const result1 = await ctx.request(model, {test: 1});
        expect(result1).toEqual({result: 1});
        expect(model).toBeCalledTimes(1);

        // Check that value was cached with correct TTL
        const cacheKey = `model;test=1` as Key;
        expect(cache.set).toHaveBeenCalledWith(cacheKey, {result: 1}, customTTL);

        // Second call should return cached value
        const result2 = await ctx.request(model, {test: 1});
        expect(result2).toEqual({result: 1});
        expect(model).toBeCalledTimes(1);

        // Check that there was only one set call with correct TTL
        expect(cache.set).toHaveBeenCalledTimes(1);
        expect(cache.set).toHaveBeenCalledWith(cacheKey, {result: 1}, customTTL);
    });

    it('should use different TTL for different strategies', async () => {
        const ctx = context();

        let inc = 1;
        const model1 = vi.fn(() => ({result: inc++})) as unknown as WithCacheModel;
        model1.displayName = 'model1';
        model1.cacheStrategy = CacheFirst.with({ ttl: 1800 });

        const model2 = vi.fn(() => ({result: inc++})) as unknown as WithCacheModel;
        model2.displayName = 'model2';
        model2.cacheStrategy = StaleWhileRevalidate.with({ ttl: 7200 });

        await ctx.request(model1, {id: 1});
        await ctx.request(model2, {id: 2});

        // Check that each model was cached with correct TTL
        expect(cache.set).toHaveBeenCalledWith('model1;id=1' as Key, expect.anything(), 1800);
        expect(cache.set).toHaveBeenCalledWith('model2;id=2' as Key, expect.anything(), 7200);
    });
});

