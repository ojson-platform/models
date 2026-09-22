# Deepen interruption so a killed Model is not persisted

## Problem

Killing a Model is not one rule with one owner. Request memoization keeps a private dead state. A deadline races completion and then kills. A cache update swallows the interruption and skips the write. Telemetry drops a successful result when the run was killed. Cache strategies only ask whether caching is enabled and do not know about kill.

The caller cannot point at one place and prove the ADR 0008 rule: an interrupted run is not memoized, not cached, and not recorded as success.

## Outcome

One in-process owner for interruption. It owns kill, whether the run is still alive, the race between completion and interruption, and the rule that an interrupted run is not stored.

A killed request is absent from request memoization, absent from the cache, and not recorded as a successful span. A deadline timeout is that same interruption. Deadline stays a composition step.

## Scope

In this package the change covers the interruption the caller already sees:

- request memoization, the cache, and telemetry ask one owner before treating a run as successful;
- kill and a deadline timeout share that owner.

The run is named by the Model identity from the key change. This change does not redefine that identity.

No other service is involved. No child issues.

## Out of scope

- Cache deepening beyond this persist rule. The cache update re-implements the rule today; the rest of cache deepening stays later.
- A base class. ADR 0008 is composition over inheritance.
- Model identity and key text.
- Telemetry other than refusing to record a killed run as success.
- Overrides, validation, and any helper that does not own this rule.

## Constraints

- ADR 0008: interruption-aware cache and telemetry. A killed run must not look successful.
- `withDeadline(0)` stays a no-op. `withDeadline` stays last in `compose`.
- `InterruptedError` remains the error callers catch.
- Tests cross the interruption interface. There is no separate test surface for a private dead state.
- This change follows the Model key module (#10) and comes before the cache deepening.

## Capabilities

### Added

### Modified

- interrupted-run An interrupted run is not memoized, not cached, and not recorded as success; a deadline timeout is the same interruption as kill.

## Open questions

None.
