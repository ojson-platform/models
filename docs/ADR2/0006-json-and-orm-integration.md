# 0006 – JSON constraints, class instances, and ORM integration

## Status

Accepted

## Context

The core contract of `@ojson/models` is:

- **Props** of a model are `OJson` – a JSON-compatible object at the top level:
  - top-level is always an object;
  - values are `Json | undefined` (objects, arrays, primitives, or `undefined` for optional props).
- **Result** of a model is `Json` – any JSON-serializable value.

This contract is important for:

- deterministic memoization keys (`sign(props)`),
- safe caching (`withCache`),
- telemetry export (`withTelemetry`),
- and the ability to reason about models as pure functions over JSON data.

At the same time, many real-world applications use ORMs and rich domain models:

```ts
class TodoEntity {
  id: string;
  title: string;
  completed: boolean;

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      completed: this.completed,
    };
  }
}

function GetTodo(props: {id: string}) {
  return orm.todos.get(props.id); // TodoEntity instance
}
GetTodo.displayName = 'GetTodo';
```

If a model returns a raw `TodoEntity` instance, this is **not** strictly `Json`:

- it may contain non-serializable state (ORM session, lazy loaders, methods);
- it may have circular references;
- there is no obvious, deterministic way for the library to serialize it.

The same issue applies to props – passing whole ORM entities instead of DTOs breaks
the `OJson` contract and makes memoization/caching unpredictable.

We need a consistent story for:

- how strictly we enforce JSON constraints;
- how we expect users to integrate with ORMs and class-based domain models;
- what the library does **not** do for them at runtime.

## Decision

1. **TypeScript is the primary guard for JSON constraints**

   - We keep `Json` and `OJson` as the source of truth for model contracts.
   - We provide helper utilities (`isJson`, `isOJson`, `cleanUndefined`) mainly for
     internal use and tests.
   - We do **not** introduce global runtime validation of model props/results
     against `Json`/`OJson`. Violations are treated as a user responsibility.

2. **Models should work with DTOs, not live ORM entities**

   - **Props**: should always be `OJson` DTOs (IDs, plain filters, flags), not ORM objects.
     - Good:
       ```ts
       interface GetTodoProps extends OJson {
         id: string;
       }
       function GetTodo(props: GetTodoProps): Promise<TodoDto> { ... }
       ```
     - Avoid:
       ```ts
       function GetTodo(props: {entity: TodoEntity}) { ... } // props is not OJson
       ```

   - **Result**: models should return plain JSON (DTOs), not ORM entities:
     - recommended patterns:
       - explicit mapping function (`toTodoDto(entity)`),
       - or entity-level `toJSON()` that returns a DTO.

3. **No automatic `toJSON` calls inside the library**

   - We **do not** implicitly call `toJSON` on:
     - model props,
     - model results,
     - or arbitrary objects passed through the context.
   - If users want to use `toJSON`, they should call it themselves in their models:
     ```ts
     function GetTodo(props: {id: string}): TodoDto {
       const entity = orm.todos.get(props.id);
       return entity.toJSON(); // explicit JSON boundary
     }
     ```
   - This keeps the boundary between ORM and JSON explicit and predictable.

4. **Helper semantics: `cleanUndefined`, `isJson`, `isOJson`**

   - `cleanUndefined(value: Json): Json`:
     - removes `undefined` values recursively;
     - preserves objects (including empty ones), arrays, and primitives as-is;
     - is intended to normalize data for memoization and cache keys, not to coerce
       arbitrary values into JSON.

   - `isJson(value)` / `isOJson(value)`:
     - are available as utilities (and used in tests),
     - are conservative:
       - check for primitives, arrays, plain objects,
       - reject circular references,
       - do **not** attempt to auto-flatten arbitrary class instances.
     - may be used by helpers (e.g. cache or telemetry) in targeted places, but
       not as a global runtime gate for all models.

5. **Library does not forbid class instances per se**

   - At the type level, models that return richer types (e.g. `TodoEntity`) are allowed,
     as long as the user is aware that:
     - such values are not memoization-safe or cache-friendly by default;
     - they should not be passed as props to other models;
     - if they are ever serialized (e.g. via telemetry or custom code), the user must
       provide a DTO mapping (`toJSON`, mappers, etc.).

## Consequences

### Positive

- **Clear JSON boundary**: Props are always DTOs, results are expected to be JSON by convention.
- **Predictable memoization and caching**: `sign` and `cleanUndefined` operate on well-defined JSON shapes.
- **No hidden magic**: the library does not silently call `toJSON` or try to serialize arbitrary class instances.
- **Good ORM story**: users can place the JSON boundary at the model layer using DTOs or explicit `toJSON` calls.

### Negative

- **More work for ORM-heavy codebases**: models need to introduce DTOs or explicit `toJSON`
  calls instead of returning raw entities.
- **No hard runtime guarantees**: if a model returns non-JSON data and that data never touches
  cache/telemetry, TypeScript is the only guard. Misuse can slip through if types are loosened.

### Rejected alternatives

1. **Automatic `toJSON` on any object with that method**

   - Pros:
     - integrates nicely with `Date` and many ORMs out of the box,
     - can make some code "just work" without explicit mapping.
   - Cons:
     - introduces hidden behavior (models may return different shapes than they think),
     - order of serialization and side effects in `toJSON` becomes observable,
     - harder to reason about cache keys and telemetry payloads.
   - Decision: rejected to keep the JSON boundary explicit and predictable.

2. **Global runtime validation of all model props/results**

   - Pros:
     - strong guarantees that all models respect `Json`/`OJson` contracts,
     - early detection of misuse in development.
   - Cons:
     - significant runtime overhead,
     - noisy in existing codebases with partial JSON discipline,
     - not always desirable in production (especially for hot paths).
   - Decision: rejected. We keep validation as an opt-in via helpers and tests, and rely
     on TypeScript as the primary guard.


