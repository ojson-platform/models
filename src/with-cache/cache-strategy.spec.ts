import type {WithCacheModel} from './with-cache';
import type {Key} from '../types';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Context} from '../context';
import {withModels} from '../with-models';
import {withCache} from './with-cache';
import {compose} from '../utils';

import {StaleWhileRevalidate, CacheFirst} from './cache-strategy';
import {TrackingCacheProvider} from './__tests__/cache-provider';

describe('Strategy.with()', () => {
    let cache: TrackingCacheProvider;

    function context() {
        const wrap = compose([
            withModels(new Map()),
            withCache({default: {ttl: 3600}}, cache),
        ]);

        return wrap(new Context('request'));
    }

    beforeEach(() => {
        cache = new TrackingCacheProvider();
    });

    afterEach(() => {
        cache.release();
    });

    it('should accept simple { ttl: number } config for strategy-specific TTL', async () => {
        const ctx = context();

        let inc = 1;
        const model = vi.fn(() => {
            return {result: inc++};
        }) as unknown as WithCacheModel;

        model.displayName = 'model';
        const customTTL = 1800; // 30 minutes
        model.cacheStrategy = StaleWhileRevalidate.with({ ttl: customTTL });

        // Первый вызов должен выполнить модель и закешировать результат
        const result1 = await ctx.request(model, {test: 1});
        expect(result1).toEqual({result: 1});
        expect(model).toBeCalledTimes(1);

        // Проверяем, что значение было закешировано с правильным TTL
        const cacheKey = `model;test=1` as Key;
        expect(cache.set).toHaveBeenCalledWith(cacheKey, {result: 1}, customTTL);

        // Второй вызов должен вернуть закешированное значение (без повторного кеширования)
        const result2 = await ctx.request(model, {test: 1});
        expect(result2).toEqual({result: 1});
        expect(model).toBeCalledTimes(1);

        // Проверяем, что был только один вызов set с правильным TTL
        expect(cache.set).toHaveBeenCalledTimes(1);
        expect(cache.set).toHaveBeenCalledWith(cacheKey, {result: 1}, customTTL);
    });

    it('should work with CacheFirst strategy using simple { ttl: number }', async () => {
        const ctx = context();

        let inc = 1;
        const model = vi.fn(() => {
            return {result: inc++};
        }) as unknown as WithCacheModel;

        model.displayName = 'model';
        const customTTL = 2400; // 40 minutes
        model.cacheStrategy = CacheFirst.with({ ttl: customTTL });

        // Первый вызов должен выполнить модель и закешировать результат
        const result1 = await ctx.request(model, {test: 1});
        expect(result1).toEqual({result: 1});
        expect(model).toBeCalledTimes(1);

        // Проверяем, что значение было закешировано с правильным TTL
        const cacheKey = `model;test=1` as Key;
        expect(cache.set).toHaveBeenCalledWith(cacheKey, {result: 1}, customTTL);

        // Второй вызов должен вернуть закешированное значение
        const result2 = await ctx.request(model, {test: 1});
        expect(result2).toEqual({result: 1});
        expect(model).toBeCalledTimes(1);

        // Проверяем, что был только один вызов set с правильным TTL
        expect(cache.set).toHaveBeenCalledTimes(1);
        expect(cache.set).toHaveBeenCalledWith(cacheKey, {result: 1}, customTTL);
    });

    it('should use different TTL for different strategies', async () => {
        const ctx = context();

        let inc = 1;
        const model1 = vi.fn(() => ({result: inc++})) as unknown as WithCacheModel;
        model1.displayName = 'model1';
        model1.cacheStrategy = CacheFirst.with({ ttl: 1800 });

        const model2 = vi.fn(() => ({result: inc++})) as unknown as WithCacheModel;
        model2.displayName = 'model2';
        model2.cacheStrategy = StaleWhileRevalidate.with({ ttl: 7200 });

        await ctx.request(model1, {id: 1});
        await ctx.request(model2, {id: 2});

        // Проверяем, что каждая модель была закеширована с правильным TTL
        expect(cache.set).toHaveBeenCalledWith('model1;id=1' as Key, expect.anything(), 1800);
        expect(cache.set).toHaveBeenCalledWith('model2;id=2' as Key, expect.anything(), 7200);
    });
});

