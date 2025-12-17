# ADR 0003: Using AsyncLocalStorage for Model Context in withTelemetry

## Status

Accepted

## Context

During the implementation of `withTelemetry`, a problem arose with recording telemetry attributes (props, results, errors) on the correct span.

Initially, attributes were being recorded on the parent span (the span of the context that called `ctx.request()`), rather than on the child model span. This happened because:

1. `wrapRequest` is called on the parent context and only has access to the parent span
2. The child context (and its span) is created inside `ctx.call()`, which is called from `ctx.request()`
3. Model information (displayProps, displayResult, displayTags, props) was only available in `wrapRequest`, but not at the point where the child span is created

### Problem with Parallel Calls

Initially, using a Symbol on the context (`__CurrentModel__`) to pass model information from `wrapRequest` to `wrapCall` was considered. However, this approach had a critical flaw:

```typescript
// Problem: parallel calls overwrite each other
await Promise.all([
    ctx.request(ModelA, {id: 1}), // Sets __CurrentModel__ = ModelA
    ctx.request(ModelB, {id: 2}), // Overwrites __CurrentModel__ = ModelB
]);
// Both calls will receive information about ModelB instead of their own
```

This created a race condition with parallel `ctx.request()` calls.

## Decision

Use `AsyncLocalStorage` from `node:async_hooks` to store model information during request execution. This provides:

1. **Context isolation**: Each async call has its own storage context
2. **Parallel call support**: Parallel `ctx.request()` calls don't interfere with each other
3. **Cross-runtime compatibility**: `AsyncLocalStorage` is supported in Node.js, Deno, and Bun via `node:async_hooks`

### Implementation

```typescript
import {AsyncLocalStorage} from 'node:async_hooks';

interface ModelInfo {
    displayProps?: PropsFilter;
    displayResult?: PropsFilter;
    displayTags?: Attributes;
    props: OJson;
}

const modelStorage = new AsyncLocalStorage<ModelInfo>();

// In wrapRequest - store model information
const wrapRequest = (request: WithModels<Context>['request']) =>
    async function<Props extends OJson, Result extends Json>(
        this: WithTelemetry<WithModels<Context>>,
        model: ModelWithTelemetry<Props, Result>,
        props: Props
    ) {
        const {displayProps, displayResult, displayTags} = model;

        return modelStorage.run(
            {displayProps, displayResult, displayTags, props},
            async () => {
                return await request.call(this, model, props);
            }
        );
    };

// In wrapCall - retrieve model information and record on child span
const wrapCall = (call: Context['call']) =>
    async function(this: WithTelemetry<WithModels<Context>>, name: string, action: Function) {
        const modelInfo = modelStorage.getStore();

        return await call.call(this, name, async (childCtx: WithTelemetry<WithModels<Context>>) => {
            const childSpan = childCtx[__Span__];

            if (modelInfo) {
                // Record props on the child span (model's span)
                if (modelInfo.displayProps) {
                    childSpan.setAttributes(
                        extractFields(modelInfo.props, modelInfo.displayProps, 'props')
                    );
                }

                // Record displayTags on the child span
                if (modelInfo.displayTags) {
                    childSpan.setAttributes(modelInfo.displayTags);
                }
            }

            const result = await action(childCtx);

            // Record result on the child span
            if (modelInfo?.displayResult) {
                childSpan.addEvent('result', extractResultFields(result, modelInfo.displayResult));
            }

            return result;
        });
    };
```

## Consequences

### Positive

1. **Correct attribute placement**: Props, results, and tags are now recorded on the model's span, not the parent span
2. **Parallel call support**: Multiple `ctx.request()` calls can execute in parallel without conflicts
3. **Cross-runtime compatibility**: Solution works in Node.js, Deno, and Bun
4. **Clean architecture**: Model information is passed through a standard async context mechanism, not through object mutation

### Negative

1. **Dependency on Node.js API**: Requires `node:async_hooks`, though this is a standard Node.js module and is supported in Deno/Bun
2. **Additional complexity**: Using `AsyncLocalStorage` adds a layer of abstraction

### Alternatives Considered

1. **Symbol on context (`__CurrentModel__`)**: Rejected due to race condition with parallel calls
2. **Passing information through parameters**: Rejected due to need to change `ctx.call()` signature and break encapsulation
3. **Global storage with Promise keys**: Rejected due to complexity and potential memory leak issues

## See Also

- [ADR 0002: ctx.set() pattern](./0002-ctx-set-pattern.md) - Another example of solving context passing problems
- [Node.js AsyncLocalStorage Documentation](https://nodejs.org/api/async_hooks.html#class-asynclocalstorage)
- [Deno AsyncLocalStorage Support](https://deno.land/api@v1.40.0?s=AsyncLocalStorage)
- [Bun AsyncLocalStorage Support](https://bun.sh/docs/api/async-hooks)
