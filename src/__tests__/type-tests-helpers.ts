/**
 * Type testing utilities for verifying type inference in the library.
 * 
 * These utilities use TypeScript's type system to verify that types are inferred
 * correctly. They are compile-time only - no runtime behavior.
 * 
 * @see docs/adr/0005-type-testing-utilities.md
 */

/**
 * Checks if two types are exactly equal (not just assignable).
 * 
 * Uses conditional types with function type inference to compare type structures.
 * This is more precise than simple assignability checks.
 * 
 * @example
 * ```typescript
 * type Test1 = Equal<string, string>; // true
 * type Test2 = Equal<string, number>; // false
 * type Test3 = Equal<{a: string}, {a: string}>; // true
 * ```
 */
export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;

/**
 * Ensures that a value is assignable to type T.
 * 
 * This is a runtime no-op function - it does nothing at runtime.
 * However, TypeScript's type checker will verify that `value` is assignable
 * to type `T` at compile time. If the type doesn't match, TypeScript will
 * emit a compilation error.
 * 
 * @param value - Value to check (type is inferred from usage)
 * 
 * @example
 * ```typescript
 * const result = ctx.request(GetUserModel, {id: '123'});
 * expectType<Promise<User>>(result); // TypeScript verifies the type
 * ```
 */
export function expectType<T>(value: T): void {
  // Runtime no-op - all checks happen at compile time
  // The type parameter T ensures TypeScript verifies assignability
}

/**
 * Ensures that a type is exactly equal to an expected type.
 * 
 * This is a compile-time only type assertion. Use it to verify that
 * a type matches exactly (not just assignable).
 * 
 * Use with `void (null as Expect<Equal<...>>)` to avoid unused variable warnings.
 * 
 * @example
 * ```typescript
 * type UserResult = ModelResult<typeof GetUserModel>;
 * void (null as Expect<Equal<UserResult, User>>); // Compiles only if types match exactly
 * ```
 */
export type Expect<T extends true> = T;

