import type {BaseContext} from '../context';
import type {WithModels} from '../with-models';

import {wait} from '../utils';

/**
 * Factory function that enhances a `WithModels` context with deadline support.
 *
 * It wraps the context's `resolve` method so that any pending model execution
 * is automatically cancelled via `ctx.kill()` if it does not complete within
 * the specified timeout.
 *
 * Semantics:
 * - `timeout` is applied to all async operations resolved through `ctx.resolve`.
 * - On timeout, `ctx.kill()` is called, and any in-flight `ctx.request` calls
 *   will fail with `InterruptedError` according to `withModels` semantics.
 * - `ctx.kill()` is wrapped to clear the internal timer before delegating to
 *   the original `kill`, so manual kills do not leak timers.
 *
 * This helper is typically composed after `withModels` (and other wrappers)
 * using `compose`.
 *
 * @param timeout - Deadline in milliseconds. `0` means no effective timeout.
 * @returns Wrapper function that adds deadline behavior to a `WithModels` context.
 *
 * @example
 * ```typescript
 * const wrap = compose([
 *   withModels(registry),
 *   withDeadline(5000), // 5s deadline for all model resolutions
 * ]);
 *
 * const ctx = wrap(new BaseContext('request'));
 * const result = await ctx.request(SlowModel); // Will be cancelled after 5s
 * ```
 */
export function withDeadline(timeout = 0) {
  return function <CTX extends WithModels<BaseContext>>(ctx: CTX) {
    // No-op when timeout is falsy (0 or negative): keep original behavior.
    if (timeout <= 0) {
      return ctx;
    }

    const {resolve, kill} = ctx;
    const [deadline, clear] = wait(timeout);

    ctx.kill = () => {
      clear();
      return kill.call(ctx);
    };
    ctx.resolve = value => Promise.race([resolve.call(ctx, value), deadline.then(ctx.kill)]);

    return ctx;
  };
}
