# ADR 0002: ctx.set() Pattern for Request-Dependent Models

## Status

Accepted

## Context

During development, there was an attempt to add mutable request data (e.g., Express `Request` and `Response` objects) directly to the context to allow models to access them without passing through function parameters.

### Original Problematic Implementation

The original approach attempted to access request data directly from the context:

```typescript
// Model accessing mutable request data from context
function RequestParams(props: OJson, ctx: Context & {req: Request}): ExpressRequestParams {
  return {
    params: (ctx.req.params || {}) as Record<string, string>,
    query: (ctx.req.query || {}) as Record<string, string>,
    body: (ctx.req.body || {}) as Json,
  };
}
RequestParams.displayName = 'RequestParams';
```

This approach revealed several architectural problems:

1. **Mutability violation**: Models gained access to mutable data (e.g., `req.url`, `req.params`) that could change after model execution, breaking memoization guarantees.

2. **Non-deterministic memoization**: If `req.url` is modified after `RequestParams` is computed, subsequent calls with the same props would return stale cached results, violating the core principle that models must be deterministic.

3. **God object anti-pattern**: Creating snapshots of all request data upfront is inefficient and creates unnecessary copies of data that may never be used.

4. **Type safety**: Models accessing mutable request objects don't have type guarantees that the data is JSON-serializable.

5. **Architectural violation**: Adding mutable, non-JSON data to the context breaks the fundamental contract that models operate on immutable, JSON-serializable data.

## Decision

We **do not** add mutable request data to the context. Instead, we **introduce** `ctx.set(model, value, props?)` pattern for request-dependent models.

Models that depend on request data should:
1. Not be directly callable (throw error if called)
2. Have their values set explicitly via `ctx.set()` in middleware with immutable snapshots
3. Return the pre-set value when requested via `ctx.request()`
4. Use the same memoization registry as regular models, ensuring consistency

## Rationale

### Benefits

1. **Immutable snapshots**: Only the data actually needed is snapshot'ed at the point of use, avoiding unnecessary copying.

2. **Explicit control**: It's clear which models are request-dependent and when their values are set.

3. **Type safety**: Values set via `ctx.set()` are explicitly typed and validated.

4. **No god objects**: Only specific values are snapshot'ed, not entire request objects.

5. **Deterministic memoization**: Snapshot'ed values are immutable, ensuring memoization works correctly.

### Trade-offs

1. **API changes**: Requires adding `ctx.set()` method to context API.

2. **Explicit setup**: Middleware must explicitly set values for request-dependent models.

3. **Model design**: Request-dependent models cannot be called directly and must throw errors.

## Implementation

### Context API Extension

```typescript
// In Context or WithModels
ctx.set<M extends Model>(
  model: M, 
  value: ModelResult<M>, 
  props?: ModelProps<M>
): void;
```

The `set()` method:
- Uses the same registry as `request()` for consistency
- Builds cache keys using `displayName` and serialized props (same as `request()`)
- Throws an error if a value already exists in the registry for the given model+props
- Ensures immutable snapshots are stored, not mutable references

### Model Pattern

```typescript
function RequestParams() {
  throw new Error('This model should be set by external source via ctx.set()');
}
RequestParams.displayName = 'RequestParams';
```

### Middleware Pattern

```typescript
// In middleware - create immutable snapshot of only needed fields
req.ctx.set(RequestParams, {
  userId: req.params.userId as string,
  isAdmin: req.query.isAdmin === 'true',
  timestamp: Date.now(),
});
```

This pattern ensures:
- Only specific, needed fields are snapshot'ed (not entire request objects)
- All values are JSON-serializable primitives
- Immutable snapshots prevent mutability issues
- No god objects with unnecessary data

### Usage

```typescript
// Models can use the pre-set value
const params = await req.ctx.request(RequestParams);
// params: { userId: string, isAdmin: boolean, timestamp: number }
```

## Consequences

- Context API is extended with `set()` method that uses the same registry as `request()`
- Request-dependent models must follow the new pattern (throw error if called directly)
- Middleware must explicitly set values for request-dependent models with immutable snapshots
- `set()` validates that values don't already exist in registry, preventing overwrites
- Documentation and examples must be updated

## Alternatives Considered

1. **Adding mutable data to context**: Rejected due to mutability violations and non-deterministic memoization
2. **Immutable snapshot via helper**: Rejected due to god object anti-pattern and inefficiency
3. **Lazy snapshot via Proxy**: Rejected due to complexity and debugging difficulties
4. **Uncacheable models**: Rejected due to loss of memoization benefits
5. **Model metadata for required fields**: Rejected due to complexity and coordination overhead
6. **Separate storage for set values**: Rejected in favor of reusing registry for consistency

