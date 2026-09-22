# Design

## Verification boundary

A test stands at `withCache` and `ctx.request`. The stored entry is visible only at the storage seam: the in-process memory store, or the in-memory adapter in tests. Lifetime, compression, background refresh, and monotonic disable stay behind that seam. The caller assigns the strategy on the Model and does not pass a context factory. A test that only pins the pass-through storage wrapper does not count.

- `cache-only`. A hit returns the stored value and the Model does not run. A miss returns nothing. Storage receives no new entry.
- `network-only`. The Model runs. Storage is not read and receives no entry.
- `cache-first`. A hit returns the stored value and the Model does not run. A miss runs the Model and storage receives the result. No background refresh starts.
- `stale-while-revalidate`. A hit returns the stored value before the refresh finishes. A miss runs the Model once and storage receives the result. The refresh's own entry is what storage receives afterward.
- `cache-ttl`. The entry's lifetime is the strategy lifetime, or the default when the strategy sets none. A strategy that stores a value refuses a missing or non-positive lifetime. `cache-only` and `network-only` do not need a lifetime.
- `cache-zip`. Storage receives the Model value unchanged while compression is off. Opt-in compression, chosen with the strategy, stores deflate then base64. A later read with the same choice returns the original value.
- `disable-cache`. Once caching is disabled it stays disabled for that context and for a nested context created afterward. That request does not read or write storage and does not start a refresh. A context created earlier, the parent, a sibling, and another tree stay as they were. A background refresh keeps cache disabled for its own Model run even when the request that started it still has cache enabled. The caller passes no context factory. That run does not read or write storage. The entry the refresh writes itself still arrives at the seam.

## External contracts

none

## Technical prerequisites

- Depends: #10. The stored entry is named by the Model identity from that change. This change does not redefine it.
- Depends: #11. A write asks the interruption owner before storing a run. This change absorbs the cache update that re-checks that rule, so the check is not a second implementation.

## Open decisions

none
