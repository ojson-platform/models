import type {Context} from '../context';
import type {WithModels} from '../with-models';

import {wait} from '../utils';

export function withDeadline(timeout = 0) {
    return function<CTX extends WithModels<Context>>(ctx: CTX) {
        const {resolve, kill} = ctx;
        const [deadline, clear] = wait(timeout);

        ctx.kill = () => (clear(), kill.call(ctx));
        ctx.resolve = (value) => Promise.race([
            resolve.call(ctx, value),
            deadline.then(ctx.kill),
        ]);

        return ctx;
    };
}