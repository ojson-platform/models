/* eslint-disable new-cap */
import type {Model, OJson} from '../types';
import type {Context} from '../context';
import type {Request, WithModels} from '../with-models';
import type {Cache, CacheConfig} from './cache';
import type {WithCache} from './with-cache';

import {get} from 'lodash-es';

const isEmptyValue = (target: any): target is undefined => target === undefined;

type StrategyResolver = {
    (config: CacheConfig, cache: Cache, request: Request): Request;
};

export type CacheStrategy = StrategyResolver & {
    displayName: string;
    config: CacheConfig;
    with(config: CacheConfig): CacheStrategy;
};

const Strategy = (displayName: string, call: StrategyResolver): CacheStrategy => {
    const strategy = Object.assign(call.bind(undefined), {
        displayName,
        config: {},
        with: (config: CacheConfig) => {
            return Object.assign(call.bind(undefined), strategy, {config});
        },
    });

    return strategy;
};

const getTTL = (strategy: CacheStrategy, config: CacheConfig) => {
    const ttl = get(config, `${strategy.displayName}.ttl`, get(config, `default.ttl`));
    if (typeof ttl !== 'number') {
        throw new Error(`TTL for "${strategy.displayName}" strategy is not configured`);
    }

    return ttl;
};

export const CacheOnly = Strategy('cache-only', (_config, cache) => {
    return async function(this: WithCache<WithModels<Context>>, model: Model, props: OJson) {
        return cache.get(cache.key(model, props));
    };
});

export const NetworkOnly = Strategy('network-only', (_config, cache, request) => {
    return async function(this: WithCache<WithModels<Context>>, model: Model, props: OJson) {
        return request.call(this, model, props);
    };
});

export const CacheFirst = Strategy('cache-first', (config, cache, request) => {
    const ttl = getTTL(CacheFirst as unknown as CacheStrategy, config as CacheConfig);
    const fromCache = CacheOnly(config, cache, request);
    const fromNetwork = NetworkOnly(config, cache, request);

    return async function(this: WithCache<WithModels<Context>>, model: Model, props: OJson) {
        const cachedResult = await fromCache.call(this, model, props);

        if (isEmptyValue(cachedResult)) {
            const key = cache.key(model, props);
            const value = await fromNetwork.call(this, model, props);

            if (this.shouldCache()) {
                cache.set(key, value, ttl).catch(() => {});
            }

            return value;
        }

        return cachedResult;
    };
});

export const StaleWhileRevalidate = Strategy('stale-while-revalidate', (config, cache, request) => {
    const ttl = getTTL(StaleWhileRevalidate as unknown as CacheStrategy, config as CacheConfig);
    const fromCache = CacheOnly(config, cache, request);
    const fromNetwork = NetworkOnly(config, cache, request);

    return async function(this: WithCache<WithModels<Context>>, model: Model, props: OJson) {
        const cachedResult = await fromCache.call(this, model, props);

        if (isEmptyValue(cachedResult)) {
            const key = cache.key(model, props);
            const value = await fromNetwork.call(this, model, props);

            if (this.shouldCache()) {
                cache.set(key, value, ttl).catch(() => {});
            }

            return value;
        }

        cache.update(model, props, ttl).catch(() => {});

        return cachedResult;
    };
});