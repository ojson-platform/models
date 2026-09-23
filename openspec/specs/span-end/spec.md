# span-end

## Purpose

A span stays open until the caller ends or fails its context. While the span is still recording, it ends at the numeric end time the context exposes, or at the current time when the context exposes no numeric end time.

## Requirements

### Requirement: Span ends when the context ends or fails

While a span is still recording, ending or failing its context SHALL end the span at the context's numeric end time if the context exposes one, and at the current time if it does not.
Ending or failing a context whose span is no longer recording SHALL leave that span unended.

#### Scenario: End with a numeric end time

- **WHEN** the caller ends a context that exposes a numeric end time while its span is still recording
- **THEN** the span ends at that end time

#### Scenario: Fail with a numeric end time

- **WHEN** the caller fails a context that exposes a numeric end time while its span is still recording
- **THEN** the span ends at that end time

#### Scenario: End with no numeric end time

- **WHEN** the caller ends a context that exposes no numeric end time while its span is still recording
- **THEN** the span ends at the current time

#### Scenario: Fail with no numeric end time

- **WHEN** the caller fails a context that exposes no numeric end time while its span is still recording
- **THEN** the span ends at the current time

#### Scenario: End after the span has stopped recording

- **WHEN** the caller ends a context whose span is no longer recording
- **THEN** the span is not ended again

#### Scenario: Fail after the span has stopped recording

- **WHEN** the caller fails a context whose span is no longer recording
- **THEN** the span is not ended again
