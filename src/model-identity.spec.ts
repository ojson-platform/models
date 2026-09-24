import type {Model, OJson} from './types';
import type {WithCacheModel} from './with-cache';

import {requirement, scenario, spec} from '@ojson/spec-coverage';
import {afterEach, expect, vi} from 'vitest';

import {Context} from './context';
import * as packageRoot from './index';
import {CacheFirst, withCache} from './with-cache';
import {TrackingCacheProvider} from './with-cache/__tests__/cache-provider';
import {withModels} from './with-models';
import {compose, modelIdentity} from './utils';

const providers: TrackingCacheProvider[] = [];

afterEach(() => {
  for (const provider of providers) {
    provider.release();
  }
  providers.length = 0;
});

function namedModel(displayName: string, action?: (props: OJson) => OJson): Model {
  const model = vi.fn(action ?? (() => ({ok: true}))) as unknown as Model;
  model.displayName = displayName;
  return model;
}

function cachedContext(provider: TrackingCacheProvider) {
  providers.push(provider);
  const wrap = compose([
    withModels(new Map()),
    withCache({default: {ttl: 60}}, provider, (name: string) =>
      withModels(new Map())(new Context(name)),
    ),
  ]);

  return wrap(new Context('request'));
}

spec('model-identity', () => {
  requirement('Именованная Model и объект props дают один текст', () => {
    scenario('Повтор в одном запросе не выполняет Model', async () => {
      const model = namedModel('M');
      const ctx = withModels(new Map())(new Context('request'));
      const props = {a: 1};

      const first = await ctx.request(model, props);
      const second = await ctx.request(model, props);

      expect(model).toHaveBeenCalledTimes(1);
      expect(first).toEqual(second);
    });

    scenario('Порядок свойств не различает вызов', async () => {
      const model = namedModel('M');
      const firstIdentity = modelIdentity(model, {a: 1, b: 2});
      const secondIdentity = modelIdentity(model, {b: 2, a: 1});

      expect(firstIdentity.key).toBe(secondIdentity.key);

      const ctx = withModels(new Map())(new Context('request'));
      await ctx.request(model, {a: 1, b: 2});
      await ctx.request(model, {b: 2, a: 1});

      expect(model).toHaveBeenCalledTimes(1);
    });

    scenario('Другое имя или другие props — другая идентичность', async () => {
      const provider = new TrackingCacheProvider();
      const firstModel = namedModel('M1') as WithCacheModel;
      const secondModel = namedModel('M2') as WithCacheModel;
      firstModel.cacheStrategy = CacheFirst;
      secondModel.cacheStrategy = CacheFirst;

      const ctx = cachedContext(provider);
      await ctx.request(firstModel, {a: 1});
      await ctx.request(secondModel, {a: 1});

      expect(firstModel).toHaveBeenCalledTimes(1);
      expect(secondModel).toHaveBeenCalledTimes(1);

      const sameName = namedModel('M') as WithCacheModel;
      sameName.cacheStrategy = CacheFirst;
      const propsCtx = cachedContext(provider);

      await propsCtx.request(sameName, {a: 1});
      await propsCtx.request(sameName, {a: 2});

      expect(sameName).toHaveBeenCalledTimes(2);
    });

    scenario('Кэш хранит вызов под этим текстом', async () => {
      const provider = new TrackingCacheProvider();
      const model = namedModel('M') as WithCacheModel;
      model.cacheStrategy = CacheFirst;

      const first = cachedContext(provider);
      const second = cachedContext(provider);

      await first.request(model, {a: 1});
      await second.request(model, {a: 1});

      expect(model).toHaveBeenCalledTimes(1);
      expect(provider.get).toHaveBeenCalledWith('M;a=1');
      expect(provider.set).toHaveBeenCalledWith('M;a=1', {ok: true}, expect.any(Number));
    });
  });

  requirement('Пропущенное свойство объекта и undefined — та же идентичность', () => {
    scenario('Необязательное свойство undefined совпадает с пропуском', async () => {
      const seen: OJson[] = [];
      const model = namedModel('M', props => {
        seen.push(props);
        return {ok: true};
      });
      const ctx = withModels(new Map())(new Context('request'));

      await ctx.request(model, {a: 1, extra: undefined});
      await ctx.request(model, {a: 1});

      expect(model).toHaveBeenCalledTimes(1);
      expect(seen).toEqual([{a: 1}]);
      expect('extra' in seen[0]).toBe(false);
    });

    scenario('Вложенный undefined не доходит до Model', async () => {
      const seen: OJson[] = [];
      const model = namedModel('M', props => {
        seen.push(props);
        return {ok: true};
      });
      const ctx = withModels(new Map())(new Context('request'));
      const withUndefined = {a: 1, nested: {b: undefined, c: 2}};
      const without = {a: 1, nested: {c: 2}};

      await ctx.request(model, withUndefined);
      await ctx.request(model, without);

      expect(model).toHaveBeenCalledTimes(1);
      expect(seen).toEqual([{a: 1, nested: {c: 2}}]);
      expect('b' in (seen[0].nested as OJson)).toBe(false);
    });

    scenario('Предустановка с undefined находится обращением без свойства', async () => {
      const model = namedModel('M');
      const ctx = withModels(new Map())(new Context('request'));

      ctx.set(model, {saved: true}, {a: 1, extra: undefined});

      await expect(ctx.request(model, {a: 1})).resolves.toEqual({saved: true});
      expect(model).not.toHaveBeenCalled();
    });

    scenario('Кэш соединяет пропуск свойства и undefined', async () => {
      const provider = new TrackingCacheProvider();
      const model = namedModel('M') as WithCacheModel;
      model.cacheStrategy = CacheFirst;

      const first = cachedContext(provider);
      const second = cachedContext(provider);

      await first.request(model, {a: 1, extra: undefined});
      await second.request(model, {a: 1});

      expect(model).toHaveBeenCalledTimes(1);
      expect(provider.get).toHaveBeenCalledWith('M;a=1');
    });

    scenario('null, false, ноль и пустая строка отличают вызов', async () => {
      for (const value of [null, false, 0, ''] as const) {
        const model = namedModel('M');
        const ctx = withModels(new Map())(new Context('request'));

        await ctx.request(model, {a: value});
        await ctx.request(model, {});

        expect(model).toHaveBeenCalledTimes(2);
      }
    });
  });

  requirement('Model без имени', () => {
    scenario('Обращение и предустановка без имени отвергаются', async () => {
      const unnamed = vi.fn(() => ({ok: true})) as unknown as Model;

      expect(() => modelIdentity(unnamed, {a: 1})).toThrow(
        new TypeError('Model should define static displayName property'),
      );

      const ctx = withModels(new Map())(new Context('request'));
      const requestModel = vi.fn(() => ({ok: true})) as unknown as Model;

      await expect(ctx.request(requestModel, {a: 1})).rejects.toThrow(
        new TypeError('Model should define static displayName property'),
      );
      expect(requestModel).not.toHaveBeenCalled();

      const preset = vi.fn(() => ({ok: true})) as unknown as Model;

      expect(() => ctx.set(preset, {ok: true}, {a: 1})).toThrow(
        new TypeError('Model should define static displayName property'),
      );
      expect(preset).not.toHaveBeenCalled();
    });

    scenario('Кэш не даёт идентичность Model без имени', async () => {
      const provider = new TrackingCacheProvider();
      const model = vi.fn(() => ({ok: true})) as unknown as WithCacheModel;
      model.cacheStrategy = CacheFirst;

      const ctx = cachedContext(provider);

      await expect(ctx.request(model, {a: 1})).rejects.toThrow(
        new TypeError('Model should define static displayName property'),
      );
      expect(model).not.toHaveBeenCalled();
      expect(provider.get).not.toHaveBeenCalled();
      expect(provider.set).not.toHaveBeenCalled();
    });

    scenario('Пустое имя не получает идентичность', async () => {
      const empty = namedModel('');
      const ctx = withModels(new Map())(new Context('request'));

      await expect(ctx.request(empty, {a: 1})).rejects.toThrow(
        new TypeError('Model should define static displayName property'),
      );
      expect(empty).not.toHaveBeenCalled();

      const preset = namedModel('');

      expect(() => ctx.set(preset, {ok: true}, {a: 1})).toThrow(
        new TypeError('Model should define static displayName property'),
      );
      expect(preset).not.toHaveBeenCalled();

      const provider = new TrackingCacheProvider();
      const cached = namedModel('') as WithCacheModel;
      cached.cacheStrategy = CacheFirst;

      const cachedCtx = cachedContext(provider);

      await expect(cachedCtx.request(cached, {a: 1})).rejects.toThrow(
        new TypeError('Model should define static displayName property'),
      );
      expect(cached).not.toHaveBeenCalled();
      expect(provider.get).not.toHaveBeenCalled();
      expect(provider.set).not.toHaveBeenCalled();
    });
  });

  requirement('Обращение без props', () => {
    scenario('Без props мемоизация передаёт пустой объект', async () => {
      const seen: OJson[] = [];
      const model = namedModel('M', props => {
        seen.push(props);
        return {ok: true};
      });
      const ctx = withModels(new Map())(new Context('request'));

      await ctx.request(model);
      await ctx.request(model);

      expect(model).toHaveBeenCalledTimes(1);
      expect(seen).toEqual([{}]);
      expect(modelIdentity(model)).toEqual({key: 'M;', props: {}});
    });

    scenario('Предустановка без props находится таким же обращением', async () => {
      const model = namedModel('M');
      const identity = modelIdentity(model);

      expect(identity).toEqual({key: 'M;', props: {}});

      const ctx = withModels(new Map())(new Context('request'));
      ctx.set(model, {ok: true});

      await expect(ctx.request(model)).resolves.toEqual({ok: true});
      expect(model).not.toHaveBeenCalled();

      const same = namedModel('M');
      const sameCtx = withModels(new Map())(new Context('request'));
      sameCtx.set(same, {ok: true}, identity.props);

      await expect(sameCtx.request(same)).resolves.toEqual({ok: true});
      expect(same).not.toHaveBeenCalled();
    });

    scenario('Кэш без props берёт ключ пустого объекта', async () => {
      const provider = new TrackingCacheProvider();
      const seen: OJson[] = [];
      const model = namedModel('M', props => {
        seen.push(props);
        return {ok: true};
      }) as WithCacheModel;
      model.cacheStrategy = CacheFirst;

      const first = cachedContext(provider);
      const second = cachedContext(provider);

      await expect(first.request(model)).resolves.toEqual({ok: true});
      await expect(second.request(model, {})).resolves.toEqual({ok: true});

      expect(seen).toEqual([{}]);
      expect(model).toHaveBeenCalledTimes(1);
      expect(provider.get).toHaveBeenCalledWith('M;');
      expect(provider.set).toHaveBeenCalledWith('M;', {ok: true}, expect.any(Number));
    });
  });

  requirement('Один ответ даёт ключ Model и её props', () => {
    scenario('Один ответ содержит прежний ключ и props', async () => {
      expect(packageRoot).not.toHaveProperty('modelIdentity');

      const identity = modelIdentity(namedModel('M'), {a: 1});
      expect(identity).toEqual({key: 'M;a=1', props: {a: 1}});

      const seen: OJson[] = [];
      const model = namedModel('M', props => {
        seen.push(props);
        return {ok: true};
      });
      const ctx = withModels(new Map())(new Context('request'));

      await ctx.request(model, {a: 1});
      await ctx.request(model, {a: 1});

      expect(model).toHaveBeenCalledTimes(1);
      expect(seen).toEqual([{a: 1}]);

      const preset = namedModel('M');
      const presetCtx = withModels(new Map())(new Context('request'));
      presetCtx.set(preset, {ok: true}, {a: 1});

      await expect(presetCtx.request(preset, {a: 1})).resolves.toEqual({ok: true});
      expect(preset).not.toHaveBeenCalled();

      const provider = new TrackingCacheProvider();
      const cached = namedModel('M', props => {
        seen.push(props);
        return {ok: true};
      }) as WithCacheModel;
      cached.cacheStrategy = CacheFirst;

      const first = cachedContext(provider);
      const second = cachedContext(provider);

      await first.request(cached, {a: 1});
      await second.request(cached, {a: 1});

      expect(cached).toHaveBeenCalledTimes(1);
      expect(seen[1]).toEqual({a: 1});
      expect(provider.get).toHaveBeenCalledWith('M;a=1');
      expect(provider.set).toHaveBeenCalledWith('M;a=1', {ok: true}, expect.any(Number));
    });

    scenario('Пропуск свойства и undefined — один ответ', async () => {
      const model = namedModel('M');
      const withUndefined = modelIdentity(model, {a: 1, extra: undefined});
      const without = modelIdentity(model, {a: 1});

      expect(withUndefined.key).toBe(without.key);
      expect(withUndefined.key).toBe('M;a=1');
      expect(withUndefined.props).toEqual({a: 1});
      expect(without.props).toEqual({a: 1});
      expect('extra' in withUndefined.props).toBe(false);
      expect('extra' in without.props).toBe(false);

      const requestModel = namedModel('M');
      const ctx = withModels(new Map())(new Context('request'));

      await ctx.request(requestModel, {a: 1, extra: undefined});
      await ctx.request(requestModel, {a: 1});

      expect(requestModel).toHaveBeenCalledTimes(1);
      expect(requestModel).toHaveBeenCalledWith({a: 1}, expect.anything());

      const preset = namedModel('M');
      const presetCtx = withModels(new Map())(new Context('request'));
      presetCtx.set(preset, {saved: true}, {a: 1, extra: undefined});

      await expect(presetCtx.request(preset, {a: 1})).resolves.toEqual({saved: true});
      expect(preset).not.toHaveBeenCalled();

      const provider = new TrackingCacheProvider();
      const cached = namedModel('M') as WithCacheModel;
      cached.cacheStrategy = CacheFirst;

      const first = cachedContext(provider);
      const second = cachedContext(provider);

      await first.request(cached, {a: 1, extra: undefined});
      await second.request(cached, {a: 1});

      expect(cached).toHaveBeenCalledTimes(1);
      expect(provider.get).toHaveBeenCalledWith('M;a=1');
      expect(provider.set).toHaveBeenCalledWith('M;a=1', {ok: true}, expect.any(Number));
      expect(provider.get).not.toHaveBeenCalledWith(expect.stringContaining('extra'));
      expect(provider.set).not.toHaveBeenCalledWith(
        expect.stringContaining('extra'),
        expect.anything(),
        expect.anything(),
      );
    });

    scenario('Вложенный undefined не входит в ответ', async () => {
      const seen: OJson[] = [];
      const model = namedModel('M', props => {
        seen.push(props);
        return {ok: true};
      });
      const props = {a: 1, nested: {b: undefined, c: 2}};
      const identity = modelIdentity(model, props);

      expect(identity.key).toBe('M;a=1&nested=c%3D2');
      expect(identity.props).toEqual({a: 1, nested: {c: 2}});
      expect('b' in (identity.props.nested as OJson)).toBe(false);

      const ctx = withModels(new Map())(new Context('request'));
      await ctx.request(model, props);

      expect(seen).toEqual([{a: 1, nested: {c: 2}}]);
      expect('b' in (seen[0].nested as OJson)).toBe(false);
    });

    scenario('null, false, ноль и пустая строка остаются в ответе', () => {
      const model = namedModel('M');
      const absent = modelIdentity(model, {});

      for (const value of [null, false, 0, ''] as const) {
        const identity = modelIdentity(model, {a: value});

        expect(identity.props).toEqual({a: value});
        expect(identity.key).not.toBe(absent.key);
      }
    });
  });
});
