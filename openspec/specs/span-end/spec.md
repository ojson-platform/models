# span-end

## Purpose

A span stays open until the caller ends or fails its context. While the span is still recording, it ends at the moment of that call, whether or not the context exposes a numeric end time.

## Requirements

### Requirement: Span ends when the context ends or fails

While a span is still recording, ending or failing its context SHALL end the span at the moment of that call, whether or not the context exposes a numeric end time.
Ending or failing a context whose span is no longer recording SHALL leave that span unended.

#### Scenario: End with a numeric end time

- **WHEN** the caller ends a context that exposes a numeric end time different from the moment of the call, while its span is still recording
- **THEN** the span ends at the moment of that call

#### Scenario: Fail with a numeric end time

- **WHEN** the caller fails a context that exposes a numeric end time different from the moment of the call, while its span is still recording
- **THEN** the span ends at the moment of that call

#### Scenario: End with no numeric end time

- **WHEN** the caller ends a context that exposes no numeric end time while its span is still recording
- **THEN** the span ends at the moment of that call

#### Scenario: Fail with no numeric end time

- **WHEN** the caller fails a context that exposes no numeric end time while its span is still recording
- **THEN** the span ends at the moment of that call

#### Scenario: End after the span has stopped recording

- **WHEN** the caller ends a context whose span is no longer recording
- **THEN** the span is not ended again

#### Scenario: Fail after the span has stopped recording

- **WHEN** the caller fails a context whose span is no longer recording
- **THEN** the span is not ended again
