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

/** Context extended with cache controls and strategy support. */
export type WithCache<T extends WithModels<Context>> = T & {
    [__CacheDisabled__]: boolean;
    /** Globally disables caching for this context and all descendants. */
    disableCache(): void;
    /** Returns `false` if cache is disabled via `disableCache()`. */
    shouldCache(): boolean;
};

/** @internal Wraps `ctx.request` with cache strategy logic. */
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

/** @internal Wraps `ctx.create` so children inherit cache behavior. */
const wrapCreate = (create: WithModels<Context>['create'], cache: Cache) =>
    function (this: WithCache<WithModels<Context>>, name: string) {
        return wrapContext(create.call(this, name), cache);
    };

/** @internal Attaches cache state and methods to a `WithModels<Context>`. */
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
 * Enhances `WithModels<Context>` with cache strategies and runtime cache controls.
 *
 * The `createContext` factory is used only by `Cache.update` to build a background
 * context. If the created context has `disableCache()`, it will be called automatically
 * to prevent recursive caching.
 * 
 * @param config - TTL configuration per cache strategy name
 * @param provider - Low-level cache storage implementation
 * @param createContext - Factory for creating background contexts used by `cache.update`.
 *   Should create a `WithModels<Context>` instance (typically via `withModels`
 *   and optional helpers like `withTelemetry`/`withDeadline`). If the factory
 *   applies `withCache`, `disableCache()` will be called automatically on the
 *   created context to prevent recursive caching.
 */
export function withCache(
    config: CacheConfig,
    provider: CacheProvider,
    createContext: (name: string) => WithModels<Context>,
) {
    const cache = new Cache(config, provider, createContext);

    return function(ctx: WithModels<Context>) {
        return wrapContext(ctx, cache);
    };
}