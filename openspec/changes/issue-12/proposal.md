# Deepen the cross-request cache module

## Problem

The cross-request cache is as wide as its implementation. A caller learns `withCache`, the storage wrapper, four strategy bodies, lifetime and compression configuration, and a context factory that must remember to disable caching for a background refresh. The refresh duck-types that switch on a context the caller built. Cache-first and stale-while-revalidate are built out of the other two strategies. Tests reach past the request, so they pin the wrapper instead of the rules.

The caller cannot point at one module and rely on strategy choice, lifetime, compression, and monotonic disable together.

## Outcome

One deep cache module. The caller assigns a strategy on the Model and composes `withCache`. The only external seam is storage: an in-process memory store, and an in-memory adapter in tests.

Lifetime, compression, background refresh, and monotonic disable stay inside the module. The caller does not pass a context factory. A background refresh cannot cache again.

## Scope

In this package the change covers the cross-request cache the caller already sees:

- cache-only, network-only, cache-first, and stale-while-revalidate, including miss, hit, background refresh, and compression;
- lifetime chosen with the strategy;
- disable stays off for the context and its descendants, including a refresh.

The stored entry is named by the Model identity from the key change (#10). This change needs that identity and does not redefine it.

A write asks the interruption owner from #11 before storing a run. This change absorbs the cache update that re-checks that rule today, so the check is not a second implementation. It does not redefine the rule.

No other service is involved. No child issues.

## Out of scope

- Model identity and the key text (#10).
- The rule that an interrupted run is not memoized, not cached, and not recorded as success (#11). Request memoization and telemetry stay with that owner.
- In-request memoization. The registry stays separate from this cross-request cache.
- Overrides, validation, deadlines, and any helper that does not own a cache rule.
- A further storage seam. One adapter would be hypothetical.

## Constraints

- ADR 0001: `disableCache` is monotonic. Do not add `enableCache`.
- ADR 0007: compression stays opt-in, deflate and base64, chosen by strategy configuration.
- ADR 0008: composition over inheritance. Do not merge the registry into this cache.
- Storage stays a seam, because production storage and the test adapter both sit on it.
- Tests go through `withCache` and `ctx.request`. Delete tests that only pin the pass-through storage wrapper.
- This change follows the Model key module (#10) and the interruption owner (#11).

## Capabilities

### Added

### Modified

- cache-only A cache-only model returns the stored value or nothing and does not run.
- network-only A network-only model always runs and does not read or write the cache.
- cache-first A cache-first model returns a stored value on a hit; on a miss it runs and stores the result.
- stale-while-revalidate A stale-while-revalidate model returns a stored value on a hit and refreshes it in the background; on a miss it runs and stores the result.
- cache-ttl A stored value lives for the configured lifetime. The strategy lifetime overrides the default. A strategy that stores a value refuses a missing or non-positive lifetime.
- cache-zip Compression is opt-in and is chosen with the strategy.
- disable-cache Once caching is disabled it stays disabled for that context and its descendants, including a background refresh. The caller does not pass a context factory to keep that promise.

## Open questions

None.
