# ADR 0001: No `enableCache()` API

## Status

Accepted

## Context

The `withCache` helper currently exposes:

- `disableCache()` — disables cache strategies for the current context and its
  children.
- `shouldCache()` — indicates whether cache strategies are currently enabled.

There was an idea to add a symmetric `enableCache()` API so that callers could
turn caching back on at deeper levels of the context tree.

## Decision

We **do not** add an `enableCache()` API.

Cache enablement must remain **monotonic** within a context tree:

- Once caching is disabled for a context, it stays disabled for that context
  and all of its descendants.
- Child contexts cannot re-enable caching independently of their parents.

## Rationale

- Allowing `enableCache()` at arbitrary levels would make cache behavior
  difficult to reason about and debug:
  - different branches of the same request could observe inconsistent caching;
  - it would be harder to answer "was this value cached or not?" when
    investigating production issues.
- The current model (`disableCache()` only, no re-enable) provides:
  - a clear mental model: "once off, always off" for the subtree;
  - simpler invariants for helpers and tests.

If more granular control is needed in the future, we can introduce **scoped**
APIs (e.g. `ctx.withoutCache(fn)`), but they should still obey the monotonic
semantics at the context level.



