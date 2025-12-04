import type {WithCacheModel} from './with-cache';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Context} from '../context';
import {withModels} from '../with-models';
import {withCache} from './with-cache';
import {compose} from '../utils';

import {CacheFirst, StaleWhileRevalidate} from './cache-strategy';
import {TrackingCacheProvider} from './__tests__/cache-provider';
import {Cache} from './cache';

describe('withCache', () => {
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

    describe('general caching behavior', () => {
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

        it('should return cached value without calling model on cache hit', async () => {
            const ctx1 = context();
            const ctx2 = context();

            let inc = 1;
            const model = vi.fn(() => {
                return {result: inc++};
            }) as unknown as WithCacheModel;

            model.displayName = 'model';
            model.cacheStrategy = CacheFirst;

            // First call in first context - cache miss, model executes
            const result1 = await ctx1.request(model, {id: 1});
            expect(result1).toEqual({result: 1});
            expect(model).toBeCalledTimes(1);
            expect(cache.set).toHaveBeenCalledTimes(1);

            // Second call in second context - cache hit, model not called
            // Use different context to avoid withModels memoization and test real caching
            const result2 = await ctx2.request(model, {id: 1});
            expect(result2).toEqual({result: 1});
            expect(model).toBeCalledTimes(1); // Model not called again
            expect(cache.set).toHaveBeenCalledTimes(1); // Cache not updated
        });

        it('should create different cache keys for different props', async () => {
            const ctx1 = context();
            const ctx2 = context();
            const ctx3 = context();

            let inc = 1;
            const model = vi.fn((props: any) => {
                return {result: inc++, id: props.id};
            }) as unknown as WithCacheModel;

            model.displayName = 'model';
            model.cacheStrategy = CacheFirst;

            // Calls with different props in first context
            const result1 = await ctx1.request(model, {id: 1});
            const result2 = await ctx1.request(model, {id: 2});

            expect(result1).toEqual({result: 1, id: 1});
            expect(result2).toEqual({result: 2, id: 2});
            expect(model).toBeCalledTimes(2); // Each props calls the model

            // Repeated calls in other contexts use cache
            // Use different contexts to avoid withModels memoization and test real caching
            const result1Cached = await ctx2.request(model, {id: 1});
            const result2Cached = await ctx3.request(model, {id: 2});

            expect(result1Cached).toEqual({result: 1, id: 1});
            expect(result2Cached).toEqual({result: 2, id: 2});
            expect(model).toBeCalledTimes(2); // Model no longer called
        });

        it('should not use cache strategy when cache is disabled', async () => {
            const ctx = context();

            let inc = 1;
            const model = vi.fn(() => {
                return {result: inc++};
            }) as unknown as WithCacheModel;

            model.displayName = 'model';
            model.cacheStrategy = CacheFirst;

            // Disable cache BEFORE first request
            ctx.disableCache();

            // First call - strategy not used, result not cached via cache.set
            const result1 = await ctx.request(model, {test: 1});
            expect(result1).toEqual({result: 1});
            expect(model).toBeCalledTimes(1);
            expect(cache.set).toHaveBeenCalledTimes(0); // Result not cached via cache

            // Second call in same context - uses withModels memoization
            const result2 = await ctx.request(model, {test: 1});
            expect(result2).toEqual({result: 1}); // Memoized via withModels
            expect(model).toBeCalledTimes(1);
            expect(cache.set).toHaveBeenCalledTimes(0); // Result not cached via cache
        });


        it('should not cache result when model throws error', async () => {
            const ctx = context();

            const error = new Error('Model error');
            const model = vi.fn(() => {
                throw error;
            }) as unknown as WithCacheModel;

            model.displayName = 'model';
            model.cacheStrategy = CacheFirst;

            // Model throws error
            await expect(ctx.request(model, {test: 1})).rejects.toThrow('Model error');

            // Error should not be cached
            expect(cache.set).toHaveBeenCalledTimes(0);

            // Error should repeat on second call
            await expect(ctx.request(model, {test: 1})).rejects.toThrow('Model error');
            expect(model).toBeCalledTimes(2);
        });

        it('should call cache.get on cache hit and cache.set on cache miss', async () => {
            const ctx1 = context();
            const ctx2 = context();

            let inc = 1;
            const model = vi.fn(() => {
                return {result: inc++};
            }) as unknown as WithCacheModel;

            model.displayName = 'model';
            model.cacheStrategy = CacheFirst;

            // Clear mocks before test
            (cache.get as ReturnType<typeof vi.fn>).mockClear();
            (cache.set as ReturnType<typeof vi.fn>).mockClear();

            // First call in first context - cache miss
            await ctx1.request(model, {test: 1});
            expect(cache.get).toHaveBeenCalled();
            expect(cache.set).toHaveBeenCalledTimes(1);

            // Clear mocks
            (cache.get as ReturnType<typeof vi.fn>).mockClear();
            (cache.set as ReturnType<typeof vi.fn>).mockClear();

            // Second call in second context - cache hit
            // Use different context to avoid withModels memoization and test real caching
            await ctx2.request(model, {test: 1});
            expect(cache.get).toHaveBeenCalled();
            expect(cache.set).not.toHaveBeenCalled(); // cache.set not called on cache hit
        });
    });

    describe('StaleWhileRevalidate', () => {
        it('should execute model and cache result on cache miss', async () => {
            const ctx = context();

            let inc = 1;
            const model = vi.fn(() => {
                return {result: inc++};
            }) as unknown as WithCacheModel;

            model.displayName = 'model';
            model.cacheStrategy = StaleWhileRevalidate;

            // First call - cache miss, model executes
            const result1 = await ctx.request(model, {id: 1});
            expect(result1).toEqual({result: 1});
            expect(model).toBeCalledTimes(1);
            expect(cache.set).toHaveBeenCalledTimes(1);
        });

        it('should return cached value immediately on cache hit', async () => {
            const ctx1 = context();
            const ctx2 = context();

            let inc = 1;
            const model = vi.fn(() => {
                return {result: inc++};
            }) as unknown as WithCacheModel;

            model.displayName = 'model';
            model.cacheStrategy = StaleWhileRevalidate;

            // First call in first context - cache miss
            const result1 = await ctx1.request(model, {id: 1});
            expect(result1).toEqual({result: 1});
            expect(model).toBeCalledTimes(1);
            expect(cache.set).toHaveBeenCalledTimes(1);

            // Second call in second context - cache hit, should return stale value immediately
            // Use different context to avoid withModels memoization and test real caching
            const result2 = await ctx2.request(model, {id: 1});
            expect(result2).toEqual({result: 1}); // Cached value returned immediately
            
            // Background update starts asynchronously in background
            // Wait for it to complete to check final call count
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Final check: model called 2 times
            // 1 time on cache miss + 1 time in background update on cache hit
            expect(model).toBeCalledTimes(2);
        });

        it('should trigger background update on cache hit', async () => {
            const ctx1 = context();
            const ctx2 = context();

            let inc = 1;
            const model = vi.fn(() => {
                return {result: inc++};
            }) as unknown as WithCacheModel;

            model.displayName = 'model';
            model.cacheStrategy = StaleWhileRevalidate;

            // First call in first context - cache miss, saves {result: 1}
            await ctx1.request(model, {id: 1});
            expect(model).toBeCalledTimes(1);
            expect(cache.set).toHaveBeenCalledTimes(1);

            // Clear mocks before second call
            (cache.set as ReturnType<typeof vi.fn>).mockClear();

            // Second call in second context - cache hit
            // Use different context to avoid withModels memoization and test real caching
            const result2 = await ctx2.request(model, {id: 1});
            expect(result2).toEqual({result: 1}); // Stale value returned immediately

            // Background update should start asynchronously via cache.update()
            // cache.update() creates a new context and calls the model, then saves via cache.set()
            // Give time for background update to complete
            await new Promise(resolve => setTimeout(resolve, 10));

            // After background update there should be another cache.set call with new value
            expect(cache.set).toHaveBeenCalled();
            expect(model).toBeCalledTimes(2); // Model called second time in background update
        });

        it('should not perform background update when cache is disabled', async () => {
            const ctx = context();

            let inc = 1;
            const model = vi.fn(() => {
                return {result: inc++};
            }) as unknown as WithCacheModel;

            model.displayName = 'model';
            model.cacheStrategy = StaleWhileRevalidate;

            // First call with cache enabled
            await ctx.request(model, {id: 1});
            expect(model).toBeCalledTimes(1);
            expect(cache.set).toHaveBeenCalledTimes(1);

            // Disable cache
            ctx.disableCache();

            // Clear mocks
            (cache.get as ReturnType<typeof vi.fn>).mockClear();
            (cache.set as ReturnType<typeof vi.fn>).mockClear();

            // Second call with cache disabled
            // withModels memoization still works in the same context
            const result = await ctx.request(model, {id: 1});
            expect(result).toEqual({result: 1});
            expect(model).toBeCalledTimes(1); // Model not called (memoization)
            expect(cache.set).not.toHaveBeenCalled(); // Cache not updated, strategy not applied
        });

        it('should work with custom TTL via with() method', async () => {
            const ctx = context();

            let inc = 1;
            const model = vi.fn(() => {
                return {result: inc++};
            }) as unknown as WithCacheModel;

            model.displayName = 'model';
            const customTTL = 1800; // 30 minutes
            model.cacheStrategy = StaleWhileRevalidate.with({ttl: customTTL});

            // First call - cache miss
            await ctx.request(model, {id: 1});
            expect(cache.set).toHaveBeenCalledWith(
                'model;id=1' as any,
                {result: 1},
                customTTL
            );
        });

        it('should create different cache keys for different props', async () => {
            const ctx1 = context();
            const ctx2 = context();
            const ctx3 = context();

            let inc = 1;
            const model = vi.fn((props: any) => {
                return {result: inc++, id: props.id};
            }) as unknown as WithCacheModel;

            model.displayName = 'model';
            model.cacheStrategy = StaleWhileRevalidate;

            // Calls with different props in first context (cache miss)
            await ctx1.request(model, {id: 1});
            await ctx1.request(model, {id: 2});

            expect(model).toBeCalledTimes(2);

            // Repeated calls in other contexts use cache
            // Use different contexts to avoid withModels memoization and test real caching
            const result1 = await ctx2.request(model, {id: 1});
            const result2 = await ctx3.request(model, {id: 2});

            expect(result1).toEqual({result: 1, id: 1});
            expect(result2).toEqual({result: 2, id: 2});
            
            // Background update starts asynchronously for each cache hit
            // Wait for background updates to complete
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Model called 2 more times in background update (once for each props)
            expect(model).toBeCalledTimes(4);
        });

        it('should return stale value even if background update fails', async () => {
            const ctx1 = context();
            const ctx2 = context();
            const ctx3 = context();

            const error = new Error('Background update error');
            const model = vi.fn()
                .mockReturnValueOnce({result: 1})
                .mockImplementationOnce(() => {
                    // Model fails with error during background update
                    throw error;
                }) as unknown as WithCacheModel;

            model.displayName = 'model';
            model.cacheStrategy = StaleWhileRevalidate;

            // First call in first context - cache miss, saves {result: 1}
            const result1 = await ctx1.request(model, {id: 1});
            expect(result1).toEqual({result: 1});
            expect(model).toBeCalledTimes(1);

            // Second call in second context - cache hit, returns stale value immediately
            // Use different context to avoid withModels memoization and test real caching
            // Background update starts and fails with error, but this should not affect the result
            const result2 = await ctx2.request(model, {id: 1});
            expect(result2).toEqual({result: 1}); // Stale value returned successfully

            // Wait for background update to complete (which should fail)
            await new Promise(resolve => setTimeout(resolve, 10));

            // Model should have been called in background update (and failed)
            expect(model).toBeCalledTimes(2);

            // On next request in third context, stale value is still returned
            // (background update did not update cache due to error)
            const result3 = await ctx3.request(model, {id: 1});
            expect(result3).toEqual({result: 1});
        });
    });

    describe('Cache.update()', () => {
        it('should deduplicate parallel updates for the same model and props', async () => {
            const cacheProvider = new TrackingCacheProvider();
            const cache = new Cache({default: {ttl: 3600}}, cacheProvider);

            let callCount = 0;
            const model = vi.fn(() => {
                callCount++;
                return {result: callCount};
            }) as unknown as WithCacheModel;

            model.displayName = 'model';

            // Start multiple parallel updates for the same model and props
            const update1 = cache.update(model, {id: 1}, 3600);
            const update2 = cache.update(model, {id: 1}, 3600);
            const update3 = cache.update(model, {id: 1}, 3600);

            // All promises should resolve
            await Promise.all([update1, update2, update3]);

            // Model should be called only once (not three times)
            expect(model).toBeCalledTimes(1);

            // Cache should be set once
            expect(cacheProvider.set).toHaveBeenCalledTimes(1);

            cacheProvider.release();
        });

        it('should allow parallel updates for different models or props', async () => {
            const cacheProvider = new TrackingCacheProvider();
            const cache = new Cache({default: {ttl: 3600}}, cacheProvider);

            let callCount1 = 0;
            const model1 = vi.fn(() => {
                callCount1++;
                return {result: callCount1};
            }) as unknown as WithCacheModel;
            model1.displayName = 'model1';

            let callCount2 = 0;
            const model2 = vi.fn(() => {
                callCount2++;
                return {result: callCount2};
            }) as unknown as WithCacheModel;
            model2.displayName = 'model2';

            // Start parallel updates for different models and props
            const update1 = cache.update(model1, {id: 1}, 3600);
            const update2 = cache.update(model1, {id: 2}, 3600);
            const update3 = cache.update(model2, {id: 1}, 3600);

            // All promises should resolve
            await Promise.all([update1, update2, update3]);

            // Each model should be called for each unique key
            expect(model1).toBeCalledTimes(2); // Different props: {id: 1} and {id: 2}
            expect(model2).toBeCalledTimes(1); // Different model

            // Cache should be set for each unique key
            expect(cacheProvider.set).toHaveBeenCalledTimes(3);

            cacheProvider.release();
        });
    });

});