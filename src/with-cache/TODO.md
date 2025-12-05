# withCache TODO

This file tracks ideas and potential improvements for the `withCache` module.

## Context-level cache control

- Consider a scoped helper, e.g. `ctx.withoutCache(() => ctx.request(...))`, to disable cache only for a single logical operation, while keeping the context-level semantics monotonic.

## Context factory in Cache.update

In `cache.update`, a new context is created with only `withModels` wrapper:

```typescript
const ctx = withModels(new Map())(new Context('cache'));
```

This can cause loss of other wrappers (e.g., `withTelemetry`, `withDeadline`) that were applied to the original context used for HTTP requests.

**Solution**: Pass a context factory function to `Cache` that creates contexts with all necessary wrappers applied. This factory should be provided when creating the `Cache` instance, and `cache.update` should use it instead of creating a plain context.

**Impact**: This would ensure that background cache updates (e.g., in `StaleWhileRevalidate` strategy) maintain the same context capabilities as the main request context, including telemetry tracing, deadlines, etc.


