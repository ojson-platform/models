# Agent Guide – Core Concepts

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

- `name: string` – Context name.
- `parent: BaseContext | undefined` – Parent context for hierarchy.
- `create(name: string): BaseContext` – Creates a child context.
- `end(): void` – Marks context as complete.
- `fail(error?: Error | unknown): void` – Marks context as failed.
- `call(name: string, action: Function): Promise<unknown>` – Executes action in a child context.

`Context` is a concrete implementation of `BaseContext` that tracks:

- name and parent context (hierarchical structure);
- start/end time and duration;
- errors.

```typescript
const ctx = new Context('request-name');
ctx.end(); // Mark as complete
ctx.fail(error); // Mark as failed with error
```

**Important**: Helpers depend on the `BaseContext` interface, not the concrete `Context` class. This allows applications to provide their own context implementations as long as they implement the `BaseContext` interface.

### OJson Type

OJson (Object JSON) is a subset of JSON where the top level is always an object:

- **Top level must be an object** (unlike JSON which can be any value).
- Values can be any JSON-serializable value (`Json`): primitives, arrays, nested objects, etc.

```typescript
type OJson = {
  [prop: string]: Json;
};
```

This restriction allows models to have predictable parameter structures and enables serialization for cache keys.

### Models

A **Model** is a deterministic function `f(OJson) -> Json` with the following properties:

1. **Determinism**: same parameters → same result.
2. **Serializable parameters**: can be serialized predictably to create cache keys.
3. **JSON result**: result is JSON-serializable and can be used as parameters for other calls (does not need to be an object).

Models can be:

- a function: `(props: OJson, context: Context) => Result | Promise<Result> | Generator<Result>`;
- an object with an `action` method.

Models **must** have a static `displayName` property for identification and caching.

```typescript
// Request-dependent model – should be set via ctx.set() in middleware
function RequestParams(): OJson {
  throw new Error('RequestParams should be set via ctx.set() in middleware');
}
RequestParams.displayName = 'RequestParams';

// In middleware
req.ctx.set(RequestParams, {
  isTesting: req.query.isTesting === 'true',
  isDev: req.query.isDev === 'true',
});
```

### withModels

The primary helper that adds the `request` method to context for calling models with automatic memoization.

**Key features:**

- memoization by key: `${model.displayName};${sign(props)}`;
- supports synchronous, Promise, and Generator results;
- nested generators support (generators can yield other generators or promises);
- request lifecycle management via context hierarchy;
- `kill()` mechanism to interrupt execution;
- shared registry enables memoization across nested contexts in the same request;
- models can access parent context through `ctx.parent`;
- props parameter is optional (defaults to empty object if not provided);
- adds `event()` method (no-op by default, can be overridden by other helpers like `withTelemetry`);
- adds `set()` method for pre-computing request-dependent model values.

**Basic usage:**

```typescript
// Create registry once per request lifecycle (NOT shared across different HTTP requests)
const registry = new Map();
const ctx = withModels(registry)(new Context('request'));
const result = await ctx.request(ModelName, {prop: 'value'});
```

For detailed usage examples, see `src/with-models/readme.md`.

### Key Generation (`sign`)

The `sign()` utility creates deterministic keys from `OJson`:

- sorted keys for consistent ordering;
- recursive handling of nested objects;
- circular reference protection;
- uses `URLSearchParams` for serialization.

### Property Checking (`has`)

The `has()` utility checks if an object has a property with optional type validation:

- checks property existence (string or symbol);
- optional type validation ('function', 'number', 'string', 'object');
- returns type guard when type is specified;
- useful for checking dynamic properties without using `any`.

**Example:**
```typescript
has(ctx, 'disableCache', 'function') // checks if ctx has disableCache method
has(ctx, 'endTime', 'number') // checks if ctx has endTime number property
has(ctx, __Span__) // checks if ctx has __Span__ property (any type)
```

### Helper Modules Overview

Additional helpers that can be composed with `withModels`:

- `withCache` – caching layer with strategies (CacheFirst, NetworkOnly, CacheOnly, StaleWhileRevalidate);
- `withDeadline` – timeout/deadline, automatically kills context after timeout;
- `withOverrides` – model substitution/mocking for testing or A/B testing;
- `withTelemetry` – OpenTelemetry tracing for model execution.

All helpers follow the same composition pattern and can be chained using the `compose` utility. See individual module READMEs for details.

## Architecture Notes (Core)

- **Determinism is critical**: models must produce the same output for the same input.
- **Memoization key**: based on `displayName` and serialized props (via `sign()`).
- **Context lifecycle**: tied to request lifecycle (create → use → end/fail).
- **Helper composition**: helpers wrap and enhance context, maintaining type safety.
- **Registry scope**: registry must be created **once per request lifecycle** (e.g., per HTTP request). Never reuse a registry across different requests – this would cause data leakage and incorrect memoization.
- **Props handling**: props parameter is optional and defaults to an empty object using nullish coalescing (`??`).


