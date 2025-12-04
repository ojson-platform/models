# withCache

Caching helper for `withModels`-based server-side applications.

## Overview

`withCache` is a helper that enhances a `withModels`-aware `Context` with
configurable caching strategies. It lets you cache model results by
`displayName + props` and plug different strategies like `CacheFirst`,
`NetworkOnly`, `CacheOnly`, or `StaleWhileRevalidate`.

Caching is **orthogonal** to `withModels` memoization:

- `withModels` memoizes results **within a single context tree**.
- `withCache` adds **cross-request or shared caching** using a `CacheProvider`.

## Key Concepts

### CacheConfig

`CacheConfig` describes TTL (time-to-live, in seconds) per strategy:

```ts
type CacheConfig = {
  default?: { ttl: number };
  'cache-first'?: { ttl: number };
  'network-only'?: { ttl: number };
  'cache-only'?: { ttl: number };
  'stale-while-revalidate'?: { ttl: number };
};
```

Rules:

- Each `ttl` must be a **positive number** (`> 0`).
- Strategy-specific TTL overrides `default.ttl` for that strategy.
- If neither strategy-specific nor default TTL is set, using that strategy
  will throw an error.

### CacheProvider vs Cache

- **CacheProvider** — low-level storage:

  ```ts
  export type CacheProvider = {
    get(key: Key): Promise<Json | undefined>;
    set(key: Key, value: Json, ttl: number): Promise<void>;
  };
  ```

- **Cache** — wrapper around `CacheProvider` that:
  - builds keys from model and props;
  - exposes `get`, `set`, `update`;
  - encapsulates Dead-aware behavior.

`withCache` always takes a **CacheProvider** and creates a `Cache`
internally. When using it directly, you create a `Cache` from a provider.

### Cache strategies

Strategies are implemented in `cache-strategy.ts` and define how cache
is used:

- **CacheOnly**:
  - Reads only from cache.
  - Never executes the model.
  - Returns `undefined` on cache miss.

- **NetworkOnly**:
  - Always executes the model.
  - Does not read from or write to cache.

- **CacheFirst**:
  - Tries to read from cache first.
  - On cache miss, executes the model and stores the result in cache.

- **StaleWhileRevalidate**:
  - On cache miss: same as CacheFirst (execute model, write to cache).
  - On cache hit:
    - returns cached value immediately;
    - triggers background cache update via `Cache.update`.

Strategies are attached through the static `cacheStrategy` field on the model:

```ts
import {CacheFirst, StaleWhileRevalidate} from './cache-strategy';

MyModel.cacheStrategy = CacheFirst;
OtherModel.cacheStrategy = StaleWhileRevalidate.with({ttl: 1800});
```

### Dead-aware caching

`withModels` may return the special `Dead` symbol when a context has
been killed (`ctx.kill()`) or execution was interrupted.

`withCache` guarantees:

- **Dead is never cached**:
  - `CacheFirst` and `StaleWhileRevalidate` check the result before writing;
  - `Cache.update` also checks for `Dead` and skips writing in that case.
- Strategies always either:
  - return a JSON value;
  - or propagate `Dead` to the caller.

### disableCache and withModels memoization

A context wrapped with `withCache` gets:

- `disableCache()` — disables cache strategies for this context and its children.
- `shouldCache()` — tells whether caching is currently enabled.

Important:

- `disableCache()` **does not disable** `withModels` memoization.
- Within a single context tree, repeated `request` calls with the same
  `(model, props)` will still be served from the `withModels` registry,
  even when cache strategies are disabled.

## Installation

```ts
import {withCache} from './with-cache';
import {Cache} from './cache';
import {MemoryCache} from './cache-provider';
```

## Basic Usage

### 1. Configure CacheProvider and Cache

```ts
import {Cache} from './with-cache/cache';
import {MemoryCache} from './with-cache/cache-provider';

const provider = new MemoryCache();
const cache = new Cache(
  {default: {ttl: 3600}}, // 1 hour
  provider
);
```

### 2. Enhance Context with withModels and withCache

```ts
import {withModels} from './with-models';
import {withCache} from './with-cache';
import {Context} from './context';

const registry = new Map();

const wrap = (ctx: Context) =>
  withCache(cache.config, cache.provider)(
    withModels(registry)(ctx)
  );

const ctx = wrap(new Context('request'));
```

> Note: in real applications you can use `compose` to combine multiple
> wrappers if the typing works well for your stack.

### 3. Attach a cache strategy to a model

```ts
import {CacheFirst} from './with-cache/cache-strategy';

async function UserModel(props, ctx) {
  const response = await fetch(`/api/users/${props.id}`);
  return await response.json();
}

UserModel.displayName = 'UserModel';
UserModel.cacheStrategy = CacheFirst;
```

### 4. Request models through the cached context

```ts
const user = await ctx.request(UserModel, {id: 123});
```

## Advanced Usage

### Strategy.with(config)

Each strategy exposes `.with({ttl})`, which creates a new instance of
the strategy with its own TTL:

```ts
import {StaleWhileRevalidate} from './with-cache/cache-strategy';

MyModel.cacheStrategy = StaleWhileRevalidate.with({ttl: 1800});
```

Details:

- When calling `with({ttl})` you pass the **short format**: only `{ttl: number}`.
- Internally it is wrapped into a full `CacheConfig`
  like `{ 'stale-while-revalidate': {ttl} }`.
- A strategy always reads TTL from its own key first, then from
  `default.ttl`.

### Cache.update(model, props, ttl)

`Cache.update` is a low-level helper primarily used by the
`StaleWhileRevalidate` strategy:

- creates a new `Context('cache')` and wraps it with `withModels`;
- calls `ctx.request(model, props)`;
- if the result is **not** `Dead`, writes it into the `CacheProvider`
  with the provided `ttl`;
- memoizes parallel updates by key:
  - multiple concurrent `update` calls for the same `(model, props)`
    share a single Promise;
  - once finished, the entry in `_updates` is cleared.

## API Overview

### withCache(config, provider)

```ts
function withCache(config: CacheConfig, provider: CacheProvider) {
  return function <T extends Context>(ctx: T): WithCache<WithModels<T>> { ... }
}
```

`withCache` extends the context with:

- `disableCache()`
- `shouldCache(): boolean`
- `request()` (overridden, Dead-aware, taking strategies into account)

### Cache

Main methods:

- `key(model, props): Key` — builds a cache key.
- `get(key): Promise<Json | undefined>` — reads a value from the provider.
- `set(key, value, ttl): Promise<void>` — writes JSON into the provider.
- `update(model, props, ttl): Promise<void>` — background update, Dead-aware,
  with deduplication by key.

## Testing Notes

For tests it is recommended to use `TrackingCacheProvider` from
`src/with-cache/__tests__/cache-provider.ts`:

- it implements the `CacheProvider` interface;
- its `get` and `set` methods are `vi.fn()`, convenient for assertions;
- it exposes a handy `release()` method to clear internal state.

Key testing scenarios:

- correct behavior of strategies (`CacheOnly`, `NetworkOnly`, `CacheFirst`,
  `StaleWhileRevalidate`);
- ensuring Dead is never cached;
- behavior when `disableCache()` is used;
- correct TTL handling (including invalid config cases);
- deduplication of background updates in `Cache.update`.


