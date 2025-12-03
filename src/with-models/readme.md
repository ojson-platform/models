# withModels

Declarative data retrieval with automatic memoization for server-side applications.

## Overview

`withModels` is a helper that enhances a `Context` with the ability to call models (deterministic functions) with automatic memoization. Instead of passing data through function parameters, you can retrieve it at the point of use—models are computed once and cached automatically.

## Key Concepts

### Models

A **Model** is a deterministic function that transforms input parameters (`OJson`) into a result (`JSON`):

- **Deterministic**: Same parameters → same result
- **Serializable**: Parameters can be serialized to create cache keys
- **JSON-compatible**: Input is OJson (object at top level), output is any JSON-serializable value (does not need to be an object)

**Note**: Input parameters must be OJson (object at top level), but the result can be any valid JSON (object, array, primitive, etc.).

### OJson Type

OJson (Object JSON) is a subset of JSON where the top level is always an object. This restriction ensures predictable parameter structures for models:

- Primitives: `null | number | string`
- Arrays of primitives
- Nested objects (no circular references in practice)
- **Top level must be an object** (unlike JSON which can be any value)

This format is used for model input parameters to enable deterministic serialization for cache keys.

### Memoization

Models are automatically memoized based on their `displayName` and serialized parameters. Subsequent calls with the same model and props return the cached result without recomputation.

### Registry

The registry is a shared `Map` that stores memoized results across all contexts in the same request lifecycle. This enables memoization to work across nested contexts.

## Installation

```typescript
import {withModels} from './with-models';
import {Context} from './context';
```

## Basic Usage

### 1. Create a Registry

Create a registry once per request lifecycle:

```typescript
const registry = new Map();
```

### 2. Enhance Context

Wrap your context with model capabilities:

```typescript
const baseCtx = new Context('request');
const ctx = withModels(registry)(baseCtx);
```

### 3. Define a Model

Models must have a static `displayName` property:

```typescript
function RequestParams(props, ctx) {
  return {
    userId: ctx.req.query.userId,
    isTesting: ctx.req.query.isTesting
  };
}

RequestParams.displayName = 'RequestParams';
```

### 4. Call Models

```typescript
// Call without props (uses empty object)
const params = await ctx.request(RequestParams);

// Call with props
const user = await ctx.request(UserModel, {id: params.userId});
```

## Model Types

### Synchronous Model

Returns a plain object directly:

```typescript
function ConfigModel(props, ctx) {
  return {
    env: process.env.NODE_ENV,
    version: process.env.APP_VERSION
  };
}
ConfigModel.displayName = 'ConfigModel';
```

### Async Model

Returns a Promise:

```typescript
async function UserModel(props, ctx) {
  const response = await fetch(`/api/users/${props.id}`);
  return await response.json();
}
UserModel.displayName = 'UserModel';
```

### Generator Model

Returns a Generator for multi-step operations:

```typescript
function* DataPipelineModel(props, ctx) {
  const raw = yield fetch(`/api/data/${props.id}`);
  const processed = yield processData(raw);
  const validated = yield validateData(processed);
  return validated;
}
DataPipelineModel.displayName = 'DataPipelineModel';
```

### Object with Action Method

Models can also be objects with an `action` method:

```typescript
const MyModel = {
  displayName: 'MyModel',
  action(props, ctx) {
    return {result: props.value};
  }
};
```

## Memoization

### Automatic Memoization

Models are memoized automatically by key: `${displayName};${sign(props)}`

```typescript
// First call - computes the result
const result1 = await ctx.request(ExpensiveModel, {id: 123});

// Second call with same params - returns cached result
const result2 = await ctx.request(ExpensiveModel, {id: 123});
// result1 === result2 (same reference, model not called again)
```

### Different Parameters = Different Cache

```typescript
await ctx.request(UserModel, {id: 1}); // Computes
await ctx.request(UserModel, {id: 2}); // Computes (different params)
await ctx.request(UserModel, {id: 1}); // Returns cached
```

### Shared Registry Across Contexts

```typescript
const registry = new Map();

const ctx1 = withModels(registry)(new Context('request1'));
const ctx2 = withModels(registry)(new Context('request2'));

// Both contexts share the same registry
await ctx1.request(UserModel, {id: 123}); // Computes
await ctx2.request(UserModel, {id: 123}); // Returns cached from ctx1
```

## Models Calling Other Models

Models can call other models through the context, leveraging memoization:

```typescript
async function CompositeModel(props, ctx) {
  // If UserData was already called elsewhere, this returns cached result
  const userData = await ctx.request(UserDataModel, {id: props.userId});
  const permissions = await ctx.request(PermissionsModel, {role: userData.role});
  
  return {
    user: userData,
    permissions
  };
}
CompositeModel.displayName = 'CompositeModel';
```

## Execution Control

### Kill Context

Interrupt execution at any point:

```typescript
ctx.kill(); // Marks context as dead

const result = await ctx.request(SomeModel);
// result === Dead (execution was cancelled)
```

### Check if Alive

```typescript
if (ctx.isAlive()) {
  const result = await ctx.request(SomeModel);
  // Process result
}
```

## Server Integration Example

### Express.js

```typescript
import express from 'express';
import {Context} from './context';
import {withModels} from './with-models';

const app = express();
const registry = new Map(); // Create once, reuse per request

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

app.get('/api/user', async (req, res) => {
  const baseCtx = new Context('http-get');
  baseCtx.req = req;
  baseCtx.res = res;
  
  const ctx = withModels(registry)(baseCtx);
  
  try {
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

## Advanced: Nested Generators

Generators support nested generators and promises:

```typescript
function* Step1(props, ctx) {
  return yield Promise.resolve({step: 1});
}

function* Step2(props, ctx) {
  return yield Promise.resolve({step: 2});
}

function* PipelineModel(props, ctx) {
  const step1 = yield Step1(props, ctx);
  const step2 = yield Step2(props, ctx);
  return {step1, step2};
}
PipelineModel.displayName = 'PipelineModel';
```

## Error Handling

Models can throw errors, which propagate normally:

```typescript
async function FailingModel(props, ctx) {
  if (!props.id) {
    throw new Error('ID is required');
  }
  return {id: props.id};
}
FailingModel.displayName = 'FailingModel';

try {
  await ctx.request(FailingModel, {}); // Throws error
} catch (error) {
  console.error(error.message); // "ID is required"
}
```

When a model promise is rejected, the registry automatically cleans up the failed entry.

## Type Safety

`withModels` is fully typed:

```typescript
interface UserProps {
  id: number;
}

interface UserResult {
  id: number;
  name: string;
  email: string;
}

function UserModel(props: UserProps, ctx: Context): UserResult {
  // TypeScript ensures props and return type are correct
  return {
    id: props.id,
    name: 'John',
    email: 'john@example.com'
  };
}
UserModel.displayName = 'UserModel';

const user = await ctx.request(UserModel, {id: 123});
// user is typed as UserResult
```

## Best Practices

1. **One registry per request**: Create a new registry for each request lifecycle

2. **Meaningful displayNames**: Use descriptive, unique names:
   ```typescript
   // ✅ Good
   RequestParams.displayName = 'RequestParams';
   
   // ❌ Bad
   Model.displayName = 'm1';
   ```

3. **Keep models pure**: Models should be deterministic and side-effect free where possible

4. **Use async for I/O**: Use async models for network requests, database queries, etc.

5. **Use generators for complex flows**: Generators are great for multi-step operations with dependencies

## API Reference

### `withModels(registry: Map)`

Factory function that returns a wrapper to enhance contexts.

**Parameters:**
- `registry: Map<Key, Promise<unknown>>` - Shared registry for memoization

**Returns:** Function that wraps a context

**Example:**
```typescript
const wrap = withModels(new Map());
const ctx = wrap(new Context('request'));
```

### `ctx.request<Props, Result>(model: Model<Props, Result>, props?: Props)`

Executes a model with automatic memoization.

**Parameters:**
- `model: Model<Props, Result>` - The model to execute (must have `displayName`)
- `props?: Props` - Optional input parameters (defaults to empty object)

**Returns:** `Promise<Result | typeof Dead>`

**Example:**
```typescript
const result = await ctx.request(MyModel, {id: 123});
```

### `ctx.kill()`

Interrupts all future model executions on this context.

**Returns:** `typeof Dead`

**Example:**
```typescript
ctx.kill();
const result = await ctx.request(MyModel); // Returns Dead
```

### `ctx.isAlive()`

Checks if the context is still alive (not killed).

**Returns:** `boolean`

**Example:**
```typescript
if (ctx.isAlive()) {
  await ctx.request(MyModel);
}
```

## See Also

- [withCache](../with-cache/readme.md) - Caching layer for models
- [withDeadline](../with-deadline/readme.md) - Timeout/deadline support
- [withOverrides](../with-overrides/readme.md) - Model substitution for testing

