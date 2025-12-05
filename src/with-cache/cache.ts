import type {Key, Model, OJson, Json} from '../types';

import {InterruptedError, withModels} from '../with-models';
import {Context} from '../context';
import {sign} from '../utils';

/**
 * Interface for cache storage providers.
 * Implementations handle the actual storage and retrieval of cached values.
 * 
 * @example
 * ```typescript
 * class RedisCache implements CacheProvider {
 *   async get(key: Key): Promise<Json | undefined> {
 *     // Retrieve from Redis
 *   }
 *   
 *   async set(key: Key, value: Json, ttl: number): Promise<void> {
 *     // Store in Redis with TTL
 *   }
 * }
 * ```
 */
export type CacheProvider = {
    displayName?: string;

    /**
     * Retrieves a cached value by key.
     * 
     * @param key - The cache key to look up
     * @returns Promise resolving to the cached value, or `undefined` if not found or expired
     */
    get(key: Key): Promise<Json | undefined>;
    
    /**
     * Stores a value in the cache with a time-to-live (TTL).
     * 
     * @param key - The cache key
     * @param value - The value to cache (must be JSON-serializable)
     * @param ttl - Time to live in seconds
     * @returns Promise that resolves when the value is stored
     */
    set(key: Key, value: Json, ttl: number): Promise<void>;
};

/**
 * Configuration object for cache strategies.
 * Maps strategy names to their TTL (time-to-live) settings.
 * 
 * @template Name - The strategy name(s) to configure
 * 
 * @example
 * ```typescript
 * const config: CacheConfig = {
 *   default: { ttl: 3600 },
 *   'cache-first': { ttl: 1800 },
 *   'stale-while-revalidate': { ttl: 7200 }
 * };
 * ```
 */
export type CacheConfig<Name extends string = 'default'> = {
    [prop in Name]: {
        /** Time to live in seconds */
        ttl: number;
    };
};

/**
 * Cache wrapper that provides a unified interface for cache operations.
 * Combines configuration with a cache provider implementation.
 * 
 * Provides methods for:
 * - Generating cache keys from model and props
 * - Getting and setting cached values
 * - Updating cache by executing models and storing their results
 * 
 * @example
 * ```typescript
 * const provider = new MemoryCache();
 * const config = { default: { ttl: 3600 } };
 * const cache = new Cache(config, provider);
 * 
 * const key = cache.key(MyModel, { id: 123 });
 * const value = await cache.get(key);
 * ```
 */
export class Cache implements CacheProvider {
    private _config: CacheConfig;

    private _provider: CacheProvider;

    private _updates = new Map<Key, Promise<void>>();

    /**
     * Gets the cache configuration object.
     * 
     * @returns The cache configuration with TTL settings per strategy
     */
    get config() {
        return this._config;
    }

    /**
     * Gets the underlying cache provider implementation.
     * 
     * @returns The cache provider used for storage operations
     */
    get provider() {
        return this._provider;
    }

    /**
     * Creates a new Cache instance.
     * 
     * @param config - Configuration object with TTL settings per strategy
     * @param provider - The cache provider implementation (e.g., MemoryCache, RedisCache)
     */
    constructor(config: CacheConfig, provider: CacheProvider) {
        this._config = config;
        this._provider = provider;
    }

    /**
     * Generates a cache key from a model and its props.
     * The key format is: `${model.displayName};${sign(props)}`
     * 
     * @param model - The model to generate a key for
     * @param props - The model's input parameters
     * @returns A deterministic cache key string
     * 
     * @example
     * ```typescript
     * const key = cache.key(MyModel, { id: 123, type: 'user' });
     * // Returns: "MyModel;id=123&type=user"
     * ```
     */
    key(model: Model, props: OJson): Key {
        return `${model.displayName};${sign(props)}` as Key;
    }

    /**
     * Retrieves a cached value by key.
     * Delegates to the underlying cache provider.
     * 
     * @param key - The cache key to look up
     * @returns Promise resolving to the cached value, or `undefined` if not found or expired
     */
    async get(key: Key) {
        return this.provider.get(key);
    }

    /**
     * Stores a value in the cache with a time-to-live (TTL).
     * Delegates to the underlying cache provider.
     * 
     * @param key - The cache key
     * @param value - The value to cache (must be JSON-serializable)
     * @param ttl - Time to live in seconds
     * @returns Promise that resolves when the value is stored
     */
    async set(key: Key, value: Json, ttl: number) {
        return this.provider.set(key, value, ttl);
    }

    /**
     * Updates the cache by executing a model and storing its result.
     * Creates a temporary context with model capabilities (without caching) to execute the model,
     * then stores the result in the cache.
     * 
     * The model is executed directly without cache strategies to avoid infinite loops
     * when used in background updates (e.g., in StaleWhileRevalidate strategy).
     * 
     * If multiple calls to `update()` are made with the same model and props simultaneously,
     * only one update will execute and all callers will receive the same promise.
     * 
     * If the model execution is interrupted (returns `Dead`), the cache is not updated.
     * 
     * @param model - The model to execute
     * @param props - The model's input parameters
     * @param ttl - Time to live in seconds for the cached result
     * @returns Promise that resolves when the cache is updated (or immediately if execution was interrupted)
     * 
     * @example
     * ```typescript
     * // Update cache in background while serving stale data
     * cache.update(MyModel, { id: 123 }, 3600).catch(() => {});
     * ```
     */
    async update(model: Model, props: OJson, ttl: number) {
        const key = this.key(model, props);

        // If update is already in progress for this key, return existing promise
        const existingUpdate = this._updates.get(key);
        if (existingUpdate) {
            return existingUpdate;
        }

        // Create new update promise
        const updatePromise = (async () => {
            try {
                const ctx = withModels(new Map())(new Context('cache'));

                try {
                    const value: Json = await ctx.request(model, props);
                    await this.set(key, value, ttl);
                } catch (error) {
                    // If execution was interrupted, don't cache
                    if (error instanceof InterruptedError) {
                        return;
                    }
                    throw error;
                }
            } finally {
                // Remove from updates map when done (success or failure)
                this._updates.delete(key);
            }
        })();

        // Store promise in updates map
        this._updates.set(key, updatePromise);

        return updatePromise;
    }
}