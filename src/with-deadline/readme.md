# withDeadline

Deadline/timeout helper for `withModels`-based contexts.

## Overview

`withDeadline` is a small helper that wraps a `WithModels` context and
adds a simple deadline mechanism for async model execution:

- It intercepts `ctx.resolve` and races it against a timeout.
- If the timeout fires first, it calls `ctx.kill()`.
- Any in-flight `ctx.request` will then observe `Dead` according to
  `withModels` semantics.

This is useful when you want to **bound the total time** a request can
spend waiting on models (e.g. external APIs) without baking timeouts
into each individual model.

## Key Concepts

### Deadline vs model-level timeouts

- `withDeadline` works at the **context** level:
  - it does not know anything about specific models;
  - it only wraps `ctx.resolve`.
- Model-level timeouts (inside a specific model) are still possible
  and can coexist with `withDeadline`.

### Interaction with `withModels`

- `withDeadline` assumes the context already has `withModels` applied.
- It does **not** change memoization — only how `resolve` behaves over
  time:
  - normal flow: `resolve` just awaits the model's promise;
  - deadline exceeded: `resolve` races against a timer that calls
    `ctx.kill()`.

### Timeout semantics

- `timeout > 0`:
  - deadlines are active;
  - all async operations resolved via `ctx.resolve` are subject to the
    timeout.
- `timeout <= 0`:
  - `withDeadline` is effectively a no-op (just returns the context
    untouched).

## Installation

```ts
import {withDeadline} from './with-deadline';
import {withModels} from './with-models';
import {Context} from './context';
```

## Basic Usage

### 1. Compose with `withModels`

```ts
import {compose} from './utils';

const registry = new Map();

const wrap = compose([
  withModels(registry),
  withDeadline(5000), // 5 seconds
]);

const ctx = wrap(new Context('request'));
```

### 2. Use `ctx.request` as usual

```ts
async function SlowModel(props, ctx) {
  await new Promise(resolve => setTimeout(resolve, 10000)); // 10s
  return {ok: true};
}
SlowModel.displayName = 'SlowModel';

const result = await ctx.request(SlowModel, {});
if (result === Dead) {
  // Execution was cancelled by the deadline
}
```

## Advanced Usage

### Disabling deadlines

If you want to keep the wiring in place but temporarily disable
deadlines (e.g. in tests or certain environments), you can pass `0`:

```ts
const wrap = compose([
  withModels(registry),
  withDeadline(0), // no deadline
]);
```

In this case `withDeadline` returns the context unchanged, and all
behavior is controlled solely by `withModels`.

### Combining with other helpers

`withDeadline` is designed to compose cleanly with other helpers:

```ts
const wrap = compose([
  withModels(registry),
  withCache(cacheConfig, cacheProvider),
  withDeadline(2000),
]);

const ctx = wrap(new Context('request'));
```

Order usually looks like:

1. `withModels` — base models and memoization.
2. `withCache` / `withOverrides` / `withTelemetry` — caching, overrides,
   telemetry/tracing, etc.
3. `withDeadline` — on top to cut off long-running operations.

## API Overview

### `withDeadline(timeout?: number)`

```ts
function withDeadline(timeout?: number): <CTX extends WithModels<Context>>(ctx: CTX) => CTX;
```

- **`timeout`**: number of milliseconds.
  - `timeout > 0` — deadline is active.
  - `timeout <= 0` — no-op.
- Returns a wrapper that:
  - wraps `ctx.resolve` with `Promise.race` against a timer;
  - wraps `ctx.kill` to clear the timer before delegating to the original kill.

## Testing Notes

Key scenarios for `withDeadline`:

- Model finishes **before** the deadline:
  - the result is returned as normal;
  - the context stays alive.
- Model finishes **after** the deadline:
  - `ctx.kill()` is called;
  - `ctx.request` returns `Dead`;
  - `ctx.isAlive()` becomes `false`.
- Manual `ctx.kill()` call:
  - the timer should be cleared;
  - there should be no extra side effects introduced by `withDeadline`.

See `src/with-deadline/with-deadline.spec.ts` for concrete examples.

## See Also

- [withModels](../with-models/readme.md) - Core memoization helper (required dependency)
- [withCache](../with-cache/readme.md) - Adds caching layer
- [withOverrides](../with-overrides/readme.md) - Model substitution for testing
- [withTelemetry](../with-telemetry/readme.md) - OpenTelemetry tracing integration

