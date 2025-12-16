# TODO (library-level)

This file tracks library-wide technical TODOs and architectural follow-ups.

## Cache / withCache

- Align `with-cache` with the common helper structure:
  - Add `types.ts` for all public types (`WithCache`, `CacheConfig`, `CacheProvider`, `CacheStrategy`, …).
  - Optionally add `utils.ts` for pure helper functions.
  - Update `index.ts` to use `export type * from './types';` and re-export implementations explicitly.

## Context abstraction

- **Slim down the required base context API**:
  - `Context` currently provides no-op methods `event` and `set` that are actually implemented
    by `withTelemetry` and `withModels`.
  - Move these responsibilities into the helpers so that the minimal context contract only
    covers lifecycle (`name`, `parent`, `create`, `end`, `fail`, `call`).
  - Update helper typings to depend on the minimal shape rather than the concrete `Context` class.

- **Avoid hard dependencies on `new Context(...)` in helpers**:
  - Scan all modules for `new Context(` usages.
  - Keep `new Context(...)` only in:
    - examples / READMEs;
    - tests that explicitly use the default implementation.
  - Replace helper-internal `new Context(...)` (e.g. in `Cache.update`) with injectable factories
    or higher-level entry points so that applications can provide their own context implementation.

## Telemetry (follow-ups)

- Monitor real-world usage of manual instrumentation inside models
  (`trace.getSpan(otelContext.active())`) and adjust documentation/examples if needed.
- If future requirements appear (e.g. soft failures in exporters), reconsider whether a dedicated
  telemetry error class is warranted; for now, simple `Error` subclasses for configuration issues
  are sufficient.


