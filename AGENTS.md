# AGENTS.md

A guide for AI coding agents working on this repository.

## Project Overview

This is a TypeScript library that provides infrastructure helpers for building server-side applications (e.g., Express.js). The core concept is **declarative data retrieval with automatic memoization** through models.

**Core Principle**: Instead of passing data through function parameters, models retrieve data at the point of use with automatic memoization. Models are computed once per request and cached, eliminating redundant computations across the call stack. See `src/with-models/readme.md` for detailed examples.

## Setup Commands

- Install dependencies: `npm install`
- Build: `npm run build` (uses `tspc` TypeScript compiler)
- Run tests: `npm test` (uses Vitest)

**Note on `tspc`**: This project uses `tspc` (TypeScript Patched Compiler) instead of standard `tsc` because it requires custom TypeScript plugins. The `tsconfig.json` includes a custom transformer plugin (`scripts/extensions.js`) that automatically adds `.js` extensions to relative import paths during compilation, which is required for ES modules compatibility. Standard `tsc` does not support custom plugins, so `tspc` (via `ts-patch`) is used instead.

## Core Concepts

### Context

The library uses a minimal `BaseContext` interface that defines the required lifecycle API:
- `name: string` - Context name
- `parent: BaseContext | undefined` - Parent context for hierarchy
- `create(name: string): BaseContext` - Creates a child context
- `end(): void` - Marks context as complete
- `fail(error?: Error | unknown): void` - Marks context as failed
- `call(name: string, action: Function): Promise<unknown>` - Executes action in child context

`Context` is a concrete implementation of `BaseContext` that tracks:
- Name and parent context (hierarchical structure)
- Start/end time and duration
- Errors

```typescript
const ctx = new Context('request-name');
ctx.end(); // Mark as complete
ctx.fail(error); // Mark as failed with error
```

**Important**: Helpers depend on `BaseContext` interface, not the concrete `Context` class. This allows applications to provide their own context implementations as long as they implement the `BaseContext` interface.

### OJson Type

OJson (Object JSON) is a subset of JSON where the top level is always an object:
- **Top level must be an object** (unlike JSON which can be any value)
- Values can be any JSON-serializable value (Json): primitives, arrays, nested objects, etc.

```typescript
type OJson = {
  [prop: string]: Json;
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
// Request-dependent model - should be set via ctx.set() in middleware
function RequestParams(): OJson {
  throw new Error('RequestParams should be set via ctx.set() in middleware');
}
RequestParams.displayName = 'RequestParams';

// In middleware
req.ctx.set(RequestParams, {
  isTesting: req.query.isTesting === 'true',
  isDev: req.query.isDev === 'true'
});
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
- Adds `event()` method (no-op by default, can be overridden by other helpers like `withTelemetry`)
- Adds `set()` method for pre-computing request-dependent model values

**Basic usage:**
```typescript
// Create registry once per request lifecycle (NOT shared across different HTTP requests)
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

-- **CacheProvider vs Cache**:
  - `CacheProvider` is the low-level storage (`get(key)`, `set(key, value, ttl)`).
  - `Cache` wraps a `CacheProvider` and adds `key()`, `get()`, `set()`, `update()` helpers.
  - The `createContext` factory passed to `Cache` (or `withCache`) is used by `Cache.update` to create background contexts. If the created context has `disableCache()`, it will be called automatically to prevent recursive caching.

- **CacheFirst strategy behavior**:
  - Uses `CacheOnly` + `NetworkOnly`:
    - cache miss → calls the model, then `cache.set(key, value, ttl)` if `shouldCache()` is `true`.
    - cache hit → returns the cached value from `cache.get` and **does not** call `cache.set`.

### withOverrides: agent-facing notes

- `withOverrides(overrides)` wraps a `WithModels` context and replaces models according to a `Map<Model, Model>`.
- Overrides are resolved transitively:
  - if A → B and B → C, then requests for A and B both delegate to C.
- Overrides are applied at the `request` level only:
  - memoization still happens at the final model + props key.
- `ctx.create` is wrapped so that child contexts inherit the same overrides.

## Composing Helpers

Use the `compose` utility to combine multiple helpers:

```typescript
import {compose} from './utils';

const backgroundCtx = (name: string) =>
  withModels(new Map())(new Context(name));

const wrap = compose([
  withModels(registry),
  withCache(config, cache, backgroundCtx),
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

### Import Organization

Imports must be organized in a specific order:

1. **Type imports first** (all `import type` statements):
   - External type imports (from `node_modules` or absolute paths)
   - Parent module type imports (from `../module`)
   - Local type imports (from `./module`)

2. **Empty line separator**

3. **Runtime imports** (regular `import` statements):
   - External module imports (from `node_modules` or absolute paths)
   - **Empty line separator**
   - Parent module imports (from `../module`)
   - **Empty line separator**
   - Local module imports (from `./module`)

**Example:**
```typescript
import type {Test1} from 'external-package';
import type {Test2} from '../parent-module';
import type {Test3} from './local-module';

import {externalFunction} from 'external-package';

import {parentFunction} from '../parent-module';

import {localFunction} from './local-module';
```

**Important**: Do not use mixed import syntax like `import {value, type Type}`. Always separate type imports and runtime imports:
- ✅ `import type {Type} from './module';` followed by `import {value} from './module';`
- ❌ `import {value, type Type} from './module';`

Within each group (types or runtime), imports are sorted by source location: external → parent → local.

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

### withTelemetry: agent-facing notes

- `withTelemetry(config)` wraps a `WithModels` context and adds OpenTelemetry tracing:
  - Creates a span for each context (named after `ctx.name`)
  - Sets up parent-child span relationships based on context hierarchy
  - Records model props/result/errors as span attributes and events
  - Marks spans as failed when `ctx.fail()` is called
  - Wraps `ctx.event()` from `withModels` to record events in OpenTelemetry spans
- **SDK Requirement**: `withTelemetry` requires `NodeSDK` from `@opentelemetry/sdk-node` to be initialized. It automatically checks SDK initialization (via `ensureNodeSDKInitialized()`) and throws a helpful error with setup instructions if not. `NodeSDK` uses `AsyncLocalStorageContextManager` which is necessary for proper context propagation. Using `BasicTracerProvider` with `NoopContextManager` will not work.
- Models can optionally provide telemetry configuration via `displayProps`, `displayResult`, and `displayTags` properties.
- Props are recorded before model execution, results after (if not `Dead`).
- Only object errors get error events (strings and primitives only set status).
- `ctx.create` is wrapped so that child contexts inherit telemetry and create child spans.
- The `event()` method is available on all `WithModels` contexts (as a no-op), and `withTelemetry` wraps it to add span recording. Other helpers (e.g., `withCache`) can call `ctx.event()` without knowing if telemetry is enabled.

#### Helper module structure and API patterns

- **Module decomposition for complex helpers (with-telemetry, with-cache, with-overrides, future `with-*`)**:
  - Split helpers into three kinds of files:
    - `*.ts` – core logic and wrapping of the context
    - `types.ts` – public types and internal symbols for the helper
    - `utils.ts` – pure helper functions (no side effects, no context mutation)
  - This keeps files small, improves navigation, and makes it clear where to add new types vs. logic vs. utilities.

- **Public types in `types.ts` (required for helper modules)**:
  - All public types of a helper module (e.g. `WithTelemetry`, `ModelWithTelemetry`, `TelemetryConfig` for telemetry) must be declared in `types.ts`.
  - The module entry point (`index.ts`) should:
    - re-export types via `export type * from './types';`
    - re-export implementations via `export {withTelemetry, getSpan} from './with-telemetry';` (or analogous functions for other helpers).
  - New helper modules (future `with-*`) should follow the same pattern: **public types in `types.ts`, implementation in separate files**.

- **Test access to internals without exposing private symbols**:
  - Internal state (e.g. telemetry span stored under a symbol like `__Span__`) must not be accessed directly outside the helper implementation.
  - For tests and debugging, prefer small dedicated helpers that expose read-only views of internals, e.g. `getSpan(ctx: Context): Span | undefined` in `with-telemetry`.
  - Tests and examples should use these helpers instead of `(ctx as any)[internalSymbol]`.
  - If a new helper needs test-time access to internals, add a focused helper function (similar to `getSpan`) rather than exporting internal symbols.

### withDeadline: agent-facing notes

- `withDeadline(timeout)` wraps a `WithModels` context and races `ctx.resolve` against a timer:
  - if the timer wins, it calls `ctx.kill()`;
  - in-flight `ctx.request` calls then observe `Dead` according to `withModels` semantics.
- `timeout <= 0` is treated as a no-op: the context is returned unchanged.
- Helpers should typically be composed in this order:
  - `withModels` → other helpers (`withCache`, `withOverrides`, `withTelemetry`) → `withDeadline`.
- `withDeadline` does not change memoization or cache behavior, it only controls how long we wait for async model resolutions.

### ctx.set() pattern: agent-facing notes

- `ctx.set(model, value)` is a method added by `withModels` that allows setting pre-computed values for request-dependent models.
- This pattern is used for models that depend on request data (e.g., Express `Request` parameters) to avoid mutability issues and ensure deterministic memoization.
- Models using this pattern should throw an error if called directly, indicating they should be set via `ctx.set()`.
- Values set via `ctx.set()` are stored in the same registry as `ctx.request()` and returned when the model is requested.
- This pattern ensures immutable snapshots of only the data actually needed, avoiding god objects and unnecessary copying.
- See [ADR 0002](../docs/adr/0002-ctx-set-pattern.md) for detailed rationale and implementation.

**Example:**
```typescript
// Model definition
function RequestParams(): RequestParamsResult {
  throw new Error('RequestParams should be set via ctx.set() in middleware');
}
RequestParams.displayName = 'RequestParams';

// In middleware - create immutable snapshot of only needed fields
req.ctx.set(RequestParams, {
  isTesting: req.query.isTesting === 'true',
  isDev: req.query.isDev === 'true'
});

// Usage
const params = await req.ctx.request(RequestParams);
```

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
- **Registry scope**: Registry must be created **once per request lifecycle** (e.g., per HTTP request). Never reuse a registry across different requests - this would cause data leakage and incorrect memoization. Shared registry within a single request enables cross-context memoization.
- **Props handling**: Props parameter is optional and defaults to empty object using nullish coalescing (`??`)

## Type Inference

### Model Type Helpers

The library provides helper types for extracting type information from models:

- **`ModelProps<M>`**: Extracts the Props type from a model
- **`ModelResult<M>`**: Extracts the Result type from a model (handles Promise and Generator unwrapping)
- **`ModelCtx<M>`**: Extracts the Context type from a model

These helpers work with both function models and object models with `action` property. They are used internally by `ctx.request()` to provide proper type inference.

**Example:**
```typescript
function GetUser(props: {id: string}): Promise<User> {
  // ...
}
GetUser.displayName = 'GetUser';

// TypeScript will infer:
// - Props: {id: string}
// - Result: User (Promise is unwrapped)
const user = await ctx.request(GetUser, {id: '123'}); // user: User
```

**Note**: TypeScript can infer return types from function bodies, but explicit return type annotations are recommended for:
- Better code documentation
- Early error detection
- Ensuring the function signature matches the intended return type

```typescript
// Good - explicit return type (recommended)
function GetUser(props: {id: string}): Promise<User> {
  return fetchUser(props.id);
}

// Also works - TypeScript infers Promise<User> from the return statement
function GetUser(props: {id: string}) {
  return fetchUser(props.id);
}
```

## Documentation

- **User documentation**: Detailed, user-facing guides live in module READMEs:
  - `src/with-models/readme.md`
  - `src/with-cache/readme.md`
- **README structure**: Module READMEs should follow the common template described in `docs/readme-template.md` (sections: Overview, Key Concepts, Installation, Basic Usage, Advanced Usage, API Overview, Testing Notes, Best Practices, See Also). This AGENTS file is intentionally focused on agent-facing notes and implementation details, not full user guides.
- **JSDoc style**:
  - For complex context extension types (e.g. `WithModels`, `WithCache`), use a single JSDoc block with `@property` entries that describe the whole shape.
  - For interfaces and classes like `CacheProvider`, `CacheConfig`, `Cache`, prefer a brief type-level JSDoc and short per-property/method comments, without duplicating the same information in `@property` lists.
  - **Documentation depth**: Be more concise for internal APIs (`@internal` functions, private methods) and more detailed for public APIs:
    - **Public APIs**: Include parameter descriptions (`@param`), return value descriptions (`@returns`), and brief usage examples when helpful. Keep general descriptions concise but ensure all parameters are documented.
    - **Internal APIs**: Use brief one-line descriptions. Avoid redundant parameter documentation if types are self-explanatory.
    - **Balance**: Remove verbose examples and lengthy explanations, but always document public method parameters for clarity.
- **Code documentation**: All public APIs are documented with JSDoc comments
- **Type definitions**: Full TypeScript support with strict typing for models, props, and results

