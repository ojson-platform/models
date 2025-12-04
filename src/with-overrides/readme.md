# withOverrides

Model override helper for `withModels`-based contexts.

## Overview

`withOverrides` is a small helper that lets you **substitute one model
with another** at runtime:

- Overrides are defined as a `Map<Model, Model>`.
- When you call `ctx.request(OriginalModel, props)`, the override map
  is consulted and the final target model is invoked instead.
- Overrides can be chained (A → B → C), in which case both A and B
  delegate to C.

This is useful for:

- Testing (injecting mock models).
- A/B testing and feature flags.
- Local development (swapping real backends with stubs).

## Key Concepts

### Overrides map

`Overrides` is defined as:

```ts
export type Overrides = Map<Model, Model>;
```

- **Key**: original model (the one your code calls).
- **Value**: override model (the one that is actually executed).

Overrides are **transitive**:

```ts
overrides.set(ModelA, ModelB);
overrides.set(ModelB, ModelC);
// Requests for ModelA and ModelB both end up calling ModelC.
```

### Interaction with `withModels`

`withOverrides` wraps a `WithModels` context and:

- overrides `ctx.request` to look up the final model in the overrides map;
- overrides `ctx.create` so that **child contexts inherit the same
  overrides**.

Memoization behavior (`withModels` registry) is unchanged:

- once the final target model is chosen, memoization is done **by that
  model and its props**.

## Installation

```ts
import {withOverrides} from './with-overrides';
import {withModels} from './with-models';
import {Context} from './context';
```

## Basic Usage

### 1. Define models and overrides

```ts
function OriginalModel(props, ctx) {
  return {result: 'original'};
}
OriginalModel.displayName = 'OriginalModel';

function MockModel(props, ctx) {
  return {result: 'mock'};
}
MockModel.displayName = 'MockModel';

const overrides = new Map([
  [OriginalModel, MockModel],
]);
```

### 2. Compose context

```ts
import {compose} from './utils';

const registry = new Map();

const wrap = compose([
  withModels(registry),
  withOverrides(overrides),
]);

const ctx = wrap(new Context('request'));
```

### 3. Call models through the overridden context

```ts
const result = await ctx.request(OriginalModel, {});
// Actually calls MockModel under the hood
// result = { result: 'mock' }
```

## Advanced Usage

### Chained overrides

```ts
const overrides = new Map([
  [ModelA, ModelB],
  [ModelB, ModelC],
]);

const ctx = wrap(new Context('request'));

await ctx.request(ModelA, {}); // calls ModelC
await ctx.request(ModelB, {}); // also calls ModelC
await ctx.request(ModelC, {}); // calls ModelC directly
```

Memoization happens at the **final** model level:

- in the example above `ModelC` will be called only once for the same
  props; all other calls will be served from the `withModels` registry.

### Child contexts

Overrides propagate to child contexts created via `ctx.create`:

```ts
const parent = wrap(new Context('parent'));
const child = parent.create('child');

await parent.request(OriginalModel, {from: 'parent'});
await child.request(OriginalModel, {from: 'child'});
// Both calls go through the same override chain.
```

## API Overview

### `Overrides`

```ts
export type Overrides = Map<Model, Model>;
```

### `withOverrides(overrides: Overrides)`

```ts
function withOverrides(overrides: Overrides) {
  return function <CTX extends WithModels<Context>>(ctx: CTX): CTX { ... }
}
```

- **`overrides`**: map from original model to override model.
- Returns a wrapper that:
  - wraps `ctx.request` to resolve and apply overrides;
  - wraps `ctx.create` so that overrides are preserved in child contexts.

## Testing Notes

Key scenarios for `withOverrides`:

- **Single override**:
  - request to the original model invokes the override model;
  - original model is not called.
- **Chained overrides**:
  - A → B → C: requests for A and B both reach C;
  - memoization happens on C.
- **Empty overrides**:
  - `ctx.request` behavior matches plain `withModels`.
- **Child contexts**:
  - overrides work the same way in parent and child contexts created via `ctx.create`.

See `src/with-overrides/with-overrides.spec.ts` for concrete examples. 

