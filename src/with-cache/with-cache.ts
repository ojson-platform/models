import type {Model} from '../types';
import type {Context} from '../context';
import type {WithModels} from '../with-models';
import type {CacheConfig, CacheProvider} from './cache';
import type {CacheStrategy} from './cache-strategy';

import {merge} from 'lodash-es';

import {Cache} from './cache';

const __CacheSkipped__ = Symbol('CacheSkipped');
const __CacheDisabled__ = Symbol('CacheDisabled');

export type WithCacheModel = Model & {
    cacheStrategy?: CacheStrategy;
};

export type WithCache<T extends WithModels<Context>> = T & {
    [__CacheSkipped__]: boolean;
    [__CacheDisabled__]: boolean;
    disableCache(): void;
    shouldCache(): boolean;
    noCache<T>(data: T): T;
};

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

const wrapCreate = (create: WithModels<Context>['create'], cache: Cache) =>
    function (this: WithCache<WithModels<Context>>, name: string) {
        return wrapContext(create.call(this, name), cache);
    };

const wrapContext = (ctx: WithModels<Context>, cache: Cache) => {
    let disabled = false;
    let skipped = false;

    Object.assign(ctx, {
        get [__CacheSkipped__]() {
            return skipped;
        },
        set [__CacheSkipped__](value: boolean) {
            skipped = value;

            if (ctx.parent) {
                ctx.parent[__CacheSkipped__] = value;
            }
        },
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
        noCache: (data: any) => {
            ctx[__CacheSkipped__] = true;
            return data;
        },
        shouldCache() {
            return !ctx[__CacheSkipped__] && !ctx[__CacheDisabled__];
        },
        disableCache() {
            ctx[__CacheDisabled__] = true;
        }
    });

    return ctx as WithCache<WithModels<Context>>;
};

export function withCache(config: CacheConfig, provider: CacheProvider) {
    const cache = new Cache(config, provider);

    return function(ctx: WithModels<Context>) {
        return wrapContext(ctx, cache);
    };
}