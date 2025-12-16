/* eslint-disable new-cap */
import type {Model, OJson, Json} from '../types';
import type {BaseContext} from '../context';
import type {Request, WithModels} from '../with-models';
import type {Cache, CacheConfig, CacheProvider} from './cache';
import type {WithCache} from './with-cache';

import {get} from 'lodash-es';
/**
 * Helper function to check if a value is empty (undefined).
 * Used to determine cache misses.
 * 
 * @internal
 */
const isEmptyValue = (target: any): target is undefined => target === undefined;

/**
 * Gets the name of a cache provider for logging purposes.
 * Attempts to get constructor name, falls back to 'unknown'.
 * 
 * @internal
 */
const getProviderName = (provider: CacheProvider): string => {
    if (provider && typeof provider === 'object' && provider.displayName) {
        return provider.displayName;
    }

    return 'unknown';
};

/**
 * Function type that resolves a cache strategy into a request handler.
 * Takes cache configuration, cache instance, and base request function,
 * and returns a new request function that implements the strategy.
 * 
 * @internal
 */
type StrategyResolver = {
    (config: CacheConfig, cache: Cache, request: Request): Request;
};

/**
 * Cache strategy type that defines how models interact with the cache.
 * 
 * A cache strategy:
 * - Has a unique `displayName` for identification
 * - Has a `config` object with TTL settings
 * - Can be configured with custom TTL via `with()` method
 * - Resolves to a request handler function that implements the caching logic
 * 
 * @example
 * ```typescript
 * // Use default strategy
 * MyModel.cacheStrategy = CacheFirst;
 * 
 * // Use strategy with custom TTL
 * MyModel.cacheStrategy = CacheFirst.with({ ttl: 1800 });
 * ```
 */
export type CacheStrategy = StrategyResolver & {
    /** Unique name for the strategy (e.g., 'cache-first', 'network-only') */
    displayName: string;
    /** Configuration object with TTL settings for this strategy */
    config: CacheConfig;
    /**
     * Creates a new strategy instance with custom TTL configuration.
     * 
     * The provided config will be automatically applied to this strategy.
     * 
     * @param config - TTL configuration object `{ ttl: number }`
     * @returns New strategy instance with the provided TTL configuration
     * 
     * @example
     * ```typescript
     * MyModel.cacheStrategy = CacheFirst.with({ ttl: 1800 }); // 30 minutes
     * ```
     */
    with(config: CacheConfig[keyof CacheConfig]): CacheStrategy;
};

/**
 * Factory function that creates a cache strategy.
 * 
 * @param displayName - Unique name for the strategy
 * @param call - The resolver function that implements the strategy logic
 * @returns A cache strategy object with the resolver and metadata
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
                [displayName]: config
            } as CacheConfig;
            return Object.assign(call.bind(undefined), strategy, {config: wrappedConfig});
        },
    });

    return strategy;
};

/**
 * Extracts the TTL (time-to-live) value for a strategy from the configuration.
 * Looks for strategy-specific TTL first, then falls back to default TTL.
 * 
 * @param strategy - The cache strategy to get TTL for
 * @param config - The cache configuration object
 * @returns TTL value in seconds
 * @throws {Error} If TTL is not configured for the strategy
 * @throws {Error} If TTL is not a positive number
 * 
 * @internal
 */
const getTTL = (strategy: CacheStrategy, config: CacheConfig) => {
    const ttl = get(config, `${strategy.displayName}.ttl`, get(config, `default.ttl`));

    if (typeof ttl !== 'number') {
        throw new Error(`TTL for "${strategy.displayName}" strategy is not configured`);
    }

    if (!Number.isFinite(ttl) || ttl <= 0) {
        throw new Error(`TTL for "${strategy.displayName}" strategy must be a positive number`);
    }

    return ttl;
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
export const CacheOnly = Strategy('cache-only', (_config, cache) => {
    return async function(this: WithCache<WithModels<BaseContext>>, model: Model, props: OJson): Promise<Json | undefined> {
        return cache.get(cache.key(model, props));
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
    return async function(this: WithCache<WithModels<BaseContext>>, model: Model, props: OJson): Promise<Json> {
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
 * Requires TTL configuration:
 * ```typescript
 * const config = {
 *   'cache-first': { ttl: 3600 } // or use default
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
 * ```
 */
export const CacheFirst = Strategy('cache-first', (config, cache, request) => {
    const ttl = getTTL(CacheFirst as unknown as CacheStrategy, config as CacheConfig);
    const fromCache = CacheOnly(config, cache, request);
    const fromNetwork = NetworkOnly(config, cache, request);
    const providerName = getProviderName(cache.provider);

    return async function(this: WithCache<WithModels<BaseContext>>, model: Model, props: OJson): Promise<Json> {
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
                cache.set(key, value, ttl).catch(() => {});
        
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
 * Requires TTL configuration:
 * ```typescript
 * const config = {
 *   'stale-while-revalidate': { ttl: 7200 } // or use default
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
 * ```
 */
export const StaleWhileRevalidate = Strategy('stale-while-revalidate', (config, cache, request) => {
    const ttl = getTTL(StaleWhileRevalidate as unknown as CacheStrategy, config as CacheConfig);
    const fromCache = CacheOnly(config, cache, request);
    const fromNetwork = NetworkOnly(config, cache, request);
    const providerName = getProviderName(cache.provider);

    return async function(this: WithCache<WithModels<BaseContext>>, model: Model, props: OJson): Promise<Json> {
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
                cache.set(key, value, ttl).catch(() => {});
        
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

        // Background update - cache.update already handles Dead internally
        if (this.shouldCache()) {
            cache.update(model, props, ttl).catch(() => {});
            this.event('cache.update', {
                strategy: 'stale-while-revalidate',
                provider: providerName,
                ttl,
            });
        }

        return cachedResult as Json;
    };
});