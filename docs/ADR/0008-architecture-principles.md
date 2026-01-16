# ADR 0008: Architecture principles and design patterns

## Status

Proposed

## Context

The library has grown into a set of composable helpers (`withModels`, `withCache`,
`withTelemetry`, `withOverrides`, `withDeadline`) built around a minimal context
interface. While we have multiple ADRs describing specific decisions (e.g.
`ctx.set()` pattern, AsyncLocalStorage for telemetry, cache compression), we do
not have a single document that states the **architecture principles** that guide
the overall design.

Having these principles written down helps:

- keep the public API coherent as new helpers are added;
- evaluate proposed changes against shared invariants;
- explain the library to new contributors and users;
- keep generated documentation aligned with the intended mental model.

## Decision

We explicitly adopt and document the following architecture principles and
patterns as the foundation of `@ojson/models`.

### Principles

1. **Composition over inheritance**
   - Functionality is added through wrapper functions that enhance a context
     (`withModels` → `withCache`/`withOverrides`/`withTelemetry` → `withDeadline`),
     rather than through class hierarchies.

2. **Determinism by design**
   - Models are expected to be deterministic: same props → same result.
   - This is required for predictable memoization, caching, and telemetry.

3. **Type safety through generics**
   - Wrapper composition preserves type information across the enhancement chain
     (structural typing, generic wrapper signatures).

4. **Separation of concerns**
   - Each `with-*` module has a single responsibility (memoization, caching,
     telemetry, overrides, deadlines).

5. **Request lifecycle isolation**
   - In-process memoization (`Registry`) is scoped to a single request lifecycle
     and must not be reused across HTTP requests.

### Patterns and invariants to preserve

- **Layered caching**
  - Layer 1: in-request memoization via registry (fast, in-process).
  - Layer 2: cross-request caching via `CacheProvider` (slower, persistent).

- **Strict module boundaries**
  - Cross-module imports must go through module `index.ts` only.
  - This keeps internal implementation details encapsulated and APIs stable.

- **Explicit JSON boundary**
  - Model props are `OJson` (object at the top level) to enable deterministic
    key generation and named parameters.
  - Models should return JSON DTOs rather than live ORM entities.

- **Interruption-aware behavior**
  - Cancellation (`kill()` / deadlines) must not produce cached/telemetry results
    that imply successful completion.

## Consequences

### Positive

- A shared “north star” for architecture and docs.
- Easier review of new helpers and features.
- Clearer structure for generated documentation and onboarding materials.

### Negative

- Another document to keep consistent with code and existing docs.

