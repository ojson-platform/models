import type {Model} from '../types';
import type {BaseContext} from '../context';
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
 * function MyModel(props: OJson, ctx: BaseContext): OJson {
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
 * Helper type that adds cache configuration properties to any model.
 * 
 * Use this to extend your global `Model` type when using `withCache`:
 * 
 * @example
 * ```typescript
 * // globals.d.ts
 * declare global {
 *   import {Model as BaseModel, WithCacheConfig} from '@ojson/models';
 *   type Model = BaseModel & WithCacheConfig;
 * }
 * 
 * // some.model.ts
 * export function GetUser(props: {id: string}): Promise<User> {
 *   // ...
 * }
 * GetUser.displayName = 'GetUser';
 * GetUser.cacheStrategy = CacheFirst.with({ ttl: 3600 }); // TypeScript knows this property exists
 * ```
 */
export type WithCacheConfig = {
    /**
     * Optional cache strategy to use for this model.
     * If not specified, the model will execute without caching.
     */
    cacheStrategy?: CacheStrategy;
};

/** BaseContext extended with cache controls and strategy support. */
export type WithCache<T extends WithModels<BaseContext>> = T & {
    [__CacheDisabled__]: boolean;
    /** Globally disables caching for this context and all descendants. */
    disableCache(): void;
    /** Returns `false` if cache is disabled via `disableCache()`. */
    shouldCache(): boolean;
};

/** @internal Wraps `ctx.request` with cache strategy logic. */
const wrapRequest = (request: WithModels<BaseContext>['request'], cache: Cache) =>
    async function (this: WithCache<WithModels<BaseContext>>, model: WithCacheModel, props, ...args) {
        const strategy = model.cacheStrategy;
        if (!strategy || this[__CacheDisabled__]) {
            return request.call(this, model, props);
        }

        const config = merge(cache.config, strategy.config);
        const resolver = strategy(config, cache, request);

        return resolver.call(this, model, props);
    };

/** @internal Wraps `ctx.create` so children inherit cache behavior. */
const wrapCreate = (create: WithModels<BaseContext>['create'], cache: Cache) =>
    function (this: WithCache<WithModels<BaseContext>>, name: string) {
        return wrapBaseContext(create.call(this, name), cache);
    };

/** @internal Attaches cache state and methods to a `WithModels<BaseContext>`. */
const wrapBaseContext = (ctx: WithModels<BaseContext>, cache: Cache) => {
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

    return ctx as WithCache<WithModels<BaseContext>>;
};

/**
 * Enhances `WithModels<BaseContext>` with cache strategies and runtime cache controls.
 *
 * The `createBaseContext` factory is used only by `Cache.update` to build a background
 * context. If the created context has `disableCache()`, it will be called automatically
 * to prevent recursive caching.
 * 
 * @param config - TTL configuration per cache strategy name
 * @param provider - Low-level cache storage implementation
 * @param createBaseContext - Factory for creating background contexts used by `cache.update`.
 *   Should create a `WithModels<BaseContext>` instance (typically via `withModels`
 *   and optional helpers like `withTelemetry`/`withDeadline`). If the factory
 *   applies `withCache`, `disableCache()` will be called automatically on the
 *   created context to prevent recursive caching.
 */
export function withCache(
    config: CacheConfig,
    provider: CacheProvider,
    createBaseContext: (name: string) => WithModels<BaseContext>,
) {
    const cache = new Cache(config, provider, createBaseContext);

    return function(ctx: WithModels<BaseContext>) {
        return wrapBaseContext(ctx, cache);
    };
}