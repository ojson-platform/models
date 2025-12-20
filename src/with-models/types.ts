import type {BaseContext} from '../context';
import type {Key, Model, OJson, Json, ModelProps, ModelResult} from '../types';

/**
 * Internal symbol for registry storage.
 *
 * @internal
 */
export const __Registry__ = Symbol('RequestRegistry');

/**
 * Registry storing memoized model results.
 * Maps cache keys to promises that resolve to model results.
 * Shared across all contexts in the same request lifecycle.
 */
export interface Registry {
  /**
   * Checks if a key exists in the registry.
   *
   * @param key - Cache key to check
   * @returns True if key exists, false otherwise
   */
  has(key: Key): boolean;

  /**
   * Retrieves a value from the registry by key.
   *
   * @param key - Cache key to look up
   * @returns Promise for the cached value, or undefined if not found
   */
  get(key: Key): Promise<unknown> | undefined;

  /**
   * Stores a value in the registry.
   *
   * @param key - Cache key
   * @param value - Promise resolving to the model result
   */
  set(key: Key, value: Promise<unknown>): void;

  /**
   * Removes a key from the registry.
   * Used for cleanup when promises are rejected.
   *
   * @param key - Cache key to remove
   */
  delete(key: Key): boolean;
}

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
 * Adds memoization, request lifecycle management, and interrupt handling to a base context.
 *
 * @template T - The base context type (must extend BaseContext)
 *
 * @property {Registry} [__Registry__] - Internal registry for memoized model results
 * @property {function(): boolean} isAlive - Checks if context is still alive (not killed)
 * @property {function(): symbol} kill - Kills the context, interrupting all future requests
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
export type WithModels<T extends BaseContext> = {
  [__Registry__]: Registry;
  isAlive(): boolean;
  kill(): symbol;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is required for generic Model type parameters
  request<M extends Model<any, any, T>>(model: M, props?: ModelProps<M>): Promise<ModelResult<M>>;
  resolve<Result extends Json>(value: Promise<Result>): Promise<Result>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is required for generic Model type parameters
  set<M extends Model<any, any, T>>(model: M, value: ModelResult<M>, props?: ModelProps<M>): void;
  event(name: string, attributes?: Record<string, unknown>): void;
  create(...args: Parameters<T['create']>): WithModels<T>;
} & T;
