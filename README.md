# Models

Declarative data retrieval with automatic memoization for server-side TypeScript applications.

## Overview

This library provides infrastructure helpers for building server-side applications (e.g., Express.js) using a **declarative data retrieval pattern with automatic memoization**. Instead of passing data through function parameters, you retrieve it at the point of use—models are computed once per request and cached automatically.

**Core Principle**: Models retrieve data at the point of use with automatic memoization. This eliminates redundant computations across the call stack and makes your code more maintainable.

## Key Features

- **Automatic Memoization** - Models are computed once per request and cached automatically
- **Declarative Data Retrieval** - Get data where you need it, not where it's available
- **Composable Helpers** - Mix and match caching, telemetry, deadlines, and overrides
- **Type-Safe** - Full TypeScript support with strict typing
- **Server-Side Focused** - Designed for Express.js and similar frameworks

## Quick Start

### Installation

```bash
npm install @ojson/models
```

### Basic Example (Express.js)

```typescript
import express from 'express';
import {Context, withModels} from '@ojson/models';

const app = express();
const registry = new Map(); // Create once, reuse per request

// Define models
function RequestParams(props, ctx) {
  return {
    userId: ctx.req.query.userId,
    token: ctx.req.headers.authorization
  };
}
RequestParams.displayName = 'RequestParams';

async function AuthModel(props, ctx) {
  const response = await fetch(`/api/auth/verify`, {
    headers: {Authorization: props.token}
  });
  return await response.json();
}
AuthModel.displayName = 'AuthModel';

// Use in route handler
app.get('/api/user', async (req, res) => {
  const baseCtx = new Context('http-get');
  baseCtx.req = req;
  baseCtx.res = res;
  
  const ctx = withModels(registry)(baseCtx);
  
  try {
    // RequestParams is computed once, even if called multiple times
    const params = await ctx.request(RequestParams);
    const auth = await ctx.request(AuthModel, {token: params.token});
    
    if (!auth.valid) {
      return res.status(401).json({error: 'Unauthorized'});
    }
    
    res.json({userId: params.userId, auth});
  } catch (error) {
    res.status(500).json({error: error.message});
  } finally {
    ctx.end();
  }
});
```

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

### Models

A **Model** is a deterministic function `f(OJson) -> JSON` with:
- **Deterministic**: Same parameters → same result
- **Serializable**: Parameters can be serialized to create cache keys
- **JSON-compatible**: Input is OJson (object at top level), output is any JSON-serializable value

Models must have a static `displayName` property for identification. Models can also have optional properties used by various modules:

```typescript
function UserModel(props, ctx) {
  return {id: props.id, name: 'John'};
}
UserModel.displayName = 'UserModel'; // Required

// Optional: used by withCache
UserModel.cacheStrategy = CacheFirst;

// Optional: used by withTelemetry
UserModel.displayProps = {id: true};
UserModel.displayResult = {name: true};
UserModel.displayTags = {'model.version': '1.0.0'};
```

### OJson Type

OJson (Object JSON) is a subset of JSON where the top level is always an object:
- **Top level must be an object** (unlike JSON which can be any value)
- Values can be any JSON-serializable value (Json): primitives, arrays, nested objects, etc.

```typescript
type OJson = {
  [prop: string]: Json;
};
```

This restriction ensures predictable parameter structures for models and enables deterministic serialization for cache keys.

### Memoization

Models are automatically memoized based on their `displayName` and serialized parameters. Subsequent calls with the same model and props return the cached result without recomputation.

## Modules

This library is organized into composable modules:

### [withModels](./src/with-models/readme.md)

**Core module** - Adds model execution with automatic memoization.

- Declarative data retrieval
- Automatic memoization within a request
- Support for sync, async, and generator models
- Execution control (`kill()`, `isAlive()`)

### [withCache](./src/with-cache/readme.md)

Adds configurable caching strategies for cross-request caching.

- Multiple strategies: `CacheFirst`, `NetworkOnly`, `CacheOnly`, `StaleWhileRevalidate`
- Configurable TTL per strategy
- Dead-aware caching (never caches interrupted execution)
- Works alongside `withModels` memoization

### [withDeadline](./src/with-deadline/readme.md)

Adds timeout/deadline support for bounding request execution time.

- Context-level timeouts
- Automatic cancellation via `ctx.kill()`
- No-op mode when timeout is disabled

### [withOverrides](./src/with-overrides/readme.md)

Enables model substitution for testing and feature flags.

- Runtime model replacement
- Transitive overrides (A → B → C)
- Inherited by child contexts
- Perfect for mocking in tests

### [withTelemetry](./src/with-telemetry/readme.md)

Integrates OpenTelemetry tracing for observability.

- Automatic span creation for contexts
- Model props/result/error tracking
- Parent-child span relationships
- Configurable field filtering

## Composing Modules

Modules are designed to be composed together. Use the `compose` utility to combine multiple wrappers:

```typescript
import {
  Context,
  withModels,
  withCache,
  withTelemetry,
  withDeadline,
  MemoryCache,
  compose,
} from '@ojson/models';

const registry = new Map();
const cacheProvider = new MemoryCache();

// Using compose utility
const wrap = compose([
  withModels(registry),
  withCache({default: {ttl: 3600}}, cacheProvider),
  withTelemetry({serviceName: 'my-api'}),
  withDeadline(5000), // 5 second timeout
]);

const ctx = wrap(new Context('request'));
```

**Recommended order:**
1. `withModels` - Base models and memoization
2. `withCache` / `withOverrides` / `withTelemetry` - Caching, overrides, telemetry
3. `withDeadline` - On top to cut off long-running operations

## Installation

```bash
npm install @ojson/models
```

## Documentation

- [withModels Documentation](./src/with-models/readme.md) - Core memoization helper
- [withCache Documentation](./src/with-cache/readme.md) - Caching strategies
- [withDeadline Documentation](./src/with-deadline/readme.md) - Timeout support
- [withOverrides Documentation](./src/with-overrides/readme.md) - Model substitution
- [withTelemetry Documentation](./src/with-telemetry/readme.md) - OpenTelemetry integration

## Development

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

## License

ISC

