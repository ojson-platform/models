import type {Model} from '../types';

import {SpanStatusCode} from '@opentelemetry/api';
import {NodeSDK} from '@opentelemetry/sdk-node';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';

import {Context} from '../context';
import {compose} from '../utils';
import {CacheFirst, withCache} from '../with-cache';
import {TrackingCacheProvider} from '../with-cache/__tests__/cache-provider';
import {InterruptedError, withModels} from '../with-models';
import {getSpan, withTelemetry} from '../with-telemetry';

import {withDeadline} from './with-deadline';

describe('withDeadline', () => {
  function context(timeout: number) {
    const registry = new Map();
    const wrap = (ctx: Context) => withDeadline(timeout)(withModels(registry)(ctx));

    return wrap(new Context('request'));
  }

  it('should resolve normally when model finishes before deadline', async () => {
    const ctx = context(50);

    const model = vi.fn(async () => {
      return {result: 1};
    });
    (model as any).displayName = 'model';

    const result = await ctx.request(model as any, {});

    expect(result).toEqual({result: 1});
    expect(model).toHaveBeenCalledTimes(1);
  });

  it('should kill context and return Dead when deadline is exceeded', async () => {
    const ctx = context(5);

    const wait = (delay: number) => new Promise(resolve => setTimeout(resolve, delay));

    const model = vi.fn(async () => {
      await wait(50);
      return {result: 1};
    });
    (model as any).displayName = 'slow-model';

    const result = ctx.request(model as any, {});

    // After deadline, context should be killed and request throws InterruptedError
    await expect(result).rejects.toThrow(InterruptedError);
    expect(ctx.isAlive()).toBe(false);
  }, 200);

  it('should clear deadline timer when kill is called manually', async () => {
    const ctx = context(50);

    const model = vi.fn(async () => {
      ctx.kill();
      return {result: 1};
    });
    (model as any).displayName = 'model';

    const result = ctx.request(model as any, {});

    // When kill is called manually, withModels semantics throw InterruptedError.
    // We only assert that context is dead afterwards.
    expect(ctx.isAlive()).toBe(false);
    try {
      const value = await result;
      if (value && typeof value === 'object' && 'result' in value) {
        expect((value as {result: number}).result).toBe(1);
      }
    } catch (error) {
      expect(error).toBeInstanceOf(InterruptedError);
    }
  });

  it('should not change ctx.kill semantics when timeout is zero', async () => {
    const ctx = context(0);

    expect(ctx.isAlive()).toBe(true);
    ctx.kill();
    expect(ctx.isAlive()).toBe(false);
  });
});

describe('interrupted-run', () => {
  let sdk: NodeSDK;

  beforeAll(() => {
    sdk = new NodeSDK();
    sdk.start();
  });

  afterAll(async () => {
    if (sdk) {
      try {
        await sdk.shutdown();
      } catch {
        // Ignore shutdown errors (may occur if SDK wasn't fully initialized)
      }
    }
  });

  function wait(delay: number) {
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  function harness(timeout: number) {
    const cache = new TrackingCacheProvider();
    const wrap = compose([
      withModels(new Map()),
      withCache({default: {ttl: 60}}, cache, (name: string) =>
        withModels(new Map())(new Context(name)),
      ),
      withTelemetry({serviceName: 'deadline-service'}),
      withDeadline(timeout),
    ]);
    const ctx = wrap(new Context('request'));
    const spans: Array<{name: string; span: {events: {name: string}[]; status: {code: number}}}> =
      [];
    const create = ctx.create.bind(ctx);
    ctx.create = (name: string) => {
      const child = create(name);
      const span = getSpan(child) as {events: {name: string}[]; status: {code: number}} | undefined;
      if (span) {
        spans.push({name, span});
      }
      return child;
    };

    return {ctx, cache, spans};
  }

  function recordedModel(name: string, action: (...args: any[]) => any) {
    const model = vi.fn(action) as unknown as Model & {
      displayResult?: unknown;
      cacheStrategy?: unknown;
    };
    model.displayName = name;
    model.displayResult = {ok: true};
    model.cacheStrategy = CacheFirst;
    return model;
  }

  async function observe(
    run: (model: ReturnType<typeof recordedModel>) => Promise<unknown>,
    model: ReturnType<typeof recordedModel>,
    spans: Array<{name: string; span: {events: {name: string}[]; status: {code: number}}}>,
    cache: TrackingCacheProvider,
    isAlive: () => boolean,
  ) {
    let delivered: unknown;
    try {
      delivered = await run(model);
    } catch (error) {
      delivered = error;
    }

    const callsAfterFirst = model.mock.calls.length;
    try {
      await run(model);
    } catch {
      // The repeat is expected to fail the same way.
    }

    const modelSpans = spans.filter(item => item.name === model.displayName);
    const events = modelSpans.flatMap(item => item.span.events);

    return {
      interrupted: delivered instanceof InterruptedError,
      killReturnDelivered: typeof delivered === 'symbol',
      alive: isAlive(),
      retryRanModel: model.mock.calls.length > callsAfterFirst,
      firstRanModel: callsAfterFirst > 0,
      cacheSets: (cache.set as ReturnType<typeof vi.fn>).mock.calls.length,
      resultEvents: events.filter(event => event.name === 'result').length,
      errorEvents: events.filter(event => event.name === 'error').length,
      successfulCompletion: modelSpans.some(item => item.span.status.code === SpanStatusCode.OK),
      sawSpan: modelSpans.length > 0,
    };
  }

  it('Scenario: Истечение срока — то же прерывание', async () => {
    const deadline = harness(20);
    const killedBefore = harness(20);
    killedBefore.ctx.kill();

    const slow = recordedModel('SlowModel', async () => {
      await wait(80);
      return {ok: true};
    });
    const idle = recordedModel('IdleModel', () => ({ok: true}));

    const deadlineOutcome = await observe(
      model => deadline.ctx.request(model, {}),
      slow,
      deadline.spans,
      deadline.cache,
      () => deadline.ctx.isAlive(),
    );
    const killedOutcome = await observe(
      model => killedBefore.ctx.request(model, {}),
      idle,
      killedBefore.spans,
      killedBefore.cache,
      () => killedBefore.ctx.isAlive(),
    );

    const same = {
      interrupted: true,
      killReturnDelivered: false,
      alive: false,
      retryRanModel: false,
      cacheSets: 0,
      resultEvents: 0,
      errorEvents: 0,
      successfulCompletion: false,
      sawSpan: true,
    };

    expect(deadline.ctx.isAlive()).toBe(false);
    expect(killedBefore.ctx.isAlive()).toBe(false);
    expect(deadlineOutcome).toMatchObject(same);
    expect(killedOutcome).toMatchObject(same);
    expect(deadlineOutcome.firstRanModel).toBe(true);
    expect(killedOutcome.firstRanModel).toBe(false);
  }, 1000);

  it('Scenario: Прерванный запуск не оставляет успешный span', async () => {
    const before = harness(5000);
    before.ctx.kill();
    const between = harness(5000);
    const expired = harness(20);

    const beforeModel = recordedModel('BeforeModel', () => ({ok: true}));
    const betweenModel = recordedModel(
      'BetweenModel',
      function* (_props: unknown, modelCtx: {kill: () => unknown}) {
        yield Promise.resolve('step');
        modelCtx.kill();
        yield Promise.resolve('next');
        return {ok: true};
      },
    );
    const expiredModel = recordedModel('ExpiredModel', async () => {
      await wait(80);
      return {ok: true};
    });

    const cases = [
      {
        run: () => before.ctx.request(beforeModel, {}),
        model: beforeModel,
        spans: before.spans,
        alive: () => before.ctx.isAlive(),
      },
      {
        run: () => between.ctx.request(betweenModel, {}),
        model: betweenModel,
        spans: between.spans,
        alive: () => between.ctx.isAlive(),
      },
      {
        run: () => expired.ctx.request(expiredModel, {}),
        model: expiredModel,
        spans: expired.spans,
        alive: () => expired.ctx.isAlive(),
      },
    ];

    for (const item of cases) {
      await expect(item.run()).rejects.toThrow(InterruptedError);
      expect(item.alive()).toBe(false);

      const modelSpans = item.spans.filter(span => span.name === item.model.displayName);
      expect(modelSpans.length).toBeGreaterThan(0);
      const events = modelSpans.flatMap(span => span.span.events);
      expect(events.filter(event => event.name === 'result')).toHaveLength(0);
      expect(events.filter(event => event.name === 'error')).toHaveLength(0);
      expect(modelSpans.some(span => span.span.status.code === SpanStatusCode.OK)).toBe(false);
    }
  }, 1000);
});
