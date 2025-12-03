import type {Key, Model, OJson, Json} from '../types';

import {Dead, withModels} from '../with-models';
import {Context} from '../context';
import {compose, sign} from '../utils';

import {withCache} from './with-cache';

export type CacheProvider = {
    get(key: Key): Promise<Json | undefined>;
    set(key: Key, value: Json, ttl: number): Promise<void>;
};

export type CacheConfig<Name extends string = 'default'> = {
    [prop in Name]: {
        ttl: number;
    };
};

export class Cache implements CacheProvider {
    private _config: CacheConfig;

    private _provider: CacheProvider;

    get config() {
        return this._config;
    }

    get provider() {
        return this._provider;
    }

    constructor(config: CacheConfig, provider: CacheProvider) {
        this._config = config;
        this._provider = provider;
    }

    key(model, props): Key {
        return `${model.displayName};${sign(props)}` as Key;
    }

    async get(key: Key) {
        return this.provider.get(key);
    }

    async set(key: Key, value: Json, ttl: number) {
        return this.provider.set(key, value, ttl);
    }

    async update(model: Model, props: OJson, ttl: number) {
        const wrap = compose([
            withModels(new Map()),
            withCache(this.config, this),
        ]);
        const ctx = wrap(new Context('cache'));

        const key = this.key(model, props);
        const value = await ctx.request(model, props);

        if (value === Dead) {
            return;
        }

        await this.set(key, value, ttl);
    }
}