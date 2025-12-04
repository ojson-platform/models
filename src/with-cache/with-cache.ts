import type {Model} from '../types';
import type {Context} from '../context';
import type {WithModels} from '../with-models';
import type {CacheConfig, CacheProvider} from './cache';
import type {CacheStrategy} from './cache-strategy';

import {merge} from 'lodash-es';

import {Cache} from './cache';

const __CacheDisabled__ = Symbol('CacheDisabled');

/**
 * Extended model type that supports cache strategies.
 * Models can specify a cache strategy to control how their results are cached.
 * 
 * @example
 * ```typescript
 * function MyModel(props: OJson, ctx: Context): OJson {
 *   return { data: 'value' };
 * }
 * MyModel.displayName = 'MyModel';
 * MyModel.cacheStrategy = CacheFirst.with({ ttl: 3600 });
 * ```
 */
export type WithCacheModel = Model & {
    /**
     * Optional cache strategy to use for this model.
     * If not specified, the model will execute without caching.
     */
    cacheStrategy?: CacheStrategy;
};

/**
 * Extended context type that includes cache capabilities.
 * Adds cache control methods and integrates cache strategies with model execution.
 * 
 * @template T - The base context type (must already have WithModels capabilities)
 * 
 * @property {boolean} [__CacheDisabled__] - Internal flag indicating if cache is globally disabled
 * @property {function(): void} disableCache - Disables caching globally for this context and all children
 * @property {function(): boolean} shouldCache - Checks if caching is currently enabled
 */
export type WithCache<T extends WithModels<Context>> = T & {
    [__CacheDisabled__]: boolean;
    /**
     * Disables caching globally for this context and all child contexts.
     * Once disabled, no models will be cached until the context is recreated.
     * 
     * @example
     * ```typescript
     * ctx.disableCache();
     * // All subsequent requests will bypass cache
     * ```
     */
    disableCache(): void;
    /**
     * Checks if caching is currently enabled.
     * Returns `false` if cache is globally disabled.
     * 
     * @returns `true` if caching should be used, `false` otherwise
     * 
     * @example
     * ```typescript
     * if (ctx.shouldCache()) {
     *   // Store in cache
     * }
     * ```
     */
    shouldCache(): boolean;
};

/**
 * Wraps the context's request method to integrate cache strategies.
 * Checks if the model has a cache strategy and applies it if caching is enabled.
 * 
 * @param request - The original request method from WithModels
 * @param cache - The cache instance to use for storage operations
 * @returns Wrapped request function that handles caching
 * 
 * @internal
 */
const wrapRequest = (request: WithModels<Context>['request'], cache: Cache) =>
    async function (this: WithCache<WithModels<Context>>, model: WithCacheModel, props, ...args) {
        const strategy = model.cacheStrategy;
        if (!strategy || this[__CacheDisabled__]) {
            return request.call(this, model, props);
        }

        const config = merge(cache.config, strategy.config);
        const resolver = strategy(config, cache, request);

        return resolver.call(this, model, props);
    };

/**
 * Wraps the context's create method to ensure child contexts also have cache capabilities.
 * 
 * @param create - The original create method from WithModels
 * @param cache - The cache instance to share with child contexts
 * @returns Wrapped create function that returns enhanced context
 * 
 * @internal
 */
const wrapCreate = (create: WithModels<Context>['create'], cache: Cache) =>
    function (this: WithCache<WithModels<Context>>, name: string) {
        return wrapContext(create.call(this, name), cache);
    };

/**
 * Wraps a context with cache capabilities.
 * 
 * Adds:
 * - Cache strategy integration with model execution
 * - Cache control methods (disableCache, shouldCache)
 * - Shared cache state across context hierarchy
 * - Automatic cache disable propagation to parent contexts
 * 
 * The cache state (disabled/skipped) propagates through the context hierarchy,
 * allowing parent contexts to control caching for all nested operations.
 * 
 * @param ctx - The base context with model capabilities
 * @param cache - The cache instance to use for storage operations
 * @returns Enhanced context with cache capabilities
 * 
 * @internal
 */
const wrapContext = (ctx: WithModels<Context>, cache: Cache) => {
    let disabled = false;

    Object.assign(ctx, {
        get [__CacheDisabled__]() {
            if (ctx.parent) {
                return ctx.parent[__CacheDisabled__];
            } else {
                return disabled;
            }
        },
        set [__CacheDisabled__](value: boolean) {
            if (ctx.parent) {
                ctx.parent[__CacheDisabled__] = value;
            } else {
                disabled = value;
            }
        },
        create: wrapCreate(ctx.create, cache),
        request: wrapRequest(ctx.request, cache),
        shouldCache() {
            return !ctx[__CacheDisabled__];
        },
        disableCache() {
            ctx[__CacheDisabled__] = true;
        }
    });

    return ctx as WithCache<WithModels<Context>>;
};

/**
 * Factory function that enhances a context with cache capabilities.
 * 
 * Returns a wrapper function that adds:
 * - Cache strategy support for models
 * - Cache control methods (disableCache, shouldCache)
 * - Automatic cache integration with model execution
 * - Shared cache state across context hierarchy
 * 
 * Models can specify a cache strategy via the `cacheStrategy` property.
 * If no strategy is specified, the model executes without caching.
 * 
 * @param config - Cache configuration object mapping strategy names to TTL settings
 * @param provider - Cache provider implementation (e.g., MemoryCache, RedisCache)
 * @returns Function that wraps a context with cache capabilities
 * 
 * @example
 * ```typescript
 * const provider = new MemoryCache();
 * const config = {
 *   default: { ttl: 3600 },
 *   'cache-first': { ttl: 1800 }
 * };
 * 
 * const wrap = compose([
 *   withModels(registry),
 *   withCache(config, provider)
 * ]);
 * 
 * const ctx = wrap(new Context('request'));
 * 
 * // Model with cache strategy
 * function MyModel(props, ctx) {
 *   return { data: 'value' };
 * }
 * MyModel.displayName = 'MyModel';
 * MyModel.cacheStrategy = CacheFirst.with({ ttl: 3600 });
 * 
 * const result = await ctx.request(MyModel, { id: 123 });
 * ```
 * 
 * @example
 * ```typescript
 * // Control caching at runtime
 * ctx.disableCache(); // Disable for all models
 * ```
 */
export function withCache(config: CacheConfig, provider: CacheProvider) {
    const cache = new Cache(config, provider);

    return function(ctx: WithModels<Context>) {
        return wrapContext(ctx, cache);
    };
}