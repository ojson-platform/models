import type {Key} from '../types';
import type {CacheConfig, WithCacheModel} from './types';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Context} from '../context';
import {InterruptedError, withModels} from '../with-models';
import {compose} from '../utils';

import {StaleWhileRevalidate, CacheFirst, CacheOnly, NetworkOnly} from './cache-strategy';
import {withCache} from './with-cache';
import {TrackingCacheProvider} from './__tests__/cache-provider';

describe('Strategy.with()', () => {
  let cache: TrackingCacheProvider;

  function context() {
    const wrap = compose([
      withModels(new Map()),
      withCache({default: {ttl: 3600}}, cache, (name: string) =>
        withModels(new Map())(new Context(name)),
      ),
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
    model.cacheStrategy = StaleWhileRevalidate.with({ttl: customTTL});

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
    model.cacheStrategy = CacheFirst.with({ttl: customTTL});

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
    model1.cacheStrategy = CacheFirst.with({ttl: 1800});

    const model2 = vi.fn(() => ({result: inc++})) as unknown as WithCacheModel;
    model2.displayName = 'model2';
    model2.cacheStrategy = StaleWhileRevalidate.with({ttl: 7200});

    await ctx.request(model1, {id: 1});
    await ctx.request(model2, {id: 2});

    // Check that each model was cached with correct TTL
    expect(cache.set).toHaveBeenCalledWith('model1;id=1' as Key, expect.anything(), 1800);
    expect(cache.set).toHaveBeenCalledWith('model2;id=2' as Key, expect.anything(), 7200);
  });

  it('should throw error when TTL is missing in config', async () => {
    const wrap = compose([
      withModels(new Map()),
      // No TTL configured for cache-first or default
      withCache({} as CacheConfig, cache, (name: string) =>
        withModels(new Map())(new Context(name)),
      ),
    ]);

    const ctx = wrap(new Context('request'));

    const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
    model.displayName = 'model';
    model.cacheStrategy = CacheFirst;

    await expect(ctx.request(model, {id: 1})).rejects.toThrow(
      'TTL for "cache-first" strategy is not configured',
    );
  });

  it('should throw error when TTL is not a number', async () => {
    // Create context with invalid TTL type (string instead of number)
    const wrap = compose([
      withModels(new Map()),
      withCache(
        {default: {ttl: 'invalid' as unknown as number}} as CacheConfig,
        cache,
        (name: string) => withModels(new Map())(new Context(name)),
      ),
    ]);
    const ctx = wrap(new Context('request'));

    const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
    model.displayName = 'model';
    // Use strategy without .with() to rely on config TTL
    model.cacheStrategy = CacheFirst;

    await expect(ctx.request(model, {id: 1})).rejects.toThrow(
      'TTL for "cache-first" strategy is not configured',
    );
  });

  it('should throw error when TTL is not positive', async () => {
    const wrap = compose([
      withModels(new Map()),
      withCache({default: {ttl: 0}}, cache, (name: string) =>
        withModels(new Map())(new Context(name)),
      ),
    ]);

    const ctx = wrap(new Context('request'));

    const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
    model.displayName = 'model';
    model.cacheStrategy = CacheFirst.with({ttl: 0});

    await expect(ctx.request(model, {id: 1})).rejects.toThrow(
      'TTL for "cache-first" strategy must be a positive number',
    );
  });
});

describe('Cache strategies behavior', () => {
  let cache: TrackingCacheProvider;

  function context() {
    const wrap = compose([
      withModels(new Map()),
      withCache({default: {ttl: 3600}}, cache, (name: string) =>
        withModels(new Map())(new Context(name)),
      ),
    ]);

    return wrap(new Context('request'));
  }

  beforeEach(() => {
    cache = new TrackingCacheProvider();
  });

  afterEach(() => {
    cache.release();
  });

  describe('CacheFirst', () => {
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

    it('should not cache Dead result in CacheFirst strategy', async () => {
      const ctx = context();

      const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;

      model.displayName = 'model';
      model.cacheStrategy = CacheFirst;

      // Kill context before request
      ctx.kill();

      const result = ctx.request(model, {test: 1});

      // Should throw InterruptedError
      await expect(result).rejects.toThrow(InterruptedError);

      // Dead should not be cached
      expect(cache.set).toHaveBeenCalledTimes(0);

      // Model should not be called (execution was interrupted)
      expect(model).not.toBeCalled();
    });

    it('should not cache Dead result when context is killed during execution', async () => {
      const ctx = context();

      const wait = (delay: number) => new Promise(resolve => setTimeout(resolve, delay));

      const model = vi.fn(function* () {
        yield wait(10);
        ctx.kill();
        yield wait(10);

        return {result: 1};
      }) as unknown as WithCacheModel;

      model.displayName = 'model';
      model.cacheStrategy = CacheFirst;

      const result = ctx.request(model, {test: 1});

      // Should throw InterruptedError
      await expect(result).rejects.toThrow(InterruptedError);

      // Dead should not be cached
      expect(cache.set).toHaveBeenCalledTimes(0);

      // Model was called but interrupted
      expect(model).toBeCalled();
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

    it('should execute model without caching when no cacheStrategy is set', async () => {
      const ctx1 = context();
      const ctx2 = context();

      let inc = 1;
      const model = vi.fn(() => {
        return {result: inc++};
      }) as unknown as WithCacheModel;

      model.displayName = 'model';
      // No cacheStrategy set

      // Model should execute without caching
      const result1 = await ctx1.request(model, {id: 1});
      expect(result1).toEqual({result: 1});
      expect(model).toBeCalledTimes(1);
      expect(cache.set).not.toHaveBeenCalled(); // No caching

      // Second call in different context should execute model again
      const result2 = await ctx2.request(model, {id: 1});
      expect(result2).toEqual({result: 2});
      expect(model).toBeCalledTimes(2); // Model called again
      expect(cache.set).not.toHaveBeenCalled(); // Still no caching
    });

    it('should merge strategy config with cache config', async () => {
      const ctx = context();

      const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
      model.displayName = 'model';

      // Strategy with custom TTL should override default
      const customTTL = 1800; // 30 minutes
      model.cacheStrategy = CacheFirst.with({ttl: customTTL});

      // First call should cache with custom TTL
      await ctx.request(model, {id: 1});

      // Check that cache was set with custom TTL (not default 3600)
      const cacheKey = 'model;id=1' as any;
      expect(cache.set).toHaveBeenCalledWith(cacheKey, {result: 1}, customTTL);
      expect(cache.set).not.toHaveBeenCalledWith(cacheKey, expect.anything(), 3600);
    });
  });

  describe('CacheOnly', () => {
    it('should return cached value on cache hit', async () => {
      const ctx1 = context();
      const ctx2 = context();

      const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
      model.displayName = 'model';
      model.cacheStrategy = CacheFirst;

      // First call caches the value
      await ctx1.request(model, {id: 1});
      expect(model).toBeCalledTimes(1);

      // Switch to CacheOnly strategy
      model.cacheStrategy = CacheOnly;

      // Second call in different context should return cached value
      const result = await ctx2.request(model, {id: 1});
      expect(result).toEqual({result: 1});
      expect(model).toBeCalledTimes(1); // Model not called again
    });

    it('should return undefined on cache miss', async () => {
      const ctx = context();

      const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
      model.displayName = 'model';
      model.cacheStrategy = CacheOnly;

      // CacheOnly never executes the model, so result should be undefined
      const result = await ctx.request(model, {id: 1});
      expect(result).toBeUndefined();
      expect(model).toBeCalledTimes(0); // Model never called
    });

    it('should not execute model even if cache is empty', async () => {
      const ctx = context();

      const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
      model.displayName = 'model';
      model.cacheStrategy = CacheOnly;

      // CacheOnly only reads from cache, never executes model
      const result = await ctx.request(model, {id: 1});
      expect(result).toBeUndefined();
      expect(model).toBeCalledTimes(0);
      expect(cache.set).not.toHaveBeenCalled();
    });
  });

  describe('NetworkOnly', () => {
    it('should always execute model and ignore cache', async () => {
      const ctx1 = context();
      const ctx2 = context();

      let inc = 1;
      const model = vi.fn(() => ({result: inc++})) as unknown as WithCacheModel;
      model.displayName = 'model';
      model.cacheStrategy = CacheFirst;

      // First call caches the value
      await ctx1.request(model, {id: 1});
      expect(model).toBeCalledTimes(1);
      expect(cache.set).toHaveBeenCalledTimes(1);

      // Switch to NetworkOnly strategy
      model.cacheStrategy = NetworkOnly;

      // Clear cache.set mocks
      (cache.set as ReturnType<typeof vi.fn>).mockClear();

      // Second call should execute model again (ignore cache)
      const result = await ctx2.request(model, {id: 1});
      expect(result).toEqual({result: 2});
      expect(model).toBeCalledTimes(2); // Model called again
      expect(cache.set).not.toHaveBeenCalled(); // NetworkOnly doesn't cache
    });

    it('should not read from cache', async () => {
      const ctx1 = context();
      const ctx2 = context();

      let inc = 1;
      const model = vi.fn(() => ({result: inc++})) as unknown as WithCacheModel;
      model.displayName = 'model';
      model.cacheStrategy = CacheFirst;

      // First call caches the value
      await ctx1.request(model, {id: 1});
      expect(model).toBeCalledTimes(1);

      // Switch to NetworkOnly
      model.cacheStrategy = NetworkOnly;

      // Clear mocks
      (cache.get as ReturnType<typeof vi.fn>).mockClear();

      // Second call should execute model (not read from cache)
      const result = await ctx2.request(model, {id: 1});
      expect(result).toEqual({result: 2}); // New value, not cached value
      expect(model).toBeCalledTimes(2);
      // Note: NetworkOnly might still call cache.get internally, but result should be from model
    });

    it('should not write to cache', async () => {
      const ctx = context();

      const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
      model.displayName = 'model';
      model.cacheStrategy = NetworkOnly;

      await ctx.request(model, {id: 1});
      expect(model).toBeCalledTimes(1);
      expect(cache.set).not.toHaveBeenCalled(); // NetworkOnly never caches
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

    it('should work with custom TTL via with() method for StaleWhileRevalidate', async () => {
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
      expect(cache.set).toHaveBeenCalledWith('model;id=1' as any, {result: 1}, customTTL);
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
      const model = vi
        .fn()
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

    it('should not cache Dead result on cache miss', async () => {
      const ctx = context();

      const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;

      model.displayName = 'model';
      model.cacheStrategy = StaleWhileRevalidate;

      // Kill context before request
      ctx.kill();

      const result = ctx.request(model, {test: 1});

      // Should throw InterruptedError
      await expect(result).rejects.toThrow(InterruptedError);

      // Dead should not be cached
      expect(cache.set).toHaveBeenCalledTimes(0);

      // Model should not be called (execution was interrupted)
      expect(model).not.toBeCalled();
    });
  });
});
