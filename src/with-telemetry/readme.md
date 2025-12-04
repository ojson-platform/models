# withTelemetry

OpenTelemetry tracing integration for model execution and context lifecycle.

## Overview

`withTelemetry` is a helper that enhances a `WithModels` context with OpenTelemetry distributed tracing capabilities. It automatically creates spans for contexts, tracks model execution, and records props, results, and errors as span attributes and events.

This helper enables observability in your application by providing structured tracing data that can be exported to OpenTelemetry-compatible backends (e.g., Jaeger, Zipkin, Prometheus).

## Key Concepts

### Spans and Context Hierarchy

Each context gets its own OpenTelemetry span:
- Span name matches the context name (`ctx.name`)
- Parent-child relationships are automatically established based on context hierarchy
- Spans are created with `SpanKind.INTERNAL` to indicate internal operations

### Model Telemetry Configuration

Models can optionally specify telemetry configuration via:

- **`displayProps`**: Which props fields to include in span attributes (with `props.` prefix)
- **`displayResult`**: Which result fields to include in span events (as `result` event)
- **`displayTags`**: Additional static attributes to add to spans (e.g., model version, name)

### Span Lifecycle

- **Start**: Span is created when context is wrapped with `withTelemetry`
- **End**: Span ends when `ctx.end()` is called, using `ctx.endTime` as the end timestamp
- **Error**: When `ctx.fail(error)` is called, span status is set to ERROR and error details are recorded

### PropsFilter

`PropsFilter` defines how to extract fields from props or results:

- `'*'` - Include all fields
- Object with field names as keys:
  - `true` - Include the field as-is
  - `string` - Include field with a different name (mapping)
  - `function` - Custom extractor function `(key, value) => attributeValue`

## Installation

```typescript
import {withTelemetry, type ModelWithTelemetry} from './with-telemetry';
import {withModels} from './with-models';
import {compose} from './utils';
```

## Basic Usage

### 1. Setup OpenTelemetry SDK (Optional but Recommended)

Before using `withTelemetry`, you typically want to configure the OpenTelemetry SDK to export traces:

```typescript
import {NodeSDK} from '@opentelemetry/sdk-node';
import {OTLPTraceExporter} from '@opentelemetry/exporter-otlp-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),
  serviceName: 'my-api',
});

sdk.start();
```

### 2. Compose with withModels

```typescript
import {Context} from './context';
import {withModels} from './with-models';
import {withTelemetry} from './with-telemetry';
import {compose} from './utils';

const registry = new Map();

const wrap = compose([
  withModels(registry),
  withTelemetry({serviceName: 'my-api'}),
]);

const ctx = wrap(new Context('request'));
```

### 3. Define Models with Telemetry Config

```typescript
import type {ModelWithTelemetry} from './with-telemetry';

function GetUser(props: {userId: number}, ctx: Context) {
  // ... fetch user logic
  return {id: props.userId, name: 'John'};
}
GetUser.displayName = 'GetUser';

// Optional: configure telemetry
GetUser.displayProps = {userId: true}; // Record userId in span attributes
GetUser.displayResult = {name: true}; // Record name in result event
GetUser.displayTags = {
  'model.version': '1.0.0',
  'model.type': 'user',
};
```

### 4. Use Models

```typescript
const user = await ctx.request(GetUser, {userId: 123});
// Span will have:
// - Attribute: props.userId = 123
// - Event: result with {name: 'John'}
// - Attributes: model.version = '1.0.0', model.type = 'user'
```

## Advanced Usage

### Recording All Props

Use `'*'` to record all props fields:

```typescript
function SearchUsers(props: {query: string; limit: number}, ctx: Context) {
  // ...
}
SearchUsers.displayName = 'SearchUsers';
SearchUsers.displayProps = '*'; // Records all props: props.query, props.limit
```

### Custom Field Mapping

Use string values to map fields to different attribute names:

```typescript
function GetUser(props: {userId: number}, ctx: Context) {
  // ...
}
GetUser.displayName = 'GetUser';
GetUser.displayProps = {
  userId: 'user.id', // Maps props.userId to props.user.id
};
```

### Custom Extractor Functions

Use functions to transform values before recording:

```typescript
function GetUser(props: {userId: number}, ctx: Context) {
  // ...
}
GetUser.displayName = 'GetUser';
GetUser.displayProps = {
  userId: (key, value) => `user-${value}`, // Custom transformation
};
```

### Context Hierarchy and Spans

Child contexts automatically create child spans:

```typescript
const parent = wrap(new Context('parent-request'));
const child = parent.create('child-operation');

// child span will be a child of parent span in OpenTelemetry
```

### Error Handling

Errors are automatically recorded when `ctx.fail()` is called:

```typescript
try {
  await ctx.request(RiskyModel);
} catch (error) {
  ctx.fail(error);
  // Span status is set to ERROR
  // Error event is added with message and stack trace
}
```

Note: Only object errors get error events (strings and other primitives only set status).

### Dead-aware Behavior

When a context is killed and `request()` returns `Dead`, result telemetry is not recorded (props are still recorded, as they're set before execution):

```typescript
ctx.kill();
const result = await ctx.request(MyModel, {id: 1});
// Props are recorded, but result event is not (since result === Dead)
```

## API Overview

### `withTelemetry(config: TelemetryConfig)`

Factory function that enhances a `WithModels` context with OpenTelemetry tracing.

**Parameters:**
- `config.serviceName` (string): Service name used for tracer identification

**Returns:** Wrapper function `(ctx: WithModels<Context>) => WithTelemetry<WithModels<Context>>`

### `ModelWithTelemetry<Props, Result>`

Extended model type that supports optional telemetry configuration:

```typescript
type ModelWithTelemetry<Props extends OJson, Result extends Json> = Model<Props, Result> & {
  displayProps?: PropsFilter;
  displayResult?: PropsFilter;
  displayTags?: Attributes;
};
```

### `PropsFilter`

Filter configuration for extracting fields:

```typescript
type PropsFilter = 
  | '*'
  | Record<string, boolean | string | ((key: string, value: unknown) => unknown)>;
```

## Testing Notes

When testing code that uses `withTelemetry`:

- Spans are created automatically but may not be exported unless SDK is configured
- Use `vi.spyOn(span, 'setAttributes')` and `vi.spyOn(span, 'addEvent')` to verify telemetry calls
- Access span via `(ctx as any)[__TelSpan__]` (exported symbol for testing)
- Test that props, results, and errors are recorded correctly
- Verify that child contexts create child spans
- Test Dead-aware behavior (props recorded, results not)

See `src/with-telemetry/with-telemetry.spec.ts` for examples.

## Best Practices

1. **Service Name**: Use a consistent service name that identifies your application
2. **Selective Recording**: Only record props/result fields that are useful for debugging and monitoring (avoid sensitive data)
3. **Static Tags**: Use `displayTags` for metadata that doesn't change per call (e.g., model version, type)
4. **Error Context**: Ensure errors are properly propagated to context via `ctx.fail()` to get error telemetry
5. **Span Names**: Use descriptive context names that help identify operations in traces
6. **Export Configuration**: Configure OpenTelemetry SDK to export traces to your observability backend

## See Also

- [withModels](../with-models/readme.md) - Core memoization helper (required dependency)
- [withCache](../with-cache/readme.md) - Adds caching layer
- [withDeadline](../with-deadline/readme.md) - Adds timeout/deadline support
- [withOverrides](../with-overrides/readme.md) - Model substitution for testing

