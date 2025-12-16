# ADR 0004: Make model span the active OpenTelemetry span during model execution

## Status

Accepted

## Context

The `withTelemetry` helper integrates OpenTelemetry tracing with the `WithModels`
context. For each context a span is created, and for each model execution a child
span is created (via `ctx.call` / `ctx.create`).

Originally, `withTelemetry`:

- created spans for contexts and models;
- recorded model props, results and errors on the model's span;
- but did **not** adjust the *active* OpenTelemetry context while a model was
  executing.

This had two practical drawbacks:

1. Models could not easily access "their" span using the standard OTEL APIs:

   ```ts
   import {context as otelContext, trace} from '@opentelemetry/api';

   function MyModel(props: OJson, ctx: Context) {
     const activeSpan = trace.getSpan(otelContext.active());
     // activeSpan was not guaranteed to be the model span
   }
   ```

2. Any auto‑instrumentation or libraries that rely on `api.context.active()` to
   create child spans (e.g. HTTP client instrumentation) could end up attaching
   spans either to the parent context span or to whatever span happened to be
   active, instead of attaching them to the model span.

At the same time, we want to keep `getSpan(ctx)` as a **testing / debugging**
utility only, and not as the primary way for application code to reach into
telemetry internals.

## Decision

When executing a model, `withTelemetry` will:

- make the **model span** the active OpenTelemetry span for the duration of the
  model execution;
- keep the existing AsyncLocalStorage-based mechanism for recording
  `displayProps`, `displayResult` and `displayTags` on the model span;
- continue to expose `getSpan(ctx)` only as a helper for tests and debugging,
  not as a recommended production API.

Concretely, in `wrapCall` we now wrap the model execution in
`api.context.with(...)`:

```ts
const wrapCall = (call: Context['call']) =>
  async function (this: WithTelemetry<WithModels<Context>>, name: string, action: Function) {
    const parent = this.parent as WithTelemetry<WithModels<Context>> | undefined;
    const modelStorage = parent?.[__ModelStorage__] || requireModelStorage(this);
    const modelInfo = modelStorage.getStore();

    return await call.call(this, name, async (child: WithTelemetry<WithModels<Context>>) => {
      const childSpan = child[__Span__];

      return api.context.with(trace.setSpan(api.context.active(), childSpan), async () => {
        // record props/tags on childSpan if modelInfo is present
        // execute model action
        // record result/error on childSpan
      });
    });
  };
```

This guarantees that:

- `trace.getSpan(otelContext.active())` inside a model (or inside libraries it
  calls) refers to the **model span**;
- spans created by other instrumentations during model execution become children
  of the model span.

## Consequences

### Positive

- **Natural OTEL integration inside models**:
  - Models can use standard OpenTelemetry APIs to work with the current span,
    without relying on internal symbols or test helpers.
  - Example:

    ```ts
    function MyModel(props: OJson, ctx: Context) {
      const span = trace.getSpan(otelContext.active());
      span?.addEvent('my-model-start', {id: props.id});
      // ...
    }
    ```

- **Better span hierarchy for auto‑instrumentation**:
  - HTTP client instrumentation, database client instrumentation and other
    OTEL-based libraries will automatically attach their spans as children of
    the model span.

- **Internals remain encapsulated**:
  - Application code does not need to know about `__Span__` or
    `__ModelStorage__`.
  - `getSpan(ctx)` remains available for tests and debugging, but is not the
    primary API for production usage.

### Negative / Risks

- **Models become aware of OTEL APIs (if they choose to use them)**:
  - Application code that calls `trace.getSpan(otelContext.active())` now has a
    dependency on the OpenTelemetry API package.
  - This is an explicit choice by the application and is acceptable for
    telemetry-enabled services.

- **Potential surprises if `context.with` is misused elsewhere**:
  - If other parts of the system also change the active OTEL context, it is
    important to understand that `withTelemetry` will set the model span as
    active only inside the model execution callback.
  - Outside of that callback, the active context reverts to its previous value.

### Alternatives considered

- **Expose `__Span__` or `__TelSpan__` for direct access**:
  - Rejected because it leaks internals and encourages tight coupling between
    application code and helper implementation details.

- **Encourage use of `getSpan(ctx)` in production code**:
  - Rejected; `getSpan` is intended for tests and debugging, not as a core API.
  - It also requires passing `ctx` down the call stack, which is less ergonomic
    than using `api.context.active()`.

- **Do nothing (only parent context span is active)**:
  - Rejected because it limits the usefulness of telemetry inside models and
    leads to less informative trace hierarchies.

## Testing

- Added a unit test to `with-telemetry.spec.ts` that:
  - executes a model which calls `trace.getSpan(otelContext.active())` and
    stores the span;
  - verifies that this active span matches the child span created for the model
    (by intercepting `ctx.create` and capturing model contexts);
  - ensures that manual instrumentation inside a model observes the correct
    active span.


