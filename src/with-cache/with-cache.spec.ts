import type {WithCacheModel} from './with-cache';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Context} from '../context';
import {withModels} from '../with-models';
import {withCache} from './with-cache';
import {compose} from '../utils';

import {CacheFirst} from './cache-strategy';
import {TrackingCacheProvider} from './__tests__/cache-provider';

describe('withCache', () => {
    let cache: TrackingCacheProvider;

    function context() {
        const wrap = compose([
            withModels(new Map()),
            withCache({default: {ttl: 3600}}, cache),
        ]);

        return wrap(new Context('request'));
    }

    describe('CacheFirst', () => {
        beforeEach(() => {
            cache = new TrackingCacheProvider();
        });

        afterEach(() => {
            cache.release();
        });

        it('should share cache between contexts', async () => {
            const context1 = context();
            const context2 = context();

            let inc = 1;
            const model = vi.fn(() => {
                return {result: inc++};
            }) as unknown as WithCacheModel;

            model.displayName = 'model';
            model.cacheStrategy = CacheFirst;

            expect(await context1.request(model, {test: 1})).toEqual({result: 1});
            expect(model).toBeCalledTimes(1);

            expect(await context2.request(model, {test: 1})).toEqual({result: 1});
            expect(model).toBeCalledTimes(1);
        });

        it('should skip empty cache', async () => {
            const context1 = context();
            const context2 = context();
            const context3 = context();

            let inc = 1;
            const model = vi.fn(() => {
                return {result: inc++};
            }) as unknown as WithCacheModel;

            model.displayName = 'model';
            model.cacheStrategy = CacheFirst;

            expect(await context1.request(model, {test: 1})).toEqual({result: 1});
            expect(model).toBeCalledTimes(1);

            expect(await context2.request(model, {test: 1})).toEqual({result: 1});
            expect(model).toBeCalledTimes(1);

            cache.release();

            expect(await context3.request(model, {test: 1})).toEqual({result: 2});
            expect(model).toBeCalledTimes(2);
        });

        it('should return cached value without calling model on cache hit', async () => {
            const ctx = context();

            let inc = 1;
            const model = vi.fn(() => {
                return {result: inc++};
            }) as unknown as WithCacheModel;

            model.displayName = 'model';
            model.cacheStrategy = CacheFirst;

            // Первый вызов - cache miss, модель выполняется
            const result1 = await ctx.request(model, {id: 1});
            expect(result1).toEqual({result: 1});
            expect(model).toBeCalledTimes(1);
            expect(cache.set).toHaveBeenCalledTimes(1);

            // Второй вызов - cache hit, модель не вызывается
            const result2 = await ctx.request(model, {id: 1});
            expect(result2).toEqual({result: 1});
            expect(model).toBeCalledTimes(1); // Модель не вызывалась снова
            expect(cache.set).toHaveBeenCalledTimes(1); // Кеш не обновлялся
        });

        it('should create different cache keys for different props', async () => {
            const ctx = context();

            let inc = 1;
            const model = vi.fn((props: any) => {
                return {result: inc++, id: props.id};
            }) as unknown as WithCacheModel;

            model.displayName = 'model';
            model.cacheStrategy = CacheFirst;

            // Вызов с разными props
            const result1 = await ctx.request(model, {id: 1});
            const result2 = await ctx.request(model, {id: 2});

            expect(result1).toEqual({result: 1, id: 1});
            expect(result2).toEqual({result: 2, id: 2});
            expect(model).toBeCalledTimes(2); // Каждый props вызывает модель

            // Повторные вызовы используют кеш
            const result1Cached = await ctx.request(model, {id: 1});
            const result2Cached = await ctx.request(model, {id: 2});

            expect(result1Cached).toEqual({result: 1, id: 1});
            expect(result2Cached).toEqual({result: 2, id: 2});
            expect(model).toBeCalledTimes(2); // Модель больше не вызывается
        });

        it('should not use cache strategy when cache is disabled', async () => {
            const ctx = context();

            let inc = 1;
            const model = vi.fn(() => {
                return {result: inc++};
            }) as unknown as WithCacheModel;

            model.displayName = 'model';
            model.cacheStrategy = CacheFirst;

            // Отключаем кеш ДО первого запроса
            ctx.disableCache();

            // Первый вызов - стратегия не используется, результат не кешируется через cache.set
            const result1 = await ctx.request(model, {test: 1});
            expect(result1).toEqual({result: 1});
            expect(model).toBeCalledTimes(1);
            expect(cache.set).toHaveBeenCalledTimes(0); // Результат не кешируется через cache

            // Второй вызов в том же контексте - использует мемоизацию fromModels
            const result2 = await ctx.request(model, {test: 1});
            expect(result2).toEqual({result: 1}); // Мемоизирован через withModels
            expect(model).toBeCalledTimes(1);
            expect(cache.set).toHaveBeenCalledTimes(0); // Результат не кешируется через cache
        });


        it('should not cache result when model throws error', async () => {
            const ctx = context();

            const error = new Error('Model error');
            const model = vi.fn(() => {
                throw error;
            }) as unknown as WithCacheModel;

            model.displayName = 'model';
            model.cacheStrategy = CacheFirst;

            // Модель выбрасывает ошибку
            await expect(ctx.request(model, {test: 1})).rejects.toThrow('Model error');

            // Ошибка не должна быть закеширована
            expect(cache.set).toHaveBeenCalledTimes(0);

            // При повторном вызове ошибка должна повториться
            await expect(ctx.request(model, {test: 1})).rejects.toThrow('Model error');
            expect(model).toBeCalledTimes(2);
        });

        it('should call cache.get on cache hit and cache.set on cache miss', async () => {
            const ctx = context();

            let inc = 1;
            const model = vi.fn(() => {
                return {result: inc++};
            }) as unknown as WithCacheModel;

            model.displayName = 'model';
            model.cacheStrategy = CacheFirst;

            // Очищаем моки перед тестом
            (cache.get as ReturnType<typeof vi.fn>).mockClear();
            (cache.set as ReturnType<typeof vi.fn>).mockClear();

            // Первый вызов - cache miss
            await ctx.request(model, {test: 1});
            expect(cache.get).toHaveBeenCalled();
            expect(cache.set).toHaveBeenCalledTimes(1);

            // Очищаем моки
            (cache.get as ReturnType<typeof vi.fn>).mockClear();
            (cache.set as ReturnType<typeof vi.fn>).mockClear();

            // Второй вызов - cache hit
            await ctx.request(model, {test: 1});
            expect(cache.get).toHaveBeenCalled();
            expect(cache.set).not.toHaveBeenCalled(); // На cache hit set не вызывается
        });
    });

});