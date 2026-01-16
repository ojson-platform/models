# ADR 0009: Ajv as an optional dependency for JSON Schema validation

## Status

Accepted

## Context

`withValidation` validates model inputs using a JSON Schema-like approach.
There are two competing goals:

- **No required dependencies** for the core `@ojson/models` package.
- **Production-grade JSON Schema validation** when a project needs it.

Shipping Ajv as a hard dependency would increase install size and dependency
surface for users who do not need validation. At the same time, a minimal
built-in validator is intentionally limited and may not cover all JSON Schema
edge cases.

## Decision

We support Ajv as an **optional runtime dependency** for `withValidation`:

- When `validator: 'json-schema'` and `ajv` is available at runtime,
  `withValidation` uses Ajv to compile and validate schemas.
- When `ajv` is not available, `withValidation` falls back to the built-in
  minimal schema validator.
- `ajv-formats` is also treated as optional; if present, it is registered to
  provide better support for common formats.

Ajv is intentionally **not** added as a required dependency of `@ojson/models`.

## Rationale

- **Zero-cost default**: users who don't need validation don't pay for Ajv.
- **Better correctness when needed**: Ajv provides mature schema compilation and
  richer error reporting.
- **Compatibility**: projects can adopt Ajv incrementally without changing
  `@ojson/models` dependencies.

## Consequences

### Positive

- Validation is usable out of the box (built-in validator).
- Advanced validation is available when Ajv is installed.

### Negative

- Runtime behavior depends on whether Ajv is installed (Ajv vs fallback).
- We must maintain a stable minimal schema subset for the fallback validator.

## Alternatives considered

1. **Hard dependency on Ajv**: rejected due to footprint and dependency surface.
2. **Peer dependency on Ajv**: rejected to keep installation friction low.
3. **Only built-in validator**: rejected due to limited correctness/coverage for
   complex schemas.

