# ADR 0005: Custom Type Testing Utilities

## Status

Accepted

## Context

During the "Context abstraction" refactoring, we encountered issues with type inference in `compose` and helper wrappers. We needed a way to verify that type inference works correctly and doesn't regress in future changes.

Initially, we considered using external libraries:
- `ts-expect` - Simple API but last updated 2 years ago
- `type-plus` - More actively maintained but heavier dependency

## Decision

We will implement **custom type testing utilities** instead of relying on external dependencies, and integrate them into the main Vitest test suite.

### Rationale

1. **Minimal dependencies**: We want to keep the library lightweight and avoid external dependencies for type testing
2. **Full control**: Custom utilities give us complete control over the API and behavior
3. **TypeScript-native**: The utilities use only TypeScript's type system, ensuring compatibility with future TypeScript versions
4. **Simple API**: We maintain the `expectType<T>(value)` API that developers expect, while implementing it with pure TypeScript types

### Implementation

We create a minimal set of type utilities in `src/type-tests-helpers.ts`:

- `Equal<A, B>` - Checks if two types are exactly equal
- `expectType<T>(value)` - Runtime no-op function that ensures `value` is assignable to type `T`

The `expectType` function is a runtime no-op (does nothing), but TypeScript's type checker verifies the type constraint at compile time. If the type doesn't match, TypeScript will emit a compilation error.

### Type Utilities

```typescript
/**
 * Checks if two types are exactly equal (not just assignable).
 * Uses conditional types to compare type structures.
 */
export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;

/**
 * Ensures that a value is assignable to type T.
 * This is a runtime no-op, but TypeScript will error if the type doesn't match.
 * 
 * @param value - Value to check (type is inferred from usage)
 */
export function expectType<T>(value: T): void {
  // Runtime no-op - all checks happen at compile time
}
```

### Usage

```typescript
import {expectType} from './type-tests-helpers';

const result = ctx.request(GetUserModel, {id: '123'});
expectType<Promise<User>>(result); // TypeScript verifies the type
```

### Testing

Type tests are integrated into the main test suite via Vitest. The file `src/type-tests.spec.ts` contains type tests organized in `describe`/`it` blocks, just like regular tests.

When Vitest runs, it automatically:
1. Compiles TypeScript files (including type tests)
2. TypeScript compiler verifies all `expectType<T>(value)` calls
3. If types don't match, compilation fails and tests don't run

This ensures that:
- All type tests compile successfully
- Type inference works as expected
- Future changes don't break type inference
- Type tests run alongside regular tests in a unified test suite

**Note**: The `test:types` script is kept as an optional way to check types independently, but it's not required since Vitest handles type checking automatically.

**Running type tests**:
- All tests (including type tests): `npm test`
- Only type tests: `npm test -- type-tests`
- Type check only (without running tests): `npm run test:types`

## Consequences

### Positive

- ✅ No external dependencies for type testing
- ✅ Full control over the API
- ✅ Simple, familiar API (`expectType<T>(value)`)
- ✅ TypeScript-native implementation
- ✅ Easy to extend with additional utilities if needed

### Negative

- ⚠️ We maintain our own type utilities (but they're minimal and well-tested)
- ⚠️ Slightly more code than using an external library (but negligible)

## Alternatives Considered

1. **`ts-expect`**: Simple but unmaintained
2. **`type-plus`**: More features but heavier dependency
3. **`tsd`**: Focused on `.d.ts` testing, different use case
4. **Direct type assertions**: Less readable, harder to maintain

## References

- [Type Tests Plan](../type-tests-plan.md)
- [TypeScript Conditional Types](https://www.typescriptlang.org/docs/handbook/2/conditional-types.html)

