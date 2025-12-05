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

- **Top level must be an object** (unlike JSON which can be any value)
- Values can be any JSON-serializable value (Json): primitives, arrays, nested objects, etc.

```typescript
type OJson = {
  [prop: string]: Json;
};
```

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
import type {Key} from '@ojson/models';

const registry = new Map<Key, Promise<unknown>>();
```

### 2. Enhance Context

Wrap your context with model capabilities:

```typescript
import {Context, withModels} from '@ojson/models';

const baseCtx = new Context('request');
const ctx = withModels(registry)(baseCtx);
```

### 3. Define a Model

Models must have a static `displayName` property. For proper type inference, use explicit type annotations:

```typescript
import type {OJson, Context} from '@ojson/models';

interface RequestParamsResult extends OJson {
  userId: string;
  isTesting: boolean;
}

function RequestParams(props: OJson, ctx: Context & {req: {query: {userId?: string; isTesting?: string}}}): RequestParamsResult {
  return {
    userId: ctx.req.query.userId || '',
    isTesting: ctx.req.query.isTesting === 'true'
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
import type {OJson, Context, Json} from '@ojson/models';

interface ConfigResult extends OJson {
  env: string | undefined;
  version: string | undefined;
}

function ConfigModel(props: OJson, ctx: Context): ConfigResult {
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
import type {OJson, Context, Json} from '@ojson/models';

interface UserModelProps extends OJson {
  id: string;
}

interface User extends OJson {
  id: string;
  name: string;
  email: string;
}

async function UserModel(props: UserModelProps, ctx: Context): Promise<User> {
  const response = await fetch(`/api/users/${props.id}`);
  return await response.json() as User;
}
UserModel.displayName = 'UserModel';
```

### Generator Model

Returns a Generator for multi-step operations:

```typescript
import type {OJson, Context, Json} from '@ojson/models';

interface DataPipelineProps extends OJson {
  id: string;
}

interface ProcessedData extends OJson {
  id: string;
  processed: boolean;
  validated: boolean;
}

function* DataPipelineModel(props: DataPipelineProps, ctx: Context): Generator<Promise<Json> | Json, ProcessedData> {
  const raw = yield fetch(`/api/data/${props.id}`) as Promise<Json>;
  const processed = yield processData(raw) as Json;
  const validated = yield validateData(processed) as Json;
  return validated as ProcessedData;
}
DataPipelineModel.displayName = 'DataPipelineModel';
```

### Object with Action Method

Models can also be objects with an `action` method:

```typescript
import type {OJson, Context, Json, Model} from '@ojson/models';

interface MyModelProps extends OJson {
  value: string;
}

interface MyModelResult extends OJson {
  result: string;
}

const MyModel: Model<MyModelProps, MyModelResult> = {
  displayName: 'MyModel',
  action(props: MyModelProps, ctx: Context): MyModelResult {
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
// TypeScript infers: result1 and result2 have the same type as ExpensiveModel's return type
```

### Different Parameters = Different Cache

```typescript
await ctx.request(UserModel, {id: 1}); // Computes
await ctx.request(UserModel, {id: 2}); // Computes (different params)
await ctx.request(UserModel, {id: 1}); // Returns cached
```

### Shared Registry Across Contexts

Within a single request lifecycle, multiple contexts can share the same registry to enable memoization across nested contexts:

```typescript
import {Context, withModels, type Key} from '@ojson/models';

// Within a single request
const registry = new Map<Key, Promise<unknown>>();

const ctx1 = withModels(registry)(new Context('request1'));
const ctx2 = withModels(registry)(new Context('request2'));

// Both contexts share the same registry (same request lifecycle)
await ctx1.request(UserModel, {id: 123}); // Computes
await ctx2.request(UserModel, {id: 123}); // Returns cached from ctx1
```

**Important**: Registry should be created **once per request lifecycle**, not shared across different HTTP requests. Each HTTP request should have its own registry.

## Models Calling Other Models

Models can call other models through the context, leveraging memoization:

```typescript
import type {OJson, Context, Json} from '@ojson/models';

interface CompositeModelProps extends OJson {
  userId: string;
}

interface UserData extends OJson {
  id: string;
  role: string;
}

interface Permissions extends OJson {
  canRead: boolean;
  canWrite: boolean;
}

interface CompositeResult extends OJson {
  user: UserData;
  permissions: Permissions;
}

async function CompositeModel(props: CompositeModelProps, ctx: Context): Promise<CompositeResult> {
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
import {InterruptedError} from '@ojson/models';

ctx.kill(); // Marks context as dead

try {
  const result = await ctx.request(SomeModel);
} catch (error) {
  // Throws InterruptedError when execution is cancelled
  if (error instanceof InterruptedError) {
    console.log('Execution was cancelled');
  }
}
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
import express, {type Request, type Response} from 'express';
import {Context, withModels, compose, withDeadline, InterruptedError, type WithModels, type Key} from '@ojson/models';
import type {OJson} from '@ojson/models';

// Расширяем Express Request
declare global {
  namespace Express {
    interface Request {
      ctx: WithModels<Context & {req: Request; res: Response}>;
      deadline: number;
    }
  }
}

const app = express();

// Middleware для deadline
app.use((req: Request, res: Response, next) => {
  const deadlineHeader = req.headers['x-request-deadline'];
  req.deadline = deadlineHeader ? parseInt(deadlineHeader as string, 10) : 30000;
  next();
});

// Middleware для создания контекста
app.use((req: Request, res: Response, next) => {
  const registry = new Map<Key, Promise<unknown>>();
  const baseCtx = new Context(`http-${req.method.toLowerCase()}-${req.path}`) as Context & {req: Request; res: Response};
  baseCtx.req = req;
  baseCtx.res = res;
  
  req.ctx = compose([
    withModels(registry),
    withDeadline(req.deadline),
  ])(baseCtx);
  
  next();
});

interface RequestParamsResult extends OJson {
  userId: string;
  token: string | undefined;
}

function RequestParams(props: OJson, ctx: Context & {req: Request}): RequestParamsResult {
  return {
    userId: (ctx.req.query.userId as string) || '',
    token: ctx.req.headers.authorization
  };
}
RequestParams.displayName = 'RequestParams';

interface AuthModelProps extends OJson {
  token: string | undefined;
}

interface AuthResult extends OJson {
  valid: boolean;
  userId?: string;
}

async function AuthModel(props: AuthModelProps, ctx: Context): Promise<AuthResult> {
  const response = await fetch(`/api/auth/verify`, {
    headers: {Authorization: props.token || ''}
  });
  return await response.json() as AuthResult;
}
AuthModel.displayName = 'AuthModel';

app.get('/api/user', async (req: Request, res: Response) => {
  try {
    const params = await req.ctx.request(RequestParams) as RequestParamsResult;
    const auth = await req.ctx.request(AuthModel, {token: params.token});
    
    if (!auth.valid) {
      return res.status(401).json({error: 'Unauthorized'});
    }
    
    res.json({userId: params.userId, auth});
  } catch (error) {
    req.ctx.fail(error);
    if (error instanceof InterruptedError) {
      return res.status(503).json({error: 'Service unavailable'});
    }
    res.status(500).json({error: (error as Error).message});
  } finally {
    req.ctx.end();
  }
});
```

## Advanced: Nested Generators

Generators support nested generators and promises:

```typescript
interface StepResult extends OJson {
  step: number;
}

function* Step1(props: OJson, ctx: Context): Generator<Promise<StepResult>, StepResult> {
  return yield Promise.resolve({step: 1});
}

function* Step2(props: OJson, ctx: Context): Generator<Promise<StepResult>, StepResult> {
  return yield Promise.resolve({step: 2});
}

interface PipelineResult extends OJson {
  step1: StepResult;
  step2: StepResult;
}

function* PipelineModel(props: OJson, ctx: Context): Generator<Promise<StepResult> | StepResult, PipelineResult> {
  const step1 = yield Step1(props, ctx);
  const step2 = yield Step2(props, ctx);
  return {step1, step2};
}
PipelineModel.displayName = 'PipelineModel';
```

## Error Handling

Models can throw errors, which propagate normally:

```typescript
import type {OJson, Context} from '@ojson/models';

interface FailingModelProps extends OJson {
  id?: string;
}

interface FailingModelResult extends OJson {
  id: string;
}

async function FailingModel(props: FailingModelProps, ctx: Context): Promise<FailingModelResult> {
  if (!props.id) {
    throw new Error('ID is required');
  }
  return {id: props.id};
}
FailingModel.displayName = 'FailingModel';

try {
  await ctx.request(FailingModel, {}); // Throws error
} catch (error) {
  console.error((error as Error).message); // "ID is required"
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

1. **One registry per request**: Create a new registry for each request lifecycle. **Never reuse a registry across different HTTP requests** - this would cause data leakage between requests and incorrect memoization behavior. Each request must have its own isolated registry.

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

### `ctx.request(model, props?)`

Executes a model with automatic memoization. TypeScript automatically infers the return type from the model's signature.

**Parameters:**
- `model: Model` - The model to execute (must have `displayName`)
- `props?: Props` - Optional input parameters (defaults to empty object). Type is inferred from the model's first parameter.

**Returns:** `Promise<Result>` where `Result` is inferred from the model's return type (Promise and Generator are automatically unwrapped).

**Type inference:**
- Props are inferred from the model's first parameter
- Result is inferred from the model's return type (Promise and Generator are automatically unwrapped)
- Context type is inferred from the model's second parameter

**Example:**
```typescript
function GetUser(props: {id: string}): Promise<User> {
  return fetchUser(props.id);
}
GetUser.displayName = 'GetUser';

// TypeScript infers: user is Promise<User>
const user = await ctx.request(GetUser, {id: '123'});
```

**Note**: TypeScript can infer return types from function bodies, but explicit return type annotations are recommended for better code documentation and early error detection:
```typescript
// Recommended - explicit return type
function GetUser(props: {id: string}): Promise<User> {
  return fetchUser(props.id);
}

// Also works - TypeScript infers Promise<User> from the return statement
function GetUser(props: {id: string}) {
  return fetchUser(props.id);
}
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
- [withTelemetry](../with-telemetry/readme.md) - OpenTelemetry tracing integration

