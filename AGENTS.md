# AGENTS.md

A guide for AI coding agents working on this repository.

## Project Overview

This is a TypeScript library that provides infrastructure helpers for building server-side applications (e.g., Express.js). The core concept is **declarative data retrieval with automatic memoization** through models.

**Core Principle**: Instead of passing data through function parameters, models retrieve data at the point of use with automatic memoization. Models are computed once per request and cached, eliminating redundant computations across the call stack. See `src/with-models/readme.md` for detailed examples.

## Setup Commands

- Install dependencies: `npm install`
- Build: `npm run build` (uses `tspc` TypeScript compiler)
- Run tests: `npm test` (uses Vitest)

## Core Concepts

### Context

`Context` represents the execution context for a request lifecycle. It tracks:
- Name and parent context (hierarchical structure)
- Start/end time and duration
- Errors

```typescript
const ctx = new Context('request-name');
ctx.end(); // Mark as complete
ctx.fail(error); // Mark as failed with error
```

### OJson Type

OJson (Object JSON) is a subset of JSON where the top level is always an object:
- Primitives: `null | number | string`
- Arrays of primitives
- Nested objects (no circular references in practice)
- **Top level must be an object** (unlike JSON which can be any value)

```typescript
type OJson = {
  [prop: string]: Primitive | Primitive[] | OJson;
};
```

This restriction allows models to have predictable parameter structures and enables serialization for cache keys.

### Models

A **Model** is a deterministic function `f(OJson) -> JSON` with the following properties:

1. **Determinism**: Same parameters → same result
2. **Serializable parameters**: Can be serialized predictably to create cache keys
3. **JSON result**: Result is JSON-serializable and can be used as parameters for other calls (does not need to be an object)

Models can be:
- A function: `(props: OJson, context: Context) => Result | Promise<Result> | Generator<Result>`
- An object with an `action` method

Models **must** have a static `displayName` property for identification and caching.

```typescript
function RequestParams(props, ctx): OJson {
  return {
    isTesting: ctx.req.query.isTesting,
    isDev: ctx.req.query.isDev
  };
}
RequestParams.displayName = 'RequestParams';
```

### withModels

The primary helper that adds the `request` method to context for calling models with automatic memoization.

**Key features:**
- Memoization by key: `${model.displayName};${sign(props)}`
- Supports synchronous, Promise, and Generator results
- Nested generators support (generators can yield other generators or promises)
- Request lifecycle management via context hierarchy
- `kill()` mechanism to interrupt execution (returns `Dead` symbol)
- Shared registry enables memoization across nested contexts in the same request
- Models can access parent context through `ctx.parent`
- Props parameter is optional (defaults to empty object if not provided)

**Basic usage:**
```typescript
const registry = new Map();
const ctx = withModels(registry)(new Context('request'));
const result = await ctx.request(ModelName, {prop: 'value'});
```

For detailed usage examples, see `src/with-models/readme.md`.

**Model result types:**
- Synchronous object: `{result: 'value'}`
- Promise: `Promise<Json>` (can resolve to any JSON value)
- Generator: `Generator<Json>` (for multi-step operations, can yield any JSON value)

**Interrupting execution:**
```typescript
ctx.kill(); // Marks context as dead
const result = await ctx.request(Model); // Returns Dead symbol immediately
```

### Key Generation (sign)

The `sign()` utility creates deterministic keys from OJson:
- Sorted keys for consistent ordering
- Recursive handling of nested objects
- Circular reference protection
- Uses URLSearchParams for serialization

## Helper Modules

Additional helpers that can be composed with `withModels`:

- **withCache**: Adds caching layer with strategies (CacheFirst, NetworkOnly, CacheOnly, StaleWhileRevalidate)
- **withDeadline**: Adds timeout/deadline, automatically kills context after timeout
- **withOverrides**: Allows model substitution/mocking for testing or A/B testing
- **withTelemetry**: Adds OpenTelemetry tracing to model execution

All helpers follow the same composition pattern and can be chained using the `compose` utility. See individual module implementations for details.

### withCache: agent-facing notes

- **Cache configuration and TTL**:
  - `CacheConfig` has the shape `{default: {ttl: number}, 'cache-first': {ttl: number}, ...}`.
  - `Strategy.with()` (e.g. `CacheFirst.with({ttl: 1800})`) accepts **only** the short form `{ttl: number}` and internally wraps it into a per-strategy `CacheConfig`.

- **CacheProvider vs Cache**:
  - `CacheProvider` is the low-level storage (`get(key)`, `set(key, value, ttl)`).
  - `Cache` wraps a `CacheProvider` and adds `key()`, `get()`, `set()`, `update()` helpers.
  - When composing helpers (e.g. in `Cache.update`), always pass the underlying provider into `withCache`, not the `Cache` itself (`withCache(config, this._provider)`), otherwise you risk recursive wrapping.

- **CacheFirst strategy behavior**:
  - Uses `CacheOnly` + `NetworkOnly`:
    - cache miss → calls the model, then `cache.set(key, value, ttl)` if `shouldCache()` is `true`.
    - cache hit → returns the cached value from `cache.get` and **does not** call `cache.set`.

## Composing Helpers

Use the `compose` utility to combine multiple helpers:

```typescript
import {compose} from './utils';

const wrap = compose([
  withModels(registry),
  withCache(config, cache),
  withDeadline(5000),
  withTelemetry({serviceName: 'api'})
]);

const ctx = wrap(new Context('request'));
```

Note: `compose` is exported from `src/utils/index.ts` but not from the main package entry point. Import directly from utils or compose manually.

## Code Style

- TypeScript strict mode
- ES2020 target, ES modules
- Use functional patterns where possible
- Models are pure functions (deterministic)
- Prefer composition over inheritance
- **All comments must be in English** (including test comments and inline documentation)

## Testing Instructions

- Test files use `.spec.ts` extension (excluded from build)
- Run tests: `npm test`
- Run specific test: `npm test -- -t "test name"`
- Tests use Vitest framework
- Focus areas:
  - Model memoization behavior
  - Generator handling
  - Cache strategies
  - Context lifecycle
  - Error handling

**Key test patterns:**
- Verify memoization by checking call counts
- Test generator interruption with `kill()`
- Verify cache sharing between contexts
- Test nested generator resolution
- Test models as objects with `action` method
- Test models calling other models (composition)
- Test error handling in generators and promises
- Test registry cleanup on promise rejection
- Test memoization across different contexts with shared registry

## Important Implementation Details

### Model Registry

The registry (`Map<Key, Promise<unknown>>`) is shared across contexts in the same request. This enables:
- Memoization across nested contexts
- Proper cleanup on errors (promise rejection removes from registry)

### Generator Handling

Generators support nested generators and promises:
- Values can be generators (nested execution)
- Values can be promises (awaited)
- Generators can be interrupted via `kill()`
- State is managed with a stack for nested generators

### Context Hierarchy

Contexts form a tree structure:
- Child contexts inherit parent's registry
- `kill()` propagates through hierarchy (shared state)
- Telemetry spans follow context hierarchy
- Child contexts are created via `ctx.create(name)` which returns a new context with same registry

### resolve Method

The `resolve` method is used internally to handle promises. It can be overridden by helpers (e.g., `withDeadline` wraps it to add timeout behavior). Models should use `ctx.request()` rather than calling `resolve` directly.

### Error Handling

- Errors are captured in context (`ctx.fail(error)`)
- Failed contexts are still tracked in registry
- Promises in registry are cleaned up on rejection

### disableCache and memoization

- `disableCache()` turns off the `withCache` strategies for the context (i.e. cache providers are not written to), but **does not disable** memoization provided by `withModels`.
- Within the same context, repeated calls to the same model with the same props will still be served from the `withModels` registry, regardless of the cache strategy state.

### withDeadline: agent-facing notes

- `withDeadline(timeout)` wraps a `WithModels` context and races `ctx.resolve` against a timer:
  - if the timer wins, it calls `ctx.kill()`;
  - in-flight `ctx.request` calls then observe `Dead` according to `withModels` semantics.
- `timeout <= 0` is treated as a no-op: the context is returned unchanged.
- Helpers should typically be composed in this order:
  - `withModels` → other helpers (`withCache`, `withOverrides`, `withTelemetry`) → `withDeadline`.
- `withDeadline` does not change memoization or cache behavior, it only controls how long we wait for async model resolutions.

## Development Workflow

1. Make changes to source files in `src/`
2. Run `npm test` to verify tests pass
3. Run `npm run build` to check compilation
4. TypeScript config excludes `.spec.ts` files from build
5. Tests should verify memoization behavior and edge cases

## Architecture Notes

- **Determinism is critical**: Models must produce the same output for the same input
- **Memoization key**: Based on `displayName` and serialized props (via `sign()`)
- **Context lifecycle**: Tied to request lifecycle (create → use → end/fail)
- **Helper composition**: Helpers wrap and enhance context, maintaining type safety
- **Registry scope**: Shared per-request registry enables cross-context memoization
- **Props handling**: Props parameter is optional and defaults to empty object using nullish coalescing (`??`)

## Documentation

- **User documentation**: Detailed, user-facing guides live in module READMEs:
  - `src/with-models/readme.md`
  - `src/with-cache/readme.md`
- **README structure**: Module READMEs should follow the common template described in `docs/readme-template.md` (sections: Overview, Key Concepts, Installation, Basic Usage, Advanced Usage, API Overview, Testing Notes, Best Practices, See Also). This AGENTS file is intentionally focused on agent-facing notes and implementation details, not full user guides.
- **JSDoc style**:
  - For complex context extension types (e.g. `WithModels`, `WithCache`), use a single JSDoc block with `@property` entries that describe the whole shape.
  - For interfaces and classes like `CacheProvider`, `CacheConfig`, `Cache`, prefer a brief type-level JSDoc and short per-property/method comments, without duplicating the same information in `@property` lists.
- **Code documentation**: All public APIs are documented with JSDoc comments
- **Type definitions**: Full TypeScript support with strict typing for models, props, and results

