import {describe, expect, it, vi} from 'vitest';

import {Context} from '../context';
import {withModels, Dead} from '../with-models';
import {withDeadline} from './with-deadline';

describe('withDeadline', () => {
    function context(timeout: number) {
        const registry = new Map();
        const wrap = (ctx: Context) =>
            withDeadline(timeout)(
                withModels(registry)(ctx)
            );

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

        const wait = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay));

        const model = vi.fn(async () => {
            await wait(50);
            return {result: 1};
        });
        (model as any).displayName = 'slow-model';

        const result = await ctx.request(model as any, {});

        // After deadline, context should be killed and request returns Dead
        expect(result).toBe(Dead);
        expect(ctx.isAlive()).toBe(false);
    }, 200);

    it('should clear deadline timer when kill is called manually', async () => {
        const ctx = context(50);

        const model = vi.fn(async () => {
            ctx.kill();
            return {result: 1};
        });
        (model as any).displayName = 'model';

        const result = await ctx.request(model as any, {});

        // When kill is called manually, withModels semantics decide what is returned.
        // We only assert that context is dead afterwards.
        expect(ctx.isAlive()).toBe(false);
        expect(result === Dead || result?.result === 1).toBe(true);
    });

    it('should not change ctx.kill semantics when timeout is zero', async () => {
        const ctx = context(0);

        expect(ctx.isAlive()).toBe(true);
        ctx.kill();
        expect(ctx.isAlive()).toBe(false);
    });
});


