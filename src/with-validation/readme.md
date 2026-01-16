# withValidation

Validate model props before execution.

## Overview

`withValidation` is a helper that wraps a `WithModels` context and validates model
props **before** the model is executed (and therefore before memoization).

Validation is **declarative**: a model may define a static `schemaProps` property.

## Key concepts

### Schema

`withValidation` uses a minimal built-in schema format (a small subset inspired
by JSON Schema) with support for:

- objects (`type: 'object'`, `required`, `properties`, `additionalProperties`)
- primitives (`string`, `number`, `boolean`, `null`)
- arrays (`type: 'array'`, `items`)
- string formats: `email`, `uuid`, `date-time`

If `ajv` is installed in your application, `withValidation` will prefer Ajv for
`validator: 'json-schema'` and fall back to the built-in validator otherwise.

### Strict vs non-strict

`ctx.request()` always throws `ValidationError` when validation fails. This keeps
model return types stable and predictable.

For warning-only flows, set `strict: false` to emit `validation.failed` events
and continue execution.

### Result validation (optional)

Models may also declare `schemaResult` to validate the returned value. Invalid
results throw `ValidationError` (regardless of `strict`) so that invalid results
are not returned to callers. Note: since `withValidation` wraps `ctx.request()`
on top of `withModels`, the model may still execute and memoize its raw result,
but callers will consistently observe the validation error.

## Installation

```ts
import {withValidation} from '@ojson/models';
```

## Basic usage

```ts
import {Context, compose, withModels, withValidation, type OJson} from '@ojson/models';

interface GetUserProps extends OJson {
  id: string;
}

async function GetUser(props: GetUserProps) {
  return {id: props.id};
}
GetUser.displayName = 'GetUser';
GetUser.schemaProps = {
  type: 'object',
  required: ['id'],
  properties: {
    id: {type: 'string', minLength: 1},
  },
};

GetUser.schemaResult = {
  type: 'object',
  required: ['id'],
  properties: {
    id: {type: 'string', minLength: 1},
  },
};

const wrap = compose([withModels(new Map()), withValidation()]);
const ctx = wrap(new Context('request'));

const user = await ctx.request(GetUser, {id: 'user-123'});
```

## API overview

### `withValidation(config?)`

Wraps a `WithModels` context and intercepts `ctx.request()` to validate props
for models that declare `model.schemaProps`.

### `ctx.validate(value, schema)`

Validates an arbitrary value against a provided schema using the context's configured validator.

- Returns validation issues (empty array means valid)
- Emits `validation.failed` (on the current context) when issues are found
- Throws `ValidationError` when `strict: true`

### Events

- `validation.failed` is emitted when `schemaProps` validation fails.
- `validation.failed` is emitted when `schemaResult` validation fails.

The `validation.failed` event uses the following payload shape:

```ts
{
  stage: 'props' | 'result' | 'manual';
  source: 'request' | 'validate';
  validator: 'json-schema' | 'zod' | 'custom';
  count: number;
  model?: string;
}
```

### `ValidationError`

Thrown in strict mode when validation fails. Contains `error.errors` with a list
of issues.

## Advanced usage

### Custom validator

```ts
const wrap = compose([
  withModels(new Map()),
  withValidation({
    validator(value) {
      const props = value as Record<string, unknown>;
      return props['token'] ? [] : [{path: '$.token', message: 'Missing token', value: props['token']}];
    },
  }),
]);
```

### Zod validator (optional)

`withValidation` supports Zod-style schemas via **duck typing** (no hard dependency).
If `validator: 'zod'`, it expects `model.schemaProps` and/or `model.schemaResult`
to be a Zod schema (or any object exposing `safeParse(value)`).

#### Installation

Install Zod in your application:

```bash
npm install zod
```

#### Configure context

Enable Zod validation for the context:

```ts
import {compose, withModels, withValidation, Context} from '@ojson/models';

const ctx = compose([withModels(new Map()), withValidation({validator: 'zod'})])(
  new Context('request'),
);
```

#### Validate props (`schemaProps`)

```ts
import {z} from 'zod';
import type {OJson} from '@ojson/models';

interface GetUserProps extends OJson {
  id: string;
}

async function GetUser(props: GetUserProps) {
  return {id: props.id};
}
GetUser.displayName = 'GetUser';

// Zod schema for props
GetUser.schemaProps = z.object({
  id: z.string().min(1),
});

await ctx.request(GetUser, {id: 'user-123'});
// await ctx.request(GetUser, {id: ''}); -> throws ValidationError (strict) or emits event (non-strict)
```

#### Derive TypeScript types from Zod schemas

If you prefer a single source of truth, you can derive both props and result
types from Zod schemas and attach the same schemas to the model:

```ts
import type {OJson} from '@ojson/models';
import {z} from 'zod';

const GetUserPropsSchema = z.object({
  id: z.string().min(1),
});
type GetUserProps = z.infer<typeof GetUserPropsSchema> & OJson;

const GetUserResultSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});
type GetUserResult = z.infer<typeof GetUserResultSchema>;

export async function GetUser(props: GetUserProps): Promise<GetUserResult> {
  return {id: props.id, name: 'John'};
}
GetUser.displayName = 'GetUser';
GetUser.schemaProps = GetUserPropsSchema;
GetUser.schemaResult = GetUserResultSchema;
```

#### Validate result (`schemaResult`)

```ts
import {z} from 'zod';

GetUser.schemaResult = z.object({
  id: z.string().min(1),
});
```

If result validation fails, `withValidation` emits `validation.failed`
and (when `strict: true`) throws `ValidationError`.

#### Notes and limitations

- **Validator is per-context**: `withValidation({validator: 'zod'})` means schemas are
  interpreted as Zod-like for all models on that context. If you need a mix of
  JSON-schema subset and Zod in the same app, prefer:
  - separate contexts (different wrap chains), or
  - a custom `validator` function and dispatch based on schema shape.
- **Error mapping**: Zod errors are mapped to `ValidationIssue` with `path` like
  `$.field.subfield` and `message` from Zod. The `value` field is best-effort
  (Zod does not always provide the invalid value per issue).

## See also

- `withModels` (memoization)
- `docs/ADR/0002-ctx-set-pattern.md` (request-dependent props)

