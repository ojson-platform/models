import type { Model, OJson } from '../types';
import type { Context } from '../context';

import {URLSearchParams} from 'url';

/**
 * A wrapper function that transforms a context type.
 * Accepts any context type (including extended contexts) and returns a context type.
 * Uses structural typing to allow wrappers with compatible signatures.
 */
type WrapperFunc = (ctx: any) => any;

/**
 * Extracts the argument type of a wrapper function.
 */
type WrapperInput<W> = W extends (ctx: infer Input) => any ? Input : never;

/**
 * Extracts the return type of a wrapper function.
 */
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
 * - First wrapper: Context -> R1
 * - Second wrapper: R1 -> R2 (if R1 is compatible)
 * - Third wrapper: R2 -> R3 (if R2 is compatible)
 * - Result: final output type
 */
type ComposeResult<
    W extends readonly WrapperFunc[],
    Acc extends Context = Context
> = W extends readonly [infer First, ...infer Rest]
    ? First extends WrapperFunc
        ? WrapperInput<First> extends Acc
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
 *   withModels(registry),           // Context -> WithModels<Context>
 *   withCache(config, cache, createBackgroundCtx), // WithModels<Context> -> WithCache<WithModels<Context>>
 *   withDeadline(5000)              // WithModels<Context> -> WithModels<Context>
 * ]);
 * 
 * const ctx = wrap(new Context('request'));
 * // ctx type is inferred from the composition chain
 * ```
 */
export function compose<W extends readonly [WrapperFunc, ...Array<WrapperFunc>]>(
    wrappers: W
): <CTX extends Context>(ctx: CTX) => ComposeResult<W, CTX> {
    return function<CTX extends Context>(ctx: CTX): ComposeResult<W, CTX> {
        let currentCtx: Context = ctx;
        
        for (const wrapper of wrappers) {
            currentCtx = wrapper(currentCtx);
        }

        return currentCtx as ComposeResult<W, CTX>;
    };
}

export function wait<T = unknown>(delay: number, value?: T): [Promise<T>, Function] {
    let timer;
    const promise = new Promise<T>((resolve) => {
        timer = setTimeout(resolve, delay, value);
        timer.unref();
    });

    return [promise, () => clearTimeout(timer)];
}

export function sign(props: OJson, set?: Set<unknown>) {
    const acc = new URLSearchParams();

    set = set || new Set();

    Object.keys(props)
        .sort()
        .forEach((key) => {
            const value = props[key];

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

export const isModelUncacheable = (model) => model.length > 2;

export const displayName = (model: Model) => model.displayName;

export const isGenerator = <Result>(target: any): target is Generator<Result> => String(target) === '[object Generator]';

export const isPromise = <Result>(target: any): target is Promise<Result> => String(target) === '[object Promise]';

export const isPlainObject = <Result>(target: any): target is Result => String(target) === '[object Object]';