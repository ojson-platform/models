import type {BaseContext} from '../context';
import type {Model, OJson, Json} from '../types';
import type {Request, WithModels} from '../with-models';
import type {Cache} from './cache';
import type {CacheConfig, CacheStrategy, WithCache} from './types';

import {get} from 'lodash-es';

import {isEmptyValue, getProviderName, setValue, getValue} from './utils';

/**
 * Function type that resolves a cache strategy into a request handler.
 * Takes cache configuration, cache instance, and base request function,
 * and returns a new request function that implements the strategy.
 *
 * @internal
 */
type StrategyResolver = (config: CacheConfig, cache: Cache, request: Request) => Request;

/**
 * Factory function that creates a cache strategy.
 *
 * @internal
 */
const Strategy = (displayName: string, call: StrategyResolver): CacheStrategy => {
  const strategy = Object.assign(call.bind(undefined), {
    displayName,
    config: {} as CacheConfig,
    with: (config: CacheConfig[keyof CacheConfig]) => {
      // Wrap the TTL config in strategy-specific config
      const wrappedConfig: CacheConfig = {
        [displayName]: config,
      } as CacheConfig;
      return Object.assign(call.bind(undefined), strategy, {config: wrappedConfig});
    },
  });

  return strategy;
};

/**
 * Extracts the TTL (time-to-live) value for a strategy from the configuration.
 *
 * @internal
 */
const getTTL = (displayName: string, config: CacheConfig) => {
  const ttl = get(config, `${displayName}.ttl`, get(config, `default.ttl`));

  if (typeof ttl !== 'number') {
    throw new TypeError(`TTL for "${displayName}" strategy is not configured`);
  }

  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw new Error(`TTL for "${displayName}" strategy must be a positive number`);
  }

  return ttl;
};

/**
 * Extracts the zip flag for a strategy from the configuration.
 * Returns `false` if not configured.
 *
 * @internal
 */
const getZip = (displayName: string, config: CacheConfig): boolean => {
  const zip = get(config, `${displayName}.zip`, get(config, `default.zip`, false));
  return Boolean(zip);
};

/**
 * Cache strategy that only reads from cache, never executes the model.
 * Returns `undefined` if the value is not in cache or has expired.
 *
 * Useful for:
 * - Serving pre-computed data
 * - Ensuring data is always cached before use
 * - Testing cache availability
 *
 * @example
 * ```typescript
 * MyModel.cacheStrategy = CacheOnly;
 * const result = await ctx.request(MyModel);
 * // result is undefined if not cached
 * ```
 */
export const CacheOnly = Strategy('cache-only', (config, cache) => {
  const zip = getZip('cache-only', config as CacheConfig);
  return async function (
    this: WithCache<WithModels<BaseContext>>,
    model: Model,
    props: OJson,
  ): Promise<Json | undefined> {
    const key = cache.key(model, props);
    return getValue(cache, key, zip);
  };
});

/**
 * Cache strategy that always executes the model, never uses cache.
 * Bypasses cache entirely, executing the model directly.
 *
 * Useful for:
 * - Real-time data that should never be cached
 * - Bypassing stale cache
 * - Testing model execution without caching
 *
 * @example
 * ```typescript
 * MyModel.cacheStrategy = NetworkOnly;
 * const result = await ctx.request(MyModel);
 * // Always executes the model, never reads from cache
 * ```
 */
export const NetworkOnly = Strategy('network-only', (_config, _cache, request) => {
  return async function (
    this: WithCache<WithModels<BaseContext>>,
    model: Model,
    props: OJson,
  ): Promise<Json> {
    return request.call(this, model, props);
  };
});

/**
 * Cache strategy that checks cache first, falls back to network if cache miss.
 *
 * Behavior:
 * 1. Checks cache first
 * 2. If cache hit: returns cached value immediately
 * 3. If cache miss: executes model, stores result in cache, returns result
 *
 * This is the most common caching strategy, providing fast responses
 * for cached data while ensuring fresh data is available when needed.
 *
 * Requires TTL configuration (either in strategy config or default):
 * ```typescript
 * const config = {
 *   default: { ttl: 3600 }, // or strategy-specific
 *   'cache-first': { ttl: 1800 }
 * };
 * ```
 *
 * @example
 * ```typescript
 * MyModel.cacheStrategy = CacheFirst.with({ ttl: 1800 }); // 30 minutes
 *
 * // First call: executes model, stores in cache
 * const result1 = await ctx.request(MyModel, { id: 123 });
 *
 * // Second call: returns from cache
 * const result2 = await ctx.request(MyModel, { id: 123 });
 *
 * // With compression enabled (reduces memory usage in Redis)
 * MyModel.cacheStrategy = CacheFirst.with({ ttl: 1800, zip: true });
 *
 * // Use default TTL with compression
 * MyModel.cacheStrategy = CacheFirst.with({ zip: true });
 * ```
 */
export const CacheFirst = Strategy('cache-first', (config, cache, request) => {
  const ttl = getTTL('cache-first', config as CacheConfig);
  const zip = getZip('cache-first', config as CacheConfig);
  const fromCache = CacheOnly(config, cache, request);
  const fromNetwork = NetworkOnly(config, cache, request);
  const providerName = getProviderName(cache.provider);

  return async function (
    this: WithCache<WithModels<BaseContext>>,
    model: Model,
    props: OJson,
  ): Promise<Json> {
    const cachedResult = await fromCache.call(this, model, props);

    if (isEmptyValue(cachedResult)) {
      this.event('cache.miss', {
        strategy: 'cache-first',
        provider: providerName,
      });

      const key = cache.key(model, props);
      const value: Json = await fromNetwork.call(this, model, props);

      // Cache the value if caching is enabled
      if (this.shouldCache()) {
        // Ignore cache set errors - background operation should not block response
        setValue(cache, key, value, ttl, zip).catch(() => {
          // Cache set failures are non-critical for cache-first strategy
        });

        this.event('cache.update', {
          strategy: 'cache-first',
          provider: providerName,
        });
      }

      return value;
    }

    this.event('cache.hit', {
      strategy: 'cache-first',
      provider: providerName,
    });
    return cachedResult as Json;
  };
});

/**
 * Cache strategy that serves stale data immediately while revalidating in background.
 *
 * Behavior:
 * 1. Checks cache first
 * 2. If cache hit: returns cached value immediately, then updates cache in background
 * 3. If cache miss: executes model, stores result in cache, returns result
 *
 * This strategy provides the best user experience by:
 * - Serving data instantly from cache (even if stale)
 * - Keeping cache fresh by updating in background
 * - Avoiding user-visible delays from cache updates
 *
 * Ideal for:
 * - Frequently accessed data that can tolerate slight staleness
 * - High-traffic scenarios where freshness matters but speed is critical
 * - Data that changes infrequently but needs to stay reasonably up-to-date
 *
 * Requires TTL configuration (either in strategy config or default):
 * ```typescript
 * const config = {
 *   default: { ttl: 3600 }, // or strategy-specific
 *   'stale-while-revalidate': { ttl: 7200 }
 * };
 * ```
 *
 * @example
 * ```typescript
 * MyModel.cacheStrategy = StaleWhileRevalidate.with({ ttl: 3600 }); // 1 hour
 *
 * // First call: executes model, stores in cache, returns result
 * const result1 = await ctx.request(MyModel, { id: 123 });
 *
 * // Second call: returns cached value immediately,
 * // then updates cache in background for next time
 * const result2 = await ctx.request(MyModel, { id: 123 });
 *
 * // With compression enabled (reduces memory usage in Redis)
 * MyModel.cacheStrategy = StaleWhileRevalidate.with({ ttl: 3600, zip: true });
 *
 * // Use default TTL with compression
 * MyModel.cacheStrategy = StaleWhileRevalidate.with({ zip: true });
 * ```
 */
export const StaleWhileRevalidate = Strategy('stale-while-revalidate', (config, cache, request) => {
  const ttl = getTTL('stale-while-revalidate', config as CacheConfig);
  const zip = getZip('stale-while-revalidate', config as CacheConfig);
  const fromCache = CacheOnly(config, cache, request);
  const fromNetwork = NetworkOnly(config, cache, request);
  const providerName = getProviderName(cache.provider);

  return async function (
    this: WithCache<WithModels<BaseContext>>,
    model: Model,
    props: OJson,
  ): Promise<Json> {
    const cachedResult = await fromCache.call(this, model, props);

    if (isEmptyValue(cachedResult)) {
      this.event('cache.miss', {
        strategy: 'stale-while-revalidate',
        provider: providerName,
      });

      const key = cache.key(model, props);
      const value: Json = await fromNetwork.call(this, model, props);

      // Cache the value if caching is enabled
      if (this.shouldCache()) {
        // Ignore cache set errors - background operation should not block response
        setValue(cache, key, value, ttl, zip).catch(() => {
          // Cache set failures are non-critical for stale-while-revalidate strategy
        });

        this.event('cache.update', {
          strategy: 'stale-while-revalidate',
          provider: providerName,
          ttl,
        });
      }

      return value;
    }

    this.event('cache.hit', {
      strategy: 'stale-while-revalidate',
      provider: providerName,
    });

    // Background update - cache.update already handles InterruptedError internally
    if (this.shouldCache()) {
      // Ignore cache update errors - background operation should not block response
      cache.update(model, props, {ttl, zip}).catch(() => {
        // Cache update failures are non-critical for stale-while-revalidate strategy
      });
      this.event('cache.update', {
        strategy: 'stale-while-revalidate',
        provider: providerName,
        ttl,
      });
    }

    return cachedResult as Json;
  };
});
