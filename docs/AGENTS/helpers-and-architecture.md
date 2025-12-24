# Agent Guide – Helpers and Architecture

## Helper Modules

Helpers are wrappers around a `WithModels` context. They extend the context with additional behavior (caching, telemetry, overrides, deadlines) while preserving the core `request`/memoization semantics.

### withCache – agent-facing notes

- **Cache configuration and TTL**:
  - `CacheConfig` has the shape `{default: {ttl?: number, zip?: boolean}, 'cache-first': {ttl?: number, zip?: boolean}, ...}`.
  - `ttl` is optional - if not specified in strategy config, uses `default.ttl`.
  - `zip` is optional and defaults to `false`. When `true`, values are compressed using zlib deflate before storing and decompressed when reading.
  - `Strategy.with()` (e.g. `CacheFirst.with({ttl: 1800, zip: true})`) accepts the short form `{ttl?: number, zip?: boolean}` and internally wraps it into a per-strategy `CacheConfig`.

- **CacheProvider vs Cache**:
  - `CacheProvider` is the low-level storage (`get(key)`, `set(key, value, ttl)`).
  - `Cache` wraps a `CacheProvider` and adds `key()`, `get()`, `set()`, `update()` helpers.
  - The `createContext` factory passed to `Cache` (or `withCache`) is used by `Cache.update` to create background contexts. If the created context has `disableCache()`, it will be called automatically to prevent recursive caching.

- **CacheFirst strategy behavior**:
  - Uses `CacheOnly` + `NetworkOnly`:
    - cache miss → calls the model, then `cache.set(key, value, ttl)` if `shouldCache()` is `true`;
    - cache hit → returns the cached value from `cache.get` and **does not** call `cache.set`.

### withOverrides – agent-facing notes

- `withOverrides(overrides)` wraps a `WithModels` context and replaces models according to a `Map<Model, Model>`.
- Overrides are resolved transitively:
  - if `A → B` and `B → C`, then requests for `A` and `B` both delegate to `C`.
- Overrides are applied at the `request` level only:
  - memoization still happens at the final model + props key.
- `ctx.create` is wrapped so that child contexts inherit the same overrides.

### withTelemetry – agent-facing notes

- `withTelemetry(config)` wraps a `WithModels` context and adds OpenTelemetry tracing:
  - creates a span for each context (named after `ctx.name`);
  - sets up parent-child span relationships based on context hierarchy;
  - records model props/result/errors as span attributes and events;
  - marks spans as failed when `ctx.fail()` is called;
  - wraps `ctx.event()` from `withModels` to record events in OpenTelemetry spans.
- **SDK Requirement**: `withTelemetry` expects an OpenTelemetry SDK with AsyncLocalStorage-based context management (e.g. `NodeSDK` from `@opentelemetry/sdk-node`). If proper SDK is not initialized, helpers relying on active OTEL context will not behave correctly.
- Models can optionally provide telemetry configuration via `displayProps`, `displayResult`, and `displayTags` properties.
- Props are recorded before model execution, results after (if not interrupted).
- Only object errors get error events (strings and primitives only set status).
- `ctx.create` is wrapped so that child contexts inherit telemetry and create child spans.
- The `event()` method is available on all `WithModels` contexts (as a no-op), and `withTelemetry` wraps it to add span recording. Other helpers (e.g. `withCache`) can call `ctx.event()` without knowing if telemetry is enabled.

#### Helper module structure and API patterns

- **Module decomposition for complex helpers (with-telemetry, with-cache, with-overrides, future `with-*`)**:
  - split helpers into three kinds of files:
    - `*.ts` – core logic and wrapping of the context;
    - `types.ts` – public types and internal symbols for the helper;
    - `utils.ts` – pure helper functions (no side effects, no context mutation).
  - This keeps files small, improves navigation, and makes it clear where to add new types vs. logic vs. utilities.

- **Public types in `types.ts` (required for helper modules)**:
  - all public types of a helper module (e.g. `WithTelemetry`, `ModelWithTelemetry`, `TelemetryConfig` for telemetry) must be declared in `types.ts`;
  - the module entry point (`index.ts`) should:
    - re-export types via `export type * from './types';`;
    - re-export implementations via `export {withTelemetry, getSpan} from './with-telemetry';` (or analogous functions for other helpers).
  - new helper modules (future `with-*`) should follow the same pattern: **public types in `types.ts`, implementation in separate files**.

- **Test access to internals without exposing private symbols**:
  - internal state (e.g. telemetry span stored under a symbol like `__Span__`) must not be accessed directly outside the helper implementation;
  - for tests and debugging, prefer small dedicated helpers that expose read-only views of internals, e.g. `getSpan(ctx: Context): Span | undefined` in `with-telemetry`;
  - tests and examples should use these helpers instead of `(ctx as any)[internalSymbol]`;
  - if a new helper needs test-time access to internals, add a focused helper function (similar to `getSpan`) rather than exporting internal symbols.

### withDeadline – agent-facing notes

- `withDeadline(timeout)` wraps a `WithModels` context and races `ctx.resolve` against a timer:
  - if the timer wins, it calls `ctx.kill()`;
  - in-flight `ctx.request` calls then observe interruption according to `withModels` semantics.
- `timeout <= 0` is treated as a no-op: the context is returned unchanged.
- Helpers should typically be composed in this order:
  - `withModels` → other helpers (`withCache`, `withOverrides`, `withTelemetry`) → `withDeadline`.
- `withDeadline` does not change memoization or cache behavior, it only controls how long we wait for async model resolutions.

### `ctx.set()` pattern – agent-facing notes

- `ctx.set(model, value)` is a method added by `withModels` that allows setting pre-computed values for request-dependent models.
- This pattern is used for models that depend on request data (e.g., Express `Request` parameters) to avoid mutability issues and ensure deterministic memoization.
- Models using this pattern should throw an error if called directly, indicating they should be set via `ctx.set()`.
- Values set via `ctx.set()` are stored in the same registry as `ctx.request()` and returned when the model is requested.
- This pattern ensures immutable snapshots of only the data actually needed, avoiding god objects and unnecessary copying.
- See [ADR 0002](../ADR/0002-ctx-set-pattern.md) for detailed rationale and implementation.

### Model Registry – implementation notes

The registry (`Map<Key, Promise<unknown>>`) is shared across contexts in the same request. This enables:

- memoization across nested contexts;
- proper cleanup on errors (promise rejection removes from registry).

### Generator Handling – implementation notes

Generators support nested generators and promises:

- values can be generators (nested execution);
- values can be promises (awaited);
- generators can be interrupted via `kill()`;
- state is managed with a stack for nested generators.

### Context Hierarchy – implementation notes

Contexts form a tree structure:

- child contexts inherit the parent's registry;
- `kill()` propagates through the hierarchy (shared state);
- telemetry spans follow context hierarchy;
- child contexts are created via `ctx.create(name)`, which returns a new context with the same registry.

### Module Boundaries – architecture notes

Modules in `src/with-*/` must respect strict boundaries:

- **Cross-module imports**: Modules can only import from other modules via their `index.ts` files, not from internal files (e.g., `types.ts`, `utils.ts`, `with-*.ts`).
- **Enforcement**: ESLint rule `no-restricted-imports` automatically enforces this pattern.
- **Rationale**: This prevents tight coupling between modules and ensures clean public APIs. Internal implementation details of one module should not be accessed by another module.
- **Example**:
  - ❌ `import {Registry} from '../with-models/types'` – blocked
  - ✅ `import {Registry} from '../with-models'` – allowed (resolves to `index.ts`)


