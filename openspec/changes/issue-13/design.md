# Design

## Verification boundary

A test stands at the context's end and fail. The span end is visible on the span. The test does not read a numeric end time from the context.

- `span-end`. While the span is still recording, ending or failing the context ends the span at the moment of that call, whether or not the context exposes a numeric end time different from that moment. Ending or failing a context whose span is no longer recording leaves that span unended.

## External contracts

none

## Technical prerequisites

- Depends: #11. Both changes edit the telemetry module. This change follows the interruption change while that issue is still open. It does not redefine the interruption rule.

## Open decisions

none
