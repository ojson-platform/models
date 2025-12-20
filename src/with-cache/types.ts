import type {BaseContext} from '../context';
import type {Key, Model, Json} from '../types';
import type {WithModels} from '../with-models';

/**
 * Interface for low-level cache storage.
 * Implementations handle reading and writing JSON values by key.
 */
export type CacheProvider = {
  displayName?: string;

  /**
   * Returns cached value for the given key or `undefined` if missing/expired.
   *
   * @param key - Cache key to look up
   */
  get(key: Key): Promise<Json | undefined>;

  /**
   * Stores value with a time-to-live (TTL) in seconds.
   *
   * @param key - Cache key
   * @param value - JSON-serializable value to cache
   * @param ttl - Time to live in seconds
   */
  set(key: Key, value: Json, ttl: number): Promise<void>;
};

/**
 * TTL configuration per cache strategy name.
 */
export type CacheConfig<Name extends string = 'default'> = {
  [prop in Name]: {
    /** Time to live (seconds). */
    ttl: number;
  };
};

/**
 * Cache strategy type that defines how models interact with the cache.
 *
 * A cache strategy:
 * - Has a unique `displayName` for identification
 * - Has a `config` object with TTL settings
 * - Can be configured with custom TTL via `with()` method
 * - Resolves to a request handler function that implements the caching logic
 *
 * @example
 * ```typescript
 * // Use default strategy
 * MyModel.cacheStrategy = CacheFirst;
 *
 * // Use strategy with custom TTL
 * MyModel.cacheStrategy = CacheFirst.with({ ttl: 1800 });
 * ```
 */
export type CacheStrategy = {
  /** Unique name for the strategy (e.g., 'cache-first', 'network-only') */
  displayName: string;
  /** Configuration object with TTL settings for this strategy */
  config: CacheConfig;
  /**
   * Creates a new strategy instance with custom TTL configuration.
   *
   * The provided config will be automatically applied to this strategy.
   *
   * @param config - TTL configuration object `{ ttl: number }`
   * @returns New strategy instance with the provided TTL configuration
   *
   * @example
   * ```typescript
   * MyModel.cacheStrategy = CacheFirst.with({ ttl: 1800 }); // 30 minutes
   * ```
   */
  with(config: CacheConfig[keyof CacheConfig]): CacheStrategy;
} & ((config: CacheConfig, cache: any, request: any) => any);

/**
 * Extended model type that supports cache strategies.
 * Models can specify a cache strategy to control how their results are cached.
 *
 * @example
 * ```typescript
 * function MyModel(props: OJson, ctx: BaseContext): OJson {
 *   return { data: 'value' };
 * }
 * MyModel.displayName = 'MyModel';
 * MyModel.cacheStrategy = CacheFirst.with({ ttl: 3600 });
 * ```
 */
export type WithCacheModel = Model & {
  /**
   * Optional cache strategy to use for this model.
   * If not specified, the model will execute without caching.
   */
  cacheStrategy?: CacheStrategy;
};

/**
 * Helper type that adds cache configuration properties to any model.
 *
 * Use this to extend your global `Model` type when using `withCache`:
 *
 * @example
 * ```typescript
 * // globals.d.ts
 * declare global {
 *   import {Model as BaseModel, WithCacheConfig} from '@ojson/models';
 *   type Model = BaseModel & WithCacheConfig;
 * }
 *
 * // some.model.ts
 * export function GetUser(props: {id: string}): Promise<User> {
 *   // ...
 * }
 * GetUser.displayName = 'GetUser';
 * GetUser.cacheStrategy = CacheFirst.with({ ttl: 3600 }); // TypeScript knows this property exists
 * ```
 */
export type WithCacheConfig = {
  /**
   * Optional cache strategy to use for this model.
   * If not specified, the model will execute without caching.
   */
  cacheStrategy?: CacheStrategy;
};

/** BaseContext extended with cache controls and strategy support. */
export type WithCache<T extends WithModels<BaseContext>> = T & {
  /** Globally disables caching for this context and all descendants. */
  disableCache(): void;
  /** Returns `false` if cache is disabled via `disableCache()`. */
  shouldCache(): boolean;
};
