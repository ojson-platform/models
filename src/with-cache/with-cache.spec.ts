import type {WithCacheModel} from './types';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Context} from '../context';
import {InterruptedError, withModels} from '../with-models';
import {compose} from '../utils';

import {CacheFirst} from './cache-strategy';
import {withCache} from './with-cache';
import {TrackingCacheProvider} from './__tests__/cache-provider';

describe('withCache', () => {
  let cache: TrackingCacheProvider;

  function context() {
    const wrap = compose([withModels(new Map()), withCache({default: {ttl: 3600}}, cache)]);

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
  });

  describe('Composition with other wrappers', () => {
    it('should work correctly when composed with additional wrappers', async () => {
      // Simple wrapper that adds a custom field to context
      type WithCustomField<T extends Context> = T & {
        customField: string;
      };

      const withCustomField = <T extends Context>(ctx: T): WithCustomField<T> => {
        return Object.assign(ctx, {
          customField: 'test-value',
        }) as WithCustomField<T>;
      };

      const wrap = compose([
        withModels(new Map()),
        withCache({default: {ttl: 3600}}, cache),
        withCustomField,
      ]);

      const ctx = wrap(new Context('request')) as any;

      // Verify custom field is present
      expect(ctx.customField).toBe('test-value');

      // Verify withModels still works
      const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
      model.displayName = 'model';
      model.cacheStrategy = CacheFirst;

      const result1 = await ctx.request(model, {id: 1});
      expect(result1).toEqual({result: 1});
      expect(model).toBeCalledTimes(1);

      // Verify caching still works
      const ctx2 = wrap(new Context('request')) as any;
      expect(ctx2.customField).toBe('test-value');

      const result2 = await ctx2.request(model, {id: 1});
      expect(result2).toEqual({result: 1});
      expect(model).toBeCalledTimes(1); // Still 1 due to cache

      // Verify cache was used
      expect(cache.get).toHaveBeenCalled();
      expect(cache.set).toHaveBeenCalled();
    });

    it('should preserve all context methods when composed with multiple wrappers', async () => {
      type WithMetadata<T extends Context> = T & {
        metadata: {requestId: string};
      };

      const withMetadata = <T extends Context>(ctx: T): WithMetadata<T> => {
        return Object.assign(ctx, {
          metadata: {requestId: 'req-123'},
        }) as WithMetadata<T>;
      };

      const wrap = compose([
        withModels(new Map()),
        withCache({default: {ttl: 3600}}, cache),
        withMetadata,
      ]);

      const ctx = wrap(new Context('request')) as any;

      // Verify metadata is present
      expect(ctx.metadata.requestId).toBe('req-123');

      // Verify withModels methods are present
      expect(typeof ctx.request).toBe('function');
      expect(typeof ctx.isAlive).toBe('function');
      expect(typeof ctx.kill).toBe('function');
      expect(typeof ctx.create).toBe('function');

      // Verify withCache methods are present
      expect(typeof ctx.disableCache).toBe('function');
      expect(typeof ctx.shouldCache).toBe('function');

      // Verify original context methods are present
      expect(typeof ctx.end).toBe('function');
      expect(typeof ctx.fail).toBe('function');
    });

    it('should handle context lifecycle correctly in composed wrappers', async () => {
      const wrap = compose([withModels(new Map()), withCache({default: {ttl: 3600}}, cache)]);

      const ctx = wrap(new Context('test'));

      // Verify context is alive
      expect(ctx.isAlive()).toBe(true);

      // Verify we can kill context
      ctx.kill();
      expect(ctx.isAlive()).toBe(false);

      // Verify request returns Dead after kill
      const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
      model.displayName = 'model';
      model.cacheStrategy = CacheFirst;

      const result = ctx.request(model, {id: 1});
      await expect(result).rejects.toThrow(InterruptedError);
      expect(model).not.toBeCalled();
    });
  });
});
