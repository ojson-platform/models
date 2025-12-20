import type {BaseContext} from '../context';
import type {Json, Model, OJson} from '../types';

import {URLSearchParams} from 'node:url';

/**
 * A wrapper function that transforms a context type.
 * Accepts any context type (including extended contexts) and returns a context type.
 * Uses structural typing to allow wrappers with compatible signatures.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is required for generic wrapper function type
type WrapperFunc = (ctx: any) => any;

/**
 * Extracts the argument type of a wrapper function.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is required for type extraction
type WrapperInput<W> = W extends (ctx: infer Input) => any ? Input : never;

/**
 * Extracts the return type of a wrapper function.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is required for type extraction
type WrapperOutput<W> = W extends (...args: any[]) => infer Output ? Output : never;

/**
 * Recursively computes the result type of chained wrapper composition.
 * Processes wrappers from left to right, building the type chain.
 * Each wrapper receives the output type of the previous wrapper.
 *
 * Based on the approach from:
 * https://stackoverflow.com/questions/53173203/typescript-recursive-function-composition
 *
 * This builds a chain where:
 * - First wrapper: BaseContext -> R1
 * - Second wrapper: R1 -> R2 (if R1 is compatible)
 * - Third wrapper: R2 -> R3 (if R2 is compatible)
 * - Result: final output type
 */
type ComposeResult<
  W extends readonly WrapperFunc[],
  Acc extends BaseContext = BaseContext,
> = W extends readonly [infer First, ...infer Rest]
  ? First extends WrapperFunc
    ? Acc extends WrapperInput<First>
      ? Rest extends readonly WrapperFunc[]
        ? ComposeResult<Rest, WrapperOutput<First>>
        : WrapperOutput<First>
      : Acc
    : Acc
  : Acc;

/**
 * Composes multiple context wrappers into a single wrapper function.
 * Each wrapper in the chain receives the enhanced context from the previous wrapper.
 *
 * TypeScript will infer the final context type based on the composition chain.
 * The type system ensures that each wrapper's input is compatible with the
 * previous wrapper's output through structural typing.
 *
 * Based on the approach from:
 * https://stackoverflow.com/questions/53173203/typescript-recursive-function-composition
 *
 * @template W - Array of wrapper functions to compose
 * @param wrappers - Array of wrapper functions in order of application
 * @returns Composed wrapper function that applies all wrappers in sequence
 *
 * @example
 * ```typescript
 * const wrap = compose([
 *   withModels(registry),           // BaseContext -> WithModels<BaseContext>
 *   withCache(config, cache, createBackgroundCtx), // WithModels<BaseContext> -> WithCache<WithModels<BaseContext>>
 *   withDeadline(5000)              // WithModels<BaseContext> -> WithModels<BaseContext>
 * ]);
 *
 * const ctx = wrap(new BaseContext('request'));
 * // ctx type is inferred from the composition chain
 * ```
 */
export function compose<W extends readonly [WrapperFunc, ...Array<WrapperFunc>]>(
  wrappers: W,
): <CTX extends BaseContext>(ctx: CTX) => ComposeResult<W, CTX> {
  return function <CTX extends BaseContext>(ctx: CTX): ComposeResult<W, CTX> {
    let currentCtx: BaseContext = ctx;

    for (const wrapper of wrappers) {
      currentCtx = wrapper(currentCtx);
    }

    return currentCtx as ComposeResult<W, CTX>;
  };
}

export function wait<T = unknown>(delay: number, value?: T): [Promise<T>, Function] {
  let timer;
  const promise = new Promise<T>(resolve => {
    timer = setTimeout(resolve, delay, value);
    timer.unref();
  });

  return [promise, () => clearTimeout(timer)];
}

/**
 * Checks if a value is a primitive JSON value: null, string, number, or boolean.
 *
 * @param value - Value to check
 * @returns True if value is a primitive JSON value
 */
export function isPrimitive(value: unknown): value is null | number | string | boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/**
 * Checks if a value is JSON-serializable according to the library Json type.
 * Detects circular references and ensures nested structures are valid Json.
 *
 * @param value - Value to check
 * @param seen - Internal set to detect circular references
 */
export function isJson(value: unknown, seen: Set<unknown> = new Set()): value is Json {
  if (isPrimitive(value)) {
    return true;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return value.every(item => isJson(item, seen));
  }

  if (isPlainObject<Record<string, unknown>>(value)) {
    return isOJson(value, seen);
  }

  return false;
}

/**
 * Checks if a value is a valid OJson object:
 * - plain object (no arrays, no null, no custom prototypes)
 * - values are Json or undefined
 * - no circular references
 *
 * @param value - Value to check
 * @param seen - Internal set to detect circular references
 */
export function isOJson(value: unknown, seen: Set<unknown> = new Set()): value is OJson {
  if (!isPlainObject<Record<string, unknown>>(value)) {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  // value is already narrowed to Record<string, unknown> by isPlainObject check above
  for (const v of Object.values(value)) {
    if (v === undefined) {
      continue;
    }
    if (!isJson(v, seen)) {
      return false;
    }
  }

  return true;
}

/**
 * Removes undefined values from a Json value recursively.
 * Returns a new Json value with all undefineds removed.
 *
 * @template T - The input type (must extend Json)
 * @param value - Json value to clean
 * @returns Cleaned Json value without undefineds (same type as input)
 */
export function cleanUndefined<T extends Json>(value: T): T {
  // Primitives and null are returned as-is
  if (isPrimitive(value)) {
    return value;
  }

  // Arrays – clean each item
  if (Array.isArray(value)) {
    // T extends Json, so array items are already Json
    return value.map(item => cleanUndefined(item)) as T;
  }

  // Objects (OJson) – remove undefined properties recursively
  if (!isPlainObject<Record<string, unknown>>(value)) {
    // Should not happen for Json, but return as-is defensively
    return value;
  }

  const cleaned: Record<string, unknown> = {};
  const record = value as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    const v = record[key];

    if (v === undefined) {
      continue;
    }

    cleaned[key] = cleanUndefined(v as Json);
  }

  return cleaned as T;
}

export function sign(props: OJson, set?: Set<unknown>) {
  const acc = new URLSearchParams();

  set = set || new Set();

  Object.keys(props)
    .sort((a, b) => a.localeCompare(b))
    .forEach(key => {
      const value = props[key];

      // Skip undefined values to ensure consistent signatures for optional properties
      // Objects with missing optional properties should have the same signature
      // as objects with optional properties set to undefined
      if (value === undefined) {
        return;
      }

      if (value && typeof value === 'object') {
        if (set.has(value)) {
          // skip circular
          return;
        }

        set.add(value);
        acc.append(key, sign(value as OJson, set));
      } else {
        acc.append(key, String(props[key]));
      }
    });

  return acc.toString();
}

export const displayName = (model: Model) => model.displayName;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is required for type guard to accept any value
export const isGenerator = <Result>(target: any): target is Generator<Result> =>
  String(target) === '[object Generator]';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is required for type guard to accept any value
export const isPromise = <Result>(target: any): target is Promise<Result> =>
  String(target) === '[object Promise]';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is required for type guard to accept any value
export const isPlainObject = <Result>(target: any): target is Result =>
  String(target) === '[object Object]';

/**
 * Checks if an object has a property with an optional type check.
 *
 * @param obj - Object to check
 * @param prop - Property name (string or symbol)
 * @param type - Optional type to check (e.g., 'function', 'number', 'string')
 * @returns True if object has the property and (if type specified) it matches the type
 *
 * @example
 * ```typescript
 * has(ctx, 'disableCache', 'function') // checks if ctx has disableCache method
 * has(ctx, 'endTime', 'number') // checks if ctx has endTime number property
 * has(ctx, __Span__) // checks if ctx has __Span__ property (any type)
 * ```
 */
/* eslint-disable no-redeclare -- TypeScript function overloads */
export function has(obj: unknown, prop: string | symbol): boolean;
export function has<T extends string>(
  obj: unknown,
  prop: string | symbol,
  type: T,
): obj is Record<string | symbol, unknown> & {
  [K in typeof prop]: T extends 'function'
    ? Function
    : T extends 'number'
      ? number
      : T extends 'string'
        ? string
        : T extends 'object'
          ? object
          : unknown;
};
export function has(obj: unknown, prop: string | symbol, type?: string): boolean {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return false;
  }
  if (!(prop in obj)) {
    return false;
  }
  if (type === undefined) {
    return true;
  }
  const value = (obj as Record<string | symbol, unknown>)[prop];
  return typeof value === type;
}
/* eslint-enable no-redeclare */
