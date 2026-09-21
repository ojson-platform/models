# Deepen the span end into telemetry

## Problem

`withTelemetry` ends a span at `Context.endTime` when that field is present. `endTime` is not on `BaseContext`. Helpers depend on `BaseContext`, so a custom context gets a different span end than `Context`. Tests cast the context to read `endTime`.

The caller cannot rely on one span-end rule for every context that implements `BaseContext`.

## Outcome

The telemetry module records the span end when it handles `end` and `fail`. `BaseContext` stays the seam. `Context.endTime` stays a field of the concrete context and is not part of the telemetry interface.

A context that implements only `BaseContext` ends its span at the moment `end` or `fail` runs, the same way `Context` does.

## Scope

In this package the change covers the span end the caller already sees through `withTelemetry`:

- the span ends when the context ends;
- the span ends when the context fails;
- that end is the moment telemetry handles the call, for `Context` and for a context that only implements `BaseContext`.

No other service is involved. No child issues.

## Out of scope

- Adding `endTime` to `BaseContext`.
- `Context.endTime`, `startTime`, and `liveTime` as fields of the concrete context.
- How model attributes are stored (ADR 0003) and which span is active for the call (ADR 0004). `getSpan` stays a test and debug helper.
- Error status and error events on fail, other than the moment the span ends.
- The cross-request cache (#12).
- The rule that an interrupted run is not recorded as success (#11).

## Constraints

- ADR 0008: helpers depend on the minimal `BaseContext`. Do not add `endTime` to that interface. That would widen the seam instead of deepening telemetry.
- ADR 0003 and ADR 0004 stay as they are.
- Tests assert the span end through the context lifecycle. They do not cast the context to read `endTime`.
- Independent of the cache work (#12). If the interruption change (#11) is in flight, this follows it: both edit the telemetry module.

## Capabilities

### Added

### Modified

- span-end The span ends when telemetry handles end or fail, at that moment, for a context that only implements BaseContext as well as for Context.

## Open questions

None.
