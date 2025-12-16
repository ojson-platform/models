import type { Key, Model, OJson, Json, Actor, ModelProps, ModelResult, ModelCtx } from '../types';
import type { Context } from '../context';

import {isGenerator, isPromise, isPlainObject, sign} from '../utils';

const __Registry__ = Symbol('RequestRegistry');

/**
 * Symbol used internally to indicate that execution was interrupted.
 * This should not be returned to users - instead, an InterruptedError is thrown.
 */
export const Dead = Symbol('Dead');

/**
 * Error thrown when a model execution is interrupted (context was killed).
 * 
 * @example
 * ```typescript
 * try {
 *   const result = await ctx.request(SomeModel);
 * } catch (error) {
 *   if (error instanceof InterruptedError) {
 *     console.log('Execution was cancelled');
 *   }
 * }
 * ```
 */
export class InterruptedError extends Error {
  constructor(message = 'Model execution was interrupted') {
    super(message);
    this.name = 'InterruptedError';
  }
}

/**
 * Registry storing memoized model results.
 * Maps cache keys to promises that resolve to model results.
 * Shared across all contexts in the same request lifecycle.
 */
type Registry = Map<Key, Promise<unknown>>;

/**
 * Function type for requesting model execution with automatic memoization.
 * 
 * @template Props - The input parameters type (must be OJson)
 * @template Result - The return type (must be JSON-serializable)
 * 
 * @param model - The model to execute. Must have a static `displayName` property.
 * @param props - Optional input parameters for the model. Defaults to empty object.
 * @returns Promise resolving to the model result
 * @throws {InterruptedError} If execution was interrupted (context was killed)
 * 
 * @example
 * ```typescript
 * try {
 *   const result = await ctx.request(MyModel, {id: 123});
 * } catch (error) {
 *   if (error instanceof InterruptedError) {
 *     // Handle interruption
 *   }
 * }
 * ```
 */
export type Request<Props extends OJson = OJson, Result extends Json = Json> = {
    (model: Model<Props, Result>, props?: Props): Promise<Result>;
};

/**
 * Extended context type that includes model request capabilities.
 * Adds memoization, request lifecycle management, and interrupt handling to a base Context.
 * 
 * @template T - The base context type (must extend Context)
 * 
 * @property {Registry} [__Registry__] - Internal registry for memoized model results
 * @property {function(): boolean} isAlive - Checks if context is still alive (not killed)
 * @property {function(): typeof Dead} kill - Kills the context, interrupting all future requests
 * @property {Request} request - Method to request model execution with memoization
 * @property {function(Promise<Result>): Promise<Result>} resolve - Resolves promises with interrupt checking
 * @property {function(string): WithModels<T>} create - Creates a child context with shared registry
 * 
 * @example
 * ```typescript
 * const registry = new Map();
 * const baseCtx = new Context('request');
 * const ctx = withModels(registry)(baseCtx);
 * 
 * const result = await ctx.request(MyModel, {id: 123});
 * ```
 */
export type WithModels<T extends Context> = T & {
    [__Registry__]: Registry;
    isAlive(): boolean;
    kill(): typeof Dead;
    request<M extends Model<any, any, T>>(
        model: M,
        props?: ModelProps<M>
    ): Promise<ModelResult<M>>;
    resolve<Result extends Json>(value: Promise<Result>): Promise<Result>;
    set<M extends Model<any, any, T>>(
        model: M,
        value: ModelResult<M>,
        props?: ModelProps<M>
    ): void;
    create(...args: Parameters<Context['create']>): WithModels<T>;
};

/**
 * Executes a model with automatic memoization.
 * 
 * Handles three types of model results:
 * - Synchronous objects: returned immediately
 * - Promises: resolved with interrupt checking
 * - Generators: executed step-by-step with nested generator support
 * 
 * Models are memoized by key: `${displayName};${sign(props)}`
 * Subsequent calls with same model and props return cached result.
 * 
 * @template Props - The input parameters type
 * @template Result - The return type
 * 
 * @this {WithModels<Context>} - The context with model capabilities
 * @param model - The model to execute (function or object with action method)
 * @param props - Optional input parameters for the model. Defaults to empty object if not provided.
 * @returns Promise resolving to model result
 * 
 * @throws {TypeError} If model lacks displayName property
 * @throws {TypeError} If model is not a function or object with action method
 * @throws {TypeError} If model returns unexpected result type
 * @throws {InterruptedError} If execution was interrupted (context was killed)
 * 
 * @internal
 */
async function request<M extends Model<any, any, any>>(
    this: WithModels<Context>,
    model: M,
    props?: ModelProps<M>
): Promise<ModelResult<M>> {
    type Props = ModelProps<M>;
    type Result = ModelResult<M>;
    type Ctx = ModelCtx<M>;
    
    if (!model.displayName) {
        throw new TypeError('Model should define static `displayName` property');
    }

    const {displayName} = model;

    props = props ?? ({} as Props);

    const key = `${displayName};${sign(props as OJson)}` as Key;

    if (this[__Registry__].has(key)) {
        const cached = await this[__Registry__].get(key)!;
        if (cached === Dead) {
            throw new InterruptedError(`Model ${displayName} execution was interrupted`);
        }
        return cached as Result;
    }

    const action = typeof model === 'function'
        ? model as Actor<Props, Result, Ctx>
        : typeof model.action === 'function'
            ? model.action as Actor<Props, Result, Ctx>
            : null;

    if (typeof action !== 'function') {
        throw new TypeError('Unexpected model type for ' + displayName);
    }

    const promise = this.call(displayName, async (ctx: WithModels<Context>) => {
        if (!ctx.isAlive()) {
            return Dead;
        }

        let call = action(props as Props, ctx as Ctx);
        let value = undefined, error = undefined, done = false;

        if (isPromise<Result>(call)) {
            value = await ctx.resolve(call);
        } else if (isPlainObject(call) || Array.isArray(call) || call === null || (typeof call !== 'object' && call !== undefined)) {
            // Handle objects, arrays, primitives (null, number, string, boolean)
            // Note: undefined is not a valid JSON value, so it's excluded
            // All of these are valid Json values
            value = call;
        } else if (isGenerator<Result>(call)) {
            const states = [];
            while (!done) {
                if (!ctx.isAlive()) {
                    return Dead;
                }

                ({value, done} = error
                        ? (call as Generator<Result>).throw(error)
                        : (call as Generator<Result>).next(value)
                );

                if (done && states.length) {
                    [call, done] = [states.pop(), false];
                }

                if (isGenerator<Result>(value)) {
                    !done && states.push(call);
                    [call, value, done] = [value, undefined, false];
                } else if (isPromise<Result>(value)) {
                    try {
                        value = await ctx.resolve(value);
                    } catch (e) {
                        error = e;
                    }
                }
            }
        } else {
            throw new TypeError('Unexpected model result');
        }

        return value;
    }).then((result) => {
        if (result === Dead) {
            throw new InterruptedError(`Model ${displayName} execution was interrupted`);
        }
        return result as Result;
    });

    this[__Registry__].set(key, promise);
    promise.catch(() => this[__Registry__].delete(key));

    return promise;
}

/**
 * Wraps the context's create method to ensure child contexts also have model capabilities.
 * 
 * @template CTX - The context type
 * @param create - The original create method from context
 * @returns Wrapped create function that returns enhanced context
 * 
 * @internal
 */
const wrapCreate = <CTX extends Context>(create: CTX['create']) =>
    function (this: WithModels<CTX>, name: string) {
        const child = create.call(this, name);
        // Share registry with child
        return wrapContext(child, this[__Registry__]);
    };

/**
 * Wraps a context with model request capabilities.
 * 
 * Adds:
 * - Shared registry for memoization across context hierarchy
 * - `request()` method for calling models
 * - `kill()` and `isAlive()` for execution control
 * - `resolve()` for promise resolution with interrupt checking
 * - Enhanced `create()` that preserves model capabilities in children
 * 
 * The registry is shared across all contexts in the same request lifecycle,
 * enabling memoization to work across nested contexts.
 * 
 * @template CTX - The context type
 * @param ctx - The base context to enhance
 * @param registry - Optional shared registry (creates new one if not provided)
 * @returns Enhanced context with model capabilities
 * 
 * @internal
 */
/**
 * Sets a pre-computed value for a model.
 * 
 * Uses the same registry as `request()` for consistency. Builds cache keys
 * using displayName and serialized props (same as `request()`). Throws an error
 * if a value already exists in the registry for the given model+props.
 * 
 * @this {WithModels<Context>} - The context with model capabilities
 * @param model - The model to set a value for
 * @param value - The pre-computed value for the model
 * @param props - Optional props for the model (defaults to empty object)
 * @throws {TypeError} If model lacks displayName property
 * @throws {Error} If value already exists in registry for the given model+props
 * 
 * @internal
 */
function set<M extends Model<any, any, any>>(
    this: WithModels<Context>,
    model: M,
    value: ModelResult<M>,
    props?: ModelProps<M>
): void {
    if (!model.displayName) {
        throw new TypeError('Model should define static `displayName` property');
    }

    const {displayName} = model;
    const modelProps = (props ?? {}) as OJson;
    const key = `${displayName};${sign(modelProps)}` as Key;

    if (this[__Registry__].has(key)) {
        throw new Error(
            `Cannot set value for model "${displayName}" with props "${sign(modelProps)}": ` +
            `value already exists in registry. Use ctx.request() to retrieve it.`
        );
    }

    // Store in registry as resolved promise (same format as request())
    this[__Registry__].set(key, Promise.resolve(value));
}

const wrapContext = <CTX extends Context>(ctx: CTX, registry?: Registry) => {
    let state = null;

    const parent = (ctx.parent || {
        [__Registry__]: registry || new Map(),
        isAlive: () => state !== Dead,
        kill: () => state = Dead,
        request: request,
        resolve: async <Result extends Json>(value: Promise<Result>) => {
            return await value;
        },
        set: set,
    }) as WithModels<CTX>;

    Object.assign(ctx, {
        [__Registry__]: parent[__Registry__],
        isAlive: parent.isAlive,
        kill: parent.kill,
        request: parent.request,
        resolve: parent.resolve,
        set: parent.set,
        create: wrapCreate(ctx.create),
    });

    return ctx as WithModels<CTX>;
};

/**
 * Factory function that enhances a Context with model request capabilities.
 * 
 * Returns a wrapper function that adds:
 * - Automatic memoization of model results
 * - Support for synchronous, async, and generator-based models
 * - Request lifecycle management through context hierarchy
 * - Execution interruption via `kill()` method
 * 
 * The registry parameter should be shared across all contexts in the same request
 * lifecycle to enable memoization across nested contexts.
 * 
 * @param registry - Shared registry for memoized model results. Should be created once per request.
 * @returns Function that wraps a context with model capabilities
 * 
 * @example
 * ```typescript
 * // Create registry once per request
 * const registry = new Map();
 * 
 * // Wrap context with model capabilities
 * const wrap = withModels(registry);
 * const baseCtx = new Context('http-request');
 * const ctx = wrap(baseCtx);
 * 
 * // Use models
 * const result = await ctx.request(MyModel, {id: 123});
 * ```
 * 
 * @example
 * ```typescript
 * // With multiple helpers using compose
 * import {compose} from './utils';
 * 
 * const wrap = compose([
 *   withModels(registry),
 *   withCache(config, cache),
 *   withDeadline(5000)
 * ]);
 * 
 * const ctx = wrap(new Context('request'));
 * ```
 */
export function withModels(registry: Registry) {
    return function<CTX extends Context>(ctx: CTX) {
        return wrapContext(ctx, registry);
    };
}