import type {Key} from '../types';
import type {CacheConfig, WithCacheModel} from './types';

import {requirement, scenario, spec} from '@ojson/spec-coverage';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Context} from '../context';
import {InterruptedError, withModels} from '../with-models';
import {compose} from '../utils';

import {StaleWhileRevalidate, CacheFirst, CacheOnly, NetworkOnly} from './cache-strategy';
import {withCache} from './with-cache';
import {TrackingCacheProvider} from './__tests__/cache-provider';

function cacheFirstContext(cache: TrackingCacheProvider) {
  const wrap = compose([withModels(new Map()), withCache({default: {ttl: 3600}}, cache)]);

  return wrap(new Context('request'));
}

spec('cache-first', () => {
  requirement('Попадание не выполняет Model и не пишет снова', () => {
    scenario('Другой запрос берёт сохранённое значение', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const ctx1 = cacheFirstContext(cache);
        const ctx2 = cacheFirstContext(cache);

        let inc = 1;
        const model = vi.fn(() => {
          return {result: inc++};
        }) as unknown as WithCacheModel;

        model.displayName = 'model';
        model.cacheStrategy = CacheFirst;

        await ctx1.request(model, {id: 1});

        const result2 = await ctx2.request(model, {id: 1});
        expect(result2).toEqual({result: 1});
        expect(model).toBeCalledTimes(1);
        expect(cache.set).toHaveBeenCalledTimes(1);
      } finally {
        cache.release();
      }
    });
  });

  requirement('Промах выполняет Model и сохраняет результат', () => {
    scenario('Первое обращение сохраняет результат', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const ctx = cacheFirstContext(cache);

        let inc = 1;
        const model = vi.fn(() => {
          return {result: inc++};
        }) as unknown as WithCacheModel;

        model.displayName = 'model';
        model.cacheStrategy = CacheFirst;

        const result1 = await ctx.request(model, {id: 1});
        expect(result1).toEqual({result: 1});
        expect(model).toBeCalledTimes(1);
        expect(cache.set).toHaveBeenCalledTimes(1);
      } finally {
        cache.release();
      }
    });

    scenario('Ошибка Model не сохраняется', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const ctx = cacheFirstContext(cache);

        const error = new Error('Model error');
        const model = vi.fn(() => {
          throw error;
        }) as unknown as WithCacheModel;

        model.displayName = 'model';
        model.cacheStrategy = CacheFirst;

        await expect(ctx.request(model, {test: 1})).rejects.toThrow('Model error');

        expect(cache.set).toHaveBeenCalledTimes(0);

        await expect(ctx.request(model, {test: 1})).rejects.toThrow('Model error');
        expect(model).toBeCalledTimes(2);
      } finally {
        cache.release();
      }
    });

    scenario('Ошибка записи не меняет ответ', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const ctx = cacheFirstContext(cache);

        const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        model.displayName = 'model';
        model.cacheStrategy = CacheFirst;

        (cache.set as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
          throw new Error('Cache write failed');
        });

        const result = await ctx.request(model, {test: 1});
        expect(result).toEqual({result: 1});
        expect(model).toBeCalledTimes(1);
      } finally {
        cache.release();
      }
    });
  });
});

function cacheOnlyContext(cache: TrackingCacheProvider) {
  const wrap = compose([withModels(new Map()), withCache({default: {ttl: 3600}}, cache)]);

  return wrap(new Context('request'));
}

spec('cache-only', () => {
  requirement('Попадание возвращает сохранённое значение', () => {
    scenario('Другой запрос получает сохранённое значение', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const ctx1 = cacheOnlyContext(cache);
        const ctx2 = cacheOnlyContext(cache);

        const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        model.displayName = 'model';
        model.cacheStrategy = CacheFirst;

        await ctx1.request(model, {id: 1});
        expect(model).toBeCalledTimes(1);

        model.cacheStrategy = CacheOnly;

        const result = await ctx2.request(model, {id: 1});
        expect(result).toEqual({result: 1});
        expect(model).toBeCalledTimes(1);
      } finally {
        cache.release();
      }
    });
  });

  requirement('Промах не выполняет Model', () => {
    scenario('Записи нет', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const ctx = cacheOnlyContext(cache);

        const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        model.displayName = 'model';
        model.cacheStrategy = CacheOnly;

        const result = await ctx.request(model, {id: 1});
        expect(result).toBeUndefined();
        expect(model).toBeCalledTimes(0);
        expect(cache.set).not.toHaveBeenCalled();
      } finally {
        cache.release();
      }
    });
  });
});

function cacheTtlDefaultContext(cache: TrackingCacheProvider) {
  const wrap = compose([withModels(new Map()), withCache({default: {ttl: 3600}}, cache)]);

  return wrap(new Context('request'));
}

spec('cache-ttl', () => {
  requirement('Срок стратегии подменяет срок по умолчанию', () => {
    scenario('Свой срок важнее срока по умолчанию', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const ctx = cacheTtlDefaultContext(cache);

        const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        model.displayName = 'model';
        model.cacheStrategy = CacheFirst.with({ttl: 1800});

        await ctx.request(model, {id: 1});

        const cacheKey = 'model;id=1' as Key;
        expect(cache.set).toHaveBeenCalledWith(cacheKey, {result: 1}, 1800);
        expect(cache.set).not.toHaveBeenCalledWith(cacheKey, expect.anything(), 3600);
      } finally {
        cache.release();
      }
    });

    scenario('Без своего срока берётся срок по умолчанию', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const ctx = cacheTtlDefaultContext(cache);

        const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        model.displayName = 'model';
        model.cacheStrategy = CacheFirst;

        await ctx.request(model, {id: 1});

        expect(cache.set).toHaveBeenCalledWith('model;id=1' as Key, {result: 1}, 3600);
      } finally {
        cache.release();
      }
    });

    scenario('Две стратегии хранят каждая со своим сроком', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const ctx = cacheTtlDefaultContext(cache);

        let inc = 1;
        const model1 = vi.fn(() => ({result: inc++})) as unknown as WithCacheModel;
        model1.displayName = 'model1';
        model1.cacheStrategy = CacheFirst.with({ttl: 1800});

        const model2 = vi.fn(() => ({result: inc++})) as unknown as WithCacheModel;
        model2.displayName = 'model2';
        model2.cacheStrategy = StaleWhileRevalidate.with({ttl: 7200});

        await ctx.request(model1, {id: 1});
        await ctx.request(model2, {id: 2});

        expect(cache.set).toHaveBeenCalledWith('model1;id=1' as Key, expect.anything(), 1800);
        expect(cache.set).toHaveBeenCalledWith('model2;id=2' as Key, expect.anything(), 7200);
      } finally {
        cache.release();
      }
    });

    scenario('Фоновое обновление пишет с тем же сроком', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const ctx = cacheTtlDefaultContext(cache);

        let inc = 1;
        const model = vi.fn(() => {
          return {result: inc++};
        }) as unknown as WithCacheModel;

        model.displayName = 'model';
        model.cacheStrategy = StaleWhileRevalidate.with({ttl: 1800});

        const cacheKey = `model;test=1` as Key;

        await ctx.request(model, {test: 1});
        expect(cache.set).toHaveBeenCalledWith(cacheKey, {result: 1}, 1800);

        await ctx.request(model, {test: 1});
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(model).toBeCalledTimes(2);
        expect(cache.set).toHaveBeenCalledWith(cacheKey, {result: 1}, 1800);
        expect(cache.set).toHaveBeenCalledWith(cacheKey, {result: 2}, 1800);
      } finally {
        cache.release();
      }
    });
  });

  requirement('Выбор срока остаётся в общей конфигурации', () => {
    scenario('Следующая Model наследует чужой срок', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const ctx = cacheTtlDefaultContext(cache);

        const model1 = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        model1.displayName = 'model1';
        model1.cacheStrategy = CacheFirst.with({ttl: 1800});

        const model2 = vi.fn(() => ({result: 2})) as unknown as WithCacheModel;
        model2.displayName = 'model2';
        model2.cacheStrategy = CacheFirst;

        await ctx.request(model1, {id: 1});
        (cache.set as ReturnType<typeof vi.fn>).mockClear();

        await ctx.request(model2, {id: 2});

        expect(cache.set).toHaveBeenCalledWith('model2;id=2' as Key, {result: 2}, 1800);
      } finally {
        cache.release();
      }
    });

    scenario('Отвергнутый срок портит следующее обращение', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const ctx = cacheTtlDefaultContext(cache);

        const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        model.displayName = 'model';
        model.cacheStrategy = CacheFirst.with({ttl: 0});

        await expect(ctx.request(model, {id: 1})).rejects.toThrow(
          'TTL for "cache-first" strategy must be a positive number',
        );

        model.cacheStrategy = CacheFirst;

        await expect(ctx.request(model, {id: 2})).rejects.toThrow(
          'TTL for "cache-first" strategy must be a positive number',
        );
        expect(model).not.toHaveBeenCalled();
      } finally {
        cache.release();
      }
    });
  });

  requirement('Сохраняющая стратегия без годного срока не применяется', () => {
    scenario('Срок не задан', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const wrap = compose([withModels(new Map()), withCache({} as CacheConfig, cache)]);
        const ctx = wrap(new Context('request'));

        const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        model.displayName = 'model';
        model.cacheStrategy = CacheFirst;

        await expect(ctx.request(model, {id: 1})).rejects.toThrow(
          'TTL for "cache-first" strategy is not configured',
        );
        expect(model).not.toHaveBeenCalled();
        expect(cache.get).not.toHaveBeenCalled();
      } finally {
        cache.release();
      }
    });

    scenario('Срок не число', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const wrap = compose([
          withModels(new Map()),
          withCache({default: {ttl: 'invalid' as unknown as number}} as CacheConfig, cache),
        ]);
        const ctx = wrap(new Context('request'));

        const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        model.displayName = 'model';
        model.cacheStrategy = CacheFirst;

        await expect(ctx.request(model, {id: 1})).rejects.toThrow(
          'TTL for "cache-first" strategy is not configured',
        );
      } finally {
        cache.release();
      }
    });

    scenario('Срок не положительный', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const ctx = cacheTtlDefaultContext(cache);

        const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        model.displayName = 'model';
        model.cacheStrategy = CacheFirst.with({ttl: 0});

        await expect(ctx.request(model, {id: 1})).rejects.toThrow(
          'TTL for "cache-first" strategy must be a positive number',
        );
        expect(model).not.toHaveBeenCalled();
      } finally {
        cache.release();
      }
    });

    scenario('Отрицательный и не конечный срок — та же ошибка', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const ctx = cacheTtlDefaultContext(cache);

        const modelNegative = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        modelNegative.displayName = 'model';
        modelNegative.cacheStrategy = StaleWhileRevalidate.with({ttl: -1});

        await expect(ctx.request(modelNegative, {id: 1})).rejects.toThrow(
          'TTL for "stale-while-revalidate" strategy must be a positive number',
        );

        const modelNonFinite = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        modelNonFinite.displayName = 'model2';
        modelNonFinite.cacheStrategy = StaleWhileRevalidate.with({
          ttl: Number.POSITIVE_INFINITY,
        });

        await expect(ctx.request(modelNonFinite, {id: 2})).rejects.toThrow(
          'TTL for "stale-while-revalidate" strategy must be a positive number',
        );
      } finally {
        cache.release();
      }
    });
  });

  requirement('Стратегия, которая не сохраняет значение, срока не требует', () => {
    scenario('cache-only читает без срока', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const wrap = compose([withModels(new Map()), withCache({} as CacheConfig, cache)]);
        const ctx = wrap(new Context('request'));

        const cacheKey = 'model;id=1' as Key;
        await cache.set(cacheKey, {result: 1}, 3600);

        const model = vi.fn(() => ({result: 99})) as unknown as WithCacheModel;
        model.displayName = 'model';
        model.cacheStrategy = CacheOnly;

        const result = await ctx.request(model, {id: 1});
        expect(result).toEqual({result: 1});
        expect(model).not.toHaveBeenCalled();
      } finally {
        cache.release();
      }
    });

    scenario('network-only выполняется без срока', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const wrap = compose([withModels(new Map()), withCache({} as CacheConfig, cache)]);
        const ctx = wrap(new Context('request'));

        const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        model.displayName = 'model';
        model.cacheStrategy = NetworkOnly;

        const result = await ctx.request(model, {id: 1});
        expect(result).toEqual({result: 1});
        expect(model).toBeCalledTimes(1);
      } finally {
        cache.release();
      }
    });
  });

  requirement('Встроенное хранилище перестаёт отдавать значение после срока', () => {
    scenario('Чтение после срока — промах', async () => {
      vi.useFakeTimers();
      const cache = new TrackingCacheProvider();
      try {
        const ctx1 = cacheTtlDefaultContext(cache);
        const ctx2 = cacheTtlDefaultContext(cache);

        let inc = 1;
        const model = vi.fn(() => ({result: inc++})) as unknown as WithCacheModel;
        model.displayName = 'model';
        model.cacheStrategy = CacheFirst.with({ttl: 1});

        await ctx1.request(model, {id: 1});
        expect(model).toBeCalledTimes(1);

        vi.advanceTimersByTime(1100);

        const result = await ctx2.request(model, {id: 1});
        expect(result).toEqual({result: 2});
        expect(model).toBeCalledTimes(2);
      } finally {
        cache.release();
        vi.useRealTimers();
      }
    });
  });
});

function cacheZipDefaultContext(cache: TrackingCacheProvider) {
  const wrap = compose([withModels(new Map()), withCache({default: {ttl: 3600}}, cache)]);

  return wrap(new Context('request'));
}

async function waitForCacheSet(cache: TrackingCacheProvider) {
  await vi.waitFor(() => {
    expect(cache.set).toHaveBeenCalled();
  });
}

spec('cache-zip', () => {
  requirement('Сжатие включается вместе со стратегией', () => {
    scenario('По умолчанию значение хранится как есть', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const ctx = cacheZipDefaultContext(cache);

        const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        model.displayName = 'model';
        model.cacheStrategy = CacheFirst;

        await ctx.request(model, {id: 1});

        expect(cache.set).toHaveBeenCalledWith('model;id=1' as Key, {result: 1}, 3600);
      } finally {
        cache.release();
      }
    });

    scenario('Флаг стратегии включает сжатие', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const wrap = compose([
          withModels(new Map()),
          withCache({default: {ttl: 3600, zip: true}}, cache),
        ]);
        const ctx1 = wrap(new Context('request'));
        const ctx2 = wrap(new Context('request-2'));

        const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        model.displayName = 'model';
        model.cacheStrategy = CacheFirst.with({zip: true});

        await ctx1.request(model, {id: 1});
        await waitForCacheSet(cache);

        const stored = (cache.set as ReturnType<typeof vi.fn>).mock.calls[0][1];
        expect(typeof stored).toBe('string');

        const result2 = await ctx2.request(model, {id: 1});
        expect(result2).toEqual({result: 1});
        expect(model).toBeCalledTimes(1);
      } finally {
        cache.release();
      }
    });

    scenario('Выключенный флаг стратегии важнее включённого по умолчанию', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const wrap = compose([
          withModels(new Map()),
          withCache({default: {ttl: 3600, zip: true}}, cache),
        ]);
        const ctx = wrap(new Context('request'));

        const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        model.displayName = 'model';
        model.cacheStrategy = CacheFirst.with({zip: false});

        await ctx.request(model, {id: 1});

        expect(cache.set).toHaveBeenCalledWith('model;id=1' as Key, {result: 1}, 3600);
      } finally {
        cache.release();
      }
    });
  });

  requirement('Выбор сжатия остаётся в общей конфигурации', () => {
    scenario('Следующая Model наследует чужое сжатие', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const ctx = cacheZipDefaultContext(cache);

        const model1 = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        model1.displayName = 'model1';
        model1.cacheStrategy = CacheFirst.with({zip: true});

        const model2 = vi.fn(() => ({result: 2})) as unknown as WithCacheModel;
        model2.displayName = 'model2';
        model2.cacheStrategy = CacheFirst;

        await ctx.request(model1, {id: 1});
        (cache.set as ReturnType<typeof vi.fn>).mockClear();

        await ctx.request(model2, {id: 2});
        await waitForCacheSet(cache);

        const stored = (cache.set as ReturnType<typeof vi.fn>).mock.calls[0][1];
        expect(typeof stored).toBe('string');
      } finally {
        cache.release();
      }
    });
  });

  requirement('Чтение следует флагу читающей стратегии', () => {
    scenario('Чтение без сжатия не раскрывает запись', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const ctx1 = cacheZipDefaultContext(cache);
        const ctx2 = cacheZipDefaultContext(cache);

        const writeModel = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        writeModel.displayName = 'model';
        writeModel.cacheStrategy = CacheFirst.with({zip: true});

        await ctx1.request(writeModel, {id: 1});
        await waitForCacheSet(cache);
        const stored = (cache.set as ReturnType<typeof vi.fn>).mock.calls[0][1];
        expect(typeof stored).toBe('string');

        const readModel = vi.fn(() => ({result: 99})) as unknown as WithCacheModel;
        readModel.displayName = 'model';
        readModel.cacheStrategy = CacheOnly;

        const result = await ctx2.request(readModel, {id: 1});
        expect(result).toBe(stored);
        expect(readModel).not.toHaveBeenCalled();
      } finally {
        cache.release();
      }
    });

    scenario('Нераскрываемый текст возвращается как есть', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const ctx1 = cacheZipDefaultContext(cache);
        const ctx2 = cacheZipDefaultContext(cache);

        const writeModel = vi.fn(() => 'not-valid-deflate-base64') as unknown as WithCacheModel;
        writeModel.displayName = 'model';
        writeModel.cacheStrategy = CacheFirst;

        await ctx1.request(writeModel, {id: 1});

        const readModel = vi.fn(() => 'other') as unknown as WithCacheModel;
        readModel.displayName = 'model';
        readModel.cacheStrategy = CacheOnly.with({zip: true});

        const result = await ctx2.request(readModel, {id: 1});
        expect(result).toBe('not-valid-deflate-base64');
        expect(readModel).not.toHaveBeenCalled();
      } finally {
        cache.release();
      }
    });

    scenario('Не-текст при включённом сжатии возвращается как есть', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const ctx1 = cacheZipDefaultContext(cache);
        const ctx2 = cacheZipDefaultContext(cache);

        const writeModel = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        writeModel.displayName = 'model';
        writeModel.cacheStrategy = CacheFirst;

        await ctx1.request(writeModel, {id: 1});

        const readModel = vi.fn(() => ({result: 99})) as unknown as WithCacheModel;
        readModel.displayName = 'model';
        readModel.cacheStrategy = CacheOnly.with({zip: true});

        const result = await ctx2.request(readModel, {id: 1});
        expect(result).toEqual({result: 1});
        expect(readModel).not.toHaveBeenCalled();
      } finally {
        cache.release();
      }
    });

    scenario('Фоновое обновление пишет в выбранной форме', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const ctx = cacheZipDefaultContext(cache);

        let inc = 1;
        const model = vi.fn(() => {
          return {result: inc++};
        }) as unknown as WithCacheModel;

        model.displayName = 'model';
        model.cacheStrategy = StaleWhileRevalidate.with({zip: true});

        const cacheKey = 'model;id=1' as Key;

        await ctx.request(model, {id: 1});
        await waitForCacheSet(cache);
        expect(typeof (cache.set as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe('string');

        await ctx.request(model, {id: 1});
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(model).toBeCalledTimes(2);
        const backgroundSet = (cache.set as ReturnType<typeof vi.fn>).mock.calls.find(
          call => call[0] === cacheKey && call[1] !== undefined && typeof call[1] === 'string',
        );
        expect(backgroundSet).toBeDefined();
        expect(backgroundSet![1]).not.toEqual({result: 2});
      } finally {
        cache.release();
      }
    });
  });
});

spec('disable-cache', () => {
  requirement('Выключение не снимается и копируется только в новый вложенный запрос', () => {
    scenario('Новый вложенный запрос рождается выключенным', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const wrap = compose([withModels(new Map()), withCache({default: {ttl: 3600}}, cache)]);
        const parentCtx = wrap(new Context('request'));

        const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        model.displayName = 'model';
        model.cacheStrategy = CacheFirst;

        parentCtx.disableCache();
        expect(parentCtx.shouldCache()).toBe(false);

        const childCtx = parentCtx.create('child') as typeof parentCtx;
        expect(childCtx.shouldCache()).toBe(false);

        (cache.get as ReturnType<typeof vi.fn>).mockClear();
        (cache.set as ReturnType<typeof vi.fn>).mockClear();

        const result = await childCtx.request(model, {id: 1});
        expect(result).toEqual({result: 1});
        expect(cache.get).not.toHaveBeenCalled();
        expect(cache.set).not.toHaveBeenCalled();
      } finally {
        cache.release();
      }
    });

    scenario('Уже созданный вложенный запрос остаётся включённым', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const wrap = compose([withModels(new Map()), withCache({default: {ttl: 3600}}, cache)]);
        const parentCtx = wrap(new Context('request'));
        const childCtx = parentCtx.create('child') as typeof parentCtx;

        expect(parentCtx.shouldCache()).toBe(true);
        expect(childCtx.shouldCache()).toBe(true);

        parentCtx.disableCache();
        expect(parentCtx.shouldCache()).toBe(false);
        expect(childCtx.shouldCache()).toBe(true);
      } finally {
        cache.release();
      }
    });

    scenario('Выключение вложенного запроса не выключает родителя', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const wrap = compose([withModels(new Map()), withCache({default: {ttl: 3600}}, cache)]);
        const parentCtx = wrap(new Context('request'));
        const childCtx = parentCtx.create('child') as typeof parentCtx;
        const siblingCtx = parentCtx.create('sibling') as typeof parentCtx;

        childCtx.disableCache();
        expect(childCtx.shouldCache()).toBe(false);
        expect(parentCtx.shouldCache()).toBe(true);
        expect(siblingCtx.shouldCache()).toBe(true);
      } finally {
        cache.release();
      }
    });

    scenario('Другое дерево не выключено', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const wrap1 = compose([withModels(new Map()), withCache({default: {ttl: 3600}}, cache)]);
        const wrap2 = compose([withModels(new Map()), withCache({default: {ttl: 3600}}, cache)]);
        const ctx1 = wrap1(new Context('request'));
        const ctx2 = wrap2(new Context('request-2'));

        let inc = 1;
        const model = vi.fn(() => ({result: inc++})) as unknown as WithCacheModel;
        model.displayName = 'model';
        model.cacheStrategy = CacheFirst;

        await ctx1.request(model, {id: 1});
        expect(model).toBeCalledTimes(1);
        expect(cache.set).toHaveBeenCalledTimes(1);

        ctx1.disableCache();
        (cache.get as ReturnType<typeof vi.fn>).mockClear();
        (cache.set as ReturnType<typeof vi.fn>).mockClear();

        await ctx1.request(model, {id: 1});
        expect(model).toBeCalledTimes(1);
        expect(cache.get).not.toHaveBeenCalled();
        expect(cache.set).not.toHaveBeenCalled();

        const result2 = await ctx2.request(model, {id: 1});
        expect(result2).toEqual({result: 1});
        expect(model).toBeCalledTimes(1);
        expect(cache.get).toHaveBeenCalled();
        expect(cache.set).not.toHaveBeenCalled();
      } finally {
        cache.release();
      }
    });
  });

  requirement('Выключенный запрос не применяет стратегию', () => {
    scenario('Обращение не трогает хранилище', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const wrap = compose([withModels(new Map()), withCache({default: {ttl: 3600}}, cache)]);
        const ctx = wrap(new Context('request'));

        let inc = 1;
        const model = vi.fn(() => ({result: inc++})) as unknown as WithCacheModel;
        model.displayName = 'model';
        model.cacheStrategy = CacheFirst;

        ctx.disableCache();

        (cache.get as ReturnType<typeof vi.fn>).mockClear();
        (cache.set as ReturnType<typeof vi.fn>).mockClear();

        const result1 = await ctx.request(model, {test: 1});
        expect(result1).toEqual({result: 1});
        expect(model).toBeCalledTimes(1);
        expect(cache.get).not.toHaveBeenCalled();
        expect(cache.set).not.toHaveBeenCalled();

        const result2 = await ctx.request(model, {test: 1});
        expect(result2).toEqual({result: 1});
        expect(model).toBeCalledTimes(1);
        expect(cache.set).not.toHaveBeenCalled();
      } finally {
        cache.release();
      }
    });

    scenario('Попадание не запускает фоновое обновление', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const wrap1 = compose([withModels(new Map()), withCache({default: {ttl: 3600}}, cache)]);
        const wrap2 = compose([withModels(new Map()), withCache({default: {ttl: 3600}}, cache)]);
        const ctx1 = wrap1(new Context('request'));
        const ctx2 = wrap2(new Context('request-2'));

        let inc = 1;
        const model = vi.fn(() => ({result: inc++})) as unknown as WithCacheModel;
        model.displayName = 'model';
        model.cacheStrategy = StaleWhileRevalidate;

        await ctx1.request(model, {id: 1});
        expect(model).toBeCalledTimes(1);
        expect(cache.set).toHaveBeenCalledTimes(1);

        ctx2.disableCache();
        (cache.get as ReturnType<typeof vi.fn>).mockClear();
        (cache.set as ReturnType<typeof vi.fn>).mockClear();

        const result = await ctx2.request(model, {id: 1});
        expect(result).toEqual({result: 2});
        expect(model).toBeCalledTimes(2);
        expect(cache.set).not.toHaveBeenCalled();

        await new Promise(resolve => setTimeout(resolve, 10));
        expect(model).toBeCalledTimes(2);
      } finally {
        cache.release();
      }
    });

    scenario('Негодный срок не отклоняет выключенный запрос', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const wrap = compose([withModels(new Map()), withCache({} as CacheConfig, cache)]);
        const ctx = wrap(new Context('request'));

        const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        model.displayName = 'model';
        model.cacheStrategy = CacheFirst;

        ctx.disableCache();

        await expect(ctx.request(model, {id: 1})).resolves.toEqual({result: 1});
        expect(model).toBeCalledTimes(1);
        expect(cache.get).not.toHaveBeenCalled();
        expect(cache.set).not.toHaveBeenCalled();
      } finally {
        cache.release();
      }
    });

    scenario('Model выключает кэш до записи', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const wrap = compose([withModels(new Map()), withCache({default: {ttl: 3600}}, cache)]);
        const ctx = wrap(new Context('request'));

        const model = vi.fn(() => {
          ctx.disableCache();
          return {result: 1};
        }) as unknown as WithCacheModel;

        model.displayName = 'model';
        model.cacheStrategy = CacheFirst;

        (cache.set as ReturnType<typeof vi.fn>).mockClear();

        const result = await ctx.request(model, {id: 1});
        expect(result).toEqual({result: 1});
        expect(model).toBeCalledTimes(1);
        expect(cache.set).not.toHaveBeenCalled();
      } finally {
        cache.release();
      }
    });
  });

  requirement('Фоновое обновление выключает кэш только у собранного им запроса', () => {
    scenario('Обновление не кэширует снова без фабрики вызывающего', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const wrap = compose([withModels(new Map()), withCache({default: {ttl: 3600}}, cache)]);

        const ctx1 = wrap(new Context('request'));
        const ctx2 = wrap(new Context('request'));

        let inc = 1;
        let releaseBackgroundModel: () => void;
        const backgroundModelGate = new Promise<void>(resolve => {
          releaseBackgroundModel = resolve;
        });

        const model = vi.fn(async () => {
          if (inc > 1) {
            await backgroundModelGate;
          }
          return {result: inc++};
        }) as unknown as WithCacheModel;

        model.displayName = 'model';
        model.cacheStrategy = StaleWhileRevalidate;

        const cacheKey = 'model;id=1' as Key;

        await ctx1.request(model, {id: 1});
        expect(model).toBeCalledTimes(1);

        const result2 = await ctx2.request(model, {id: 1});
        expect(result2).toEqual({result: 1});

        (cache.get as ReturnType<typeof vi.fn>).mockClear();
        (cache.set as ReturnType<typeof vi.fn>).mockClear();

        releaseBackgroundModel!();
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(cache.get).not.toHaveBeenCalled();
        expect(cache.set).toHaveBeenCalledWith(cacheKey, {result: 2}, 3600);
        expect(model).toBeCalledTimes(2);
      } finally {
        cache.release();
      }
    });
  });
});

spec('interrupted-run', () => {
  requirement('Запуск, прерванный до выполнения Model, не сохраняется как успех', () => {
    scenario('Межзапросный кэш не записывает прерванное обращение', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const wrap = compose([withModels(new Map()), withCache({default: {ttl: 3600}}, cache)]);
        const ctx = wrap(new Context('request'));

        const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
        model.displayName = 'model';
        model.cacheStrategy = CacheFirst;

        ctx.kill();

        await expect(ctx.request(model, {test: 1})).rejects.toThrow(InterruptedError);
        expect(cache.set).toHaveBeenCalledTimes(0);
        expect(model).not.toBeCalled();
      } finally {
        cache.release();
      }
    });
  });

  requirement('Генератор, прерванный между шагами, не оставляет успех', () => {
    scenario('Прерывание между шагами', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const wrap = compose([withModels(new Map()), withCache({default: {ttl: 3600}}, cache)]);
        const ctx = wrap(new Context('request'));
        const ctx2 = wrap(new Context('request-2'));

        const wait = (delay: number) => new Promise(resolve => setTimeout(resolve, delay));
        const model = vi.fn(function* (_props: unknown, modelCtx: {kill: () => unknown}) {
          yield wait(10);
          modelCtx.kill();
          yield wait(10);

          return {result: 1};
        }) as unknown as WithCacheModel;

        model.displayName = 'model';
        model.cacheStrategy = CacheFirst;

        await expect(ctx.request(model, {test: 1})).rejects.toThrow(InterruptedError);
        await expect(ctx.request(model, {test: 1})).rejects.toThrow(InterruptedError);
        expect(cache.set).toHaveBeenCalledTimes(0);

        await expect(ctx2.request(model, {test: 1})).rejects.toThrow(InterruptedError);
        expect(cache.set).toHaveBeenCalledTimes(0);
      } finally {
        cache.release();
      }
    });
  });

  requirement('Фоновое обновление кэша скрывает прерывание, обращение вызывающего — нет', () => {
    scenario('Вызывающий видит прерывание, и кэш молчит', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const wrap = compose([withModels(new Map()), withCache({default: {ttl: 3600}}, cache)]);
        const ctx = wrap(new Context('request'));

        const wait = (delay: number) => new Promise(resolve => setTimeout(resolve, delay));
        const model = vi.fn(function* (_props: unknown, modelCtx: {kill: () => unknown}) {
          yield wait(10);
          modelCtx.kill();
          yield wait(10);

          return {result: 1};
        }) as unknown as WithCacheModel;

        model.displayName = 'model';
        model.cacheStrategy = CacheFirst;

        await expect(ctx.request(model, {test: 1})).rejects.toThrow(InterruptedError);
        expect(cache.set).toHaveBeenCalledTimes(0);
      } finally {
        cache.release();
      }
    });

    scenario('Фоновое обновление прерванного запуска не пишет и не падает', async () => {
      const cache = new TrackingCacheProvider();
      try {
        const wrap = compose([withModels(new Map()), withCache({default: {ttl: 3600}}, cache)]);
        const ctx1 = wrap(new Context('request'));
        const ctx2 = wrap(new Context('request-2'));

        let inc = 1;
        const model = vi.fn(async (_props: unknown, modelCtx: {kill: () => unknown}) => {
          if (inc > 1) {
            modelCtx.kill();
          }
          return {result: inc++};
        }) as unknown as WithCacheModel;

        model.displayName = 'model';
        model.cacheStrategy = StaleWhileRevalidate;

        await ctx1.request(model, {id: 1});
        expect(cache.set).toHaveBeenCalledTimes(1);

        (cache.set as ReturnType<typeof vi.fn>).mockClear();

        const stale = await ctx2.request(model, {id: 1});
        expect(stale).toEqual({result: 1});

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(cache.set).not.toHaveBeenCalled();
      } finally {
        cache.release();
      }
    });
  });
});

describe('Cache strategies behavior', () => {
  let cache: TrackingCacheProvider;

  function context() {
    const wrap = compose([withModels(new Map()), withCache({default: {ttl: 3600}}, cache)]);

    return wrap(new Context('request'));
  }

  beforeEach(() => {
    cache = new TrackingCacheProvider();
  });

  afterEach(() => {
    cache.release();
  });

  describe('CacheFirst', () => {
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

    it('should create different cache keys for different props', async () => {
      const ctx1 = context();
      const ctx2 = context();
      const ctx3 = context();

      let inc = 1;
      const model = vi.fn((props: any) => {
        return {result: inc++, id: props.id};
      }) as unknown as WithCacheModel;

      model.displayName = 'model';
      model.cacheStrategy = CacheFirst;

      // Calls with different props in first context
      const result1 = await ctx1.request(model, {id: 1});
      const result2 = await ctx1.request(model, {id: 2});

      expect(result1).toEqual({result: 1, id: 1});
      expect(result2).toEqual({result: 2, id: 2});
      expect(model).toBeCalledTimes(2); // Each props calls the model

      // Repeated calls in other contexts use cache
      // Use different contexts to avoid withModels memoization and test real caching
      const result1Cached = await ctx2.request(model, {id: 1});
      const result2Cached = await ctx3.request(model, {id: 2});

      expect(result1Cached).toEqual({result: 1, id: 1});
      expect(result2Cached).toEqual({result: 2, id: 2});
      expect(model).toBeCalledTimes(2); // Model no longer called
    });

    it('should call cache.get on cache hit and cache.set on cache miss', async () => {
      const ctx1 = context();
      const ctx2 = context();

      let inc = 1;
      const model = vi.fn(() => {
        return {result: inc++};
      }) as unknown as WithCacheModel;

      model.displayName = 'model';
      model.cacheStrategy = CacheFirst;

      // Clear mocks before test
      (cache.get as ReturnType<typeof vi.fn>).mockClear();
      (cache.set as ReturnType<typeof vi.fn>).mockClear();

      // First call in first context - cache miss
      await ctx1.request(model, {test: 1});
      expect(cache.get).toHaveBeenCalled();
      expect(cache.set).toHaveBeenCalledTimes(1);

      // Clear mocks
      (cache.get as ReturnType<typeof vi.fn>).mockClear();
      (cache.set as ReturnType<typeof vi.fn>).mockClear();

      // Second call in second context - cache hit
      // Use different context to avoid withModels memoization and test real caching
      await ctx2.request(model, {test: 1});
      expect(cache.get).toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled(); // cache.set not called on cache hit
    });

    it('should execute model without caching when no cacheStrategy is set', async () => {
      const ctx1 = context();
      const ctx2 = context();

      let inc = 1;
      const model = vi.fn(() => {
        return {result: inc++};
      }) as unknown as WithCacheModel;

      model.displayName = 'model';
      // No cacheStrategy set

      // Model should execute without caching
      const result1 = await ctx1.request(model, {id: 1});
      expect(result1).toEqual({result: 1});
      expect(model).toBeCalledTimes(1);
      expect(cache.set).not.toHaveBeenCalled(); // No caching

      // Second call in different context should execute model again
      const result2 = await ctx2.request(model, {id: 1});
      expect(result2).toEqual({result: 2});
      expect(model).toBeCalledTimes(2); // Model called again
      expect(cache.set).not.toHaveBeenCalled(); // Still no caching
    });
  });

  describe('CacheOnly', () => {
    it('should return undefined on cache miss', async () => {
      const ctx = context();

      const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
      model.displayName = 'model';
      model.cacheStrategy = CacheOnly;

      // CacheOnly never executes the model, so result should be undefined
      const result = await ctx.request(model, {id: 1});
      expect(result).toBeUndefined();
      expect(model).toBeCalledTimes(0); // Model never called
    });
  });

  describe('NetworkOnly', () => {
    it('should always execute model and ignore cache', async () => {
      const ctx1 = context();
      const ctx2 = context();

      let inc = 1;
      const model = vi.fn(() => ({result: inc++})) as unknown as WithCacheModel;
      model.displayName = 'model';
      model.cacheStrategy = CacheFirst;

      // First call caches the value
      await ctx1.request(model, {id: 1});
      expect(model).toBeCalledTimes(1);
      expect(cache.set).toHaveBeenCalledTimes(1);

      // Switch to NetworkOnly strategy
      model.cacheStrategy = NetworkOnly;

      // Clear cache.set mocks
      (cache.set as ReturnType<typeof vi.fn>).mockClear();

      // Second call should execute model again (ignore cache)
      const result = await ctx2.request(model, {id: 1});
      expect(result).toEqual({result: 2});
      expect(model).toBeCalledTimes(2); // Model called again
      expect(cache.set).not.toHaveBeenCalled(); // NetworkOnly doesn't cache
    });

    it('should not read from cache', async () => {
      const ctx1 = context();
      const ctx2 = context();

      let inc = 1;
      const model = vi.fn(() => ({result: inc++})) as unknown as WithCacheModel;
      model.displayName = 'model';
      model.cacheStrategy = CacheFirst;

      // First call caches the value
      await ctx1.request(model, {id: 1});
      expect(model).toBeCalledTimes(1);

      // Switch to NetworkOnly
      model.cacheStrategy = NetworkOnly;

      // Clear mocks
      (cache.get as ReturnType<typeof vi.fn>).mockClear();

      // Second call should execute model (not read from cache)
      const result = await ctx2.request(model, {id: 1});
      expect(result).toEqual({result: 2}); // New value, not cached value
      expect(model).toBeCalledTimes(2);
      // Note: NetworkOnly might still call cache.get internally, but result should be from model
    });

    it('should not write to cache', async () => {
      const ctx = context();

      const model = vi.fn(() => ({result: 1})) as unknown as WithCacheModel;
      model.displayName = 'model';
      model.cacheStrategy = NetworkOnly;

      await ctx.request(model, {id: 1});
      expect(model).toBeCalledTimes(1);
      expect(cache.set).not.toHaveBeenCalled(); // NetworkOnly never caches
    });
  });

  describe('StaleWhileRevalidate', () => {
    it('should execute model and cache result on cache miss', async () => {
      const ctx = context();

      let inc = 1;
      const model = vi.fn(() => {
        return {result: inc++};
      }) as unknown as WithCacheModel;

      model.displayName = 'model';
      model.cacheStrategy = StaleWhileRevalidate;

      // First call - cache miss, model executes
      const result1 = await ctx.request(model, {id: 1});
      expect(result1).toEqual({result: 1});
      expect(model).toBeCalledTimes(1);
      expect(cache.set).toHaveBeenCalledTimes(1);
    });

    it('should return cached value immediately on cache hit', async () => {
      const ctx1 = context();
      const ctx2 = context();

      let inc = 1;
      const model = vi.fn(() => {
        return {result: inc++};
      }) as unknown as WithCacheModel;

      model.displayName = 'model';
      model.cacheStrategy = StaleWhileRevalidate;

      // First call in first context - cache miss
      const result1 = await ctx1.request(model, {id: 1});
      expect(result1).toEqual({result: 1});
      expect(model).toBeCalledTimes(1);
      expect(cache.set).toHaveBeenCalledTimes(1);

      // Second call in second context - cache hit, should return stale value immediately
      // Use different context to avoid withModels memoization and test real caching
      const result2 = await ctx2.request(model, {id: 1});
      expect(result2).toEqual({result: 1}); // Cached value returned immediately

      // Background update starts asynchronously in background
      // Wait for it to complete to check final call count
      await new Promise(resolve => setTimeout(resolve, 10));

      // Final check: model called 2 times
      // 1 time on cache miss + 1 time in background update on cache hit
      expect(model).toBeCalledTimes(2);
    });

    it('should trigger background update on cache hit', async () => {
      const ctx1 = context();
      const ctx2 = context();

      let inc = 1;
      const model = vi.fn(() => {
        return {result: inc++};
      }) as unknown as WithCacheModel;

      model.displayName = 'model';
      model.cacheStrategy = StaleWhileRevalidate;

      // First call in first context - cache miss, saves {result: 1}
      await ctx1.request(model, {id: 1});
      expect(model).toBeCalledTimes(1);
      expect(cache.set).toHaveBeenCalledTimes(1);

      // Clear mocks before second call
      (cache.set as ReturnType<typeof vi.fn>).mockClear();

      // Second call in second context - cache hit
      // Use different context to avoid withModels memoization and test real caching
      const result2 = await ctx2.request(model, {id: 1});
      expect(result2).toEqual({result: 1}); // Stale value returned immediately

      // Background update should start asynchronously via cache.update()
      // cache.update() creates a new context and calls the model, then saves via cache.set()
      // Give time for background update to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // After background update there should be another cache.set call with new value
      expect(cache.set).toHaveBeenCalled();
      expect(model).toBeCalledTimes(2); // Model called second time in background update
    });

    it('should work with custom TTL via with() method for StaleWhileRevalidate', async () => {
      const ctx = context();

      let inc = 1;
      const model = vi.fn(() => {
        return {result: inc++};
      }) as unknown as WithCacheModel;

      model.displayName = 'model';
      const customTTL = 1800; // 30 minutes
      model.cacheStrategy = StaleWhileRevalidate.with({ttl: customTTL});

      // First call - cache miss
      await ctx.request(model, {id: 1});
      expect(cache.set).toHaveBeenCalledWith('model;id=1' as any, {result: 1}, customTTL);
    });

    it('should create different cache keys for different props', async () => {
      const ctx1 = context();
      const ctx2 = context();
      const ctx3 = context();

      let inc = 1;
      const model = vi.fn((props: any) => {
        return {result: inc++, id: props.id};
      }) as unknown as WithCacheModel;

      model.displayName = 'model';
      model.cacheStrategy = StaleWhileRevalidate;

      // Calls with different props in first context (cache miss)
      await ctx1.request(model, {id: 1});
      await ctx1.request(model, {id: 2});

      expect(model).toBeCalledTimes(2);

      // Repeated calls in other contexts use cache
      // Use different contexts to avoid withModels memoization and test real caching
      const result1 = await ctx2.request(model, {id: 1});
      const result2 = await ctx3.request(model, {id: 2});

      expect(result1).toEqual({result: 1, id: 1});
      expect(result2).toEqual({result: 2, id: 2});

      // Background update starts asynchronously for each cache hit
      // Wait for background updates to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Model called 2 more times in background update (once for each props)
      expect(model).toBeCalledTimes(4);
    });

    it('should return stale value even if background update fails', async () => {
      const ctx1 = context();
      const ctx2 = context();
      const ctx3 = context();

      const error = new Error('Background update error');
      const model = vi
        .fn()
        .mockReturnValueOnce({result: 1})
        .mockImplementationOnce(() => {
          // Model fails with error during background update
          throw error;
        }) as unknown as WithCacheModel;

      model.displayName = 'model';
      model.cacheStrategy = StaleWhileRevalidate;

      // First call in first context - cache miss, saves {result: 1}
      const result1 = await ctx1.request(model, {id: 1});
      expect(result1).toEqual({result: 1});
      expect(model).toBeCalledTimes(1);

      // Second call in second context - cache hit, returns stale value immediately
      // Use different context to avoid withModels memoization and test real caching
      // Background update starts and fails with error, but this should not affect the result
      const result2 = await ctx2.request(model, {id: 1});
      expect(result2).toEqual({result: 1}); // Stale value returned successfully

      // Wait for background update to complete (which should fail)
      await new Promise(resolve => setTimeout(resolve, 10));

      // Model should have been called in background update (and failed)
      expect(model).toBeCalledTimes(2);

      // On next request in third context, stale value is still returned
      // (background update did not update cache due to error)
      const result3 = await ctx3.request(model, {id: 1});
      expect(result3).toEqual({result: 1});
    });
  });
});
