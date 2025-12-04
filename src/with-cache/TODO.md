# withCache TODO

This file tracks ideas and potential improvements for the `withCache` module.

## Context-level cache control

- Consider a scoped helper, e.g. `ctx.withoutCache(() => ctx.request(...))`, to disable cache only for a single logical operation, while keeping the context-level semantics monotonic.


