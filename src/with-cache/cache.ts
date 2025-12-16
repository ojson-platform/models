import type {Key, Model, OJson, Json} from '../types';
import type {WithModels} from '../with-models';

import {InterruptedError, withModels} from '../with-models';
import type {BaseContext} from '../context';
import {sign} from '../utils';

/**
 * Interface for low-level cache storage.
 * Implementations handle reading and writing JSON values by key.
 */
export type CacheProvider = {
    displayName?: string;

    /**
     * Returns cached value for the given key or `undefined` if missing/expired.
     * 
     * @param key - Cache key to look up
     */
    get(key: Key): Promise<Json | undefined>;
    
    /**
     * Stores value with a time-to-live (TTL) in seconds.
     * 
     * @param key - Cache key
     * @param value - JSON-serializable value to cache
     * @param ttl - Time to live in seconds
     */
    set(key: Key, value: Json, ttl: number): Promise<void>;
};

/**
 * TTL configuration per cache strategy name.
 */
export type CacheConfig<Name extends string = 'default'> = {
    [prop in Name]: {
        /** Time to live (seconds). */
        ttl: number;
    };
};

/**
 * High-level cache helper that:
 * - generates deterministic keys for models;
 * - forwards `get`/`set` to the underlying provider;
 * - can recompute and update entries via `update`.
 */
export class Cache implements CacheProvider {
    private _config: CacheConfig;

    private _provider: CacheProvider;

    private _updates = new Map<Key, Promise<void>>();

    /**
     * Factory for creating a background `WithModels<BaseContext>` used by `update()`.
     * If the created context has `disableCache()`, it will be called automatically
     * to prevent recursive caching.
     */
    private _createBaseContext: (name: string) => WithModels<BaseContext>;

    /** Cache configuration with TTL settings per strategy. */
    get config() {
        return this._config;
    }

    /** Underlying cache provider implementation. */
    get provider() {
        return this._provider;
    }

    /**
     * @param config - TTL configuration per cache strategy name
     * @param provider - Low-level cache storage implementation
     * @param createBaseContext - Factory for creating background contexts used by `update()`.
     *   If the created context has `disableCache()`, it will be called automatically.
     */
    constructor(
        config: CacheConfig,
        provider: CacheProvider,
        createBaseContext: (name: string) => WithModels<BaseContext>,
    ) {
        this._config = config;
        this._provider = provider;
        this._createBaseContext = createBaseContext;
    }

    /**
     * Builds a deterministic key `${model.displayName};${sign(props)}`.
     * 
     * @param model - Model to generate key for
     * @param props - Model input parameters
     */
    key(model: Model, props: OJson): Key {
        return `${model.displayName};${sign(props)}` as Key;
    }

    /**
     * Retrieves a cached value by key.
     * 
     * @param key - Cache key to look up
     * @returns Cached value or `undefined` if missing/expired
     */
    async get(key: Key) {
        return this.provider.get(key);
    }

    /**
     * Stores a value in the cache with a time-to-live.
     * 
     * @param key - Cache key
     * @param value - JSON-serializable value to cache
     * @param ttl - Time to live in seconds
     */
    async set(key: Key, value: Json, ttl: number) {
        return this.provider.set(key, value, ttl);
    }

    /**
     * Recomputes and stores a model result for the given key.
     *
     * - runs the model once in a background `WithModels<BaseContext>`;
     * - shares in‑flight updates for the same key;
     * - skips `set` when execution is interrupted with `InterruptedError`.
     * 
     * @param model - Model to execute
     * @param props - Model input parameters
     * @param ttl - Time to live in seconds for the cached result
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
                const ctx = this._createBaseContext('cache');

                // Disable cache on the context if it has cache capabilities
                // This prevents recursive caching when the factory applies withCache
                if (typeof (ctx as any).disableCache === 'function') {
                    (ctx as any).disableCache();
                }

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