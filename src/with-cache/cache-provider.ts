import type {Key, Json} from '../types';
import type {CacheProvider} from './types';

/**
 * In-memory cache provider implementation.
 * Stores cached values in a Map with expiration deadlines.
 *
 * Automatically cleans up expired entries on a configurable interval.
 * Useful for development, testing, or single-instance deployments.
 *
 * **Note**: Cache is not shared across process instances or server restarts.
 * For distributed systems, use a shared cache provider (e.g., Redis).
 *
 * @example
 * ```typescript
 * const cache = new MemoryCache({ cleanup: 5000 }); // Cleanup every 5 seconds
 *
 * await cache.set('key1', { data: 'value' }, 3600); // TTL: 1 hour
 * const value = await cache.get('key1');
 *
 * cache.release(); // Clear cache and stop cleanup timer
 * ```
 */
export class MemoryCache implements CacheProvider {
  /** Internal storage: maps keys to values with expiration deadlines */
  private memory = new Map<Key, {value: Json; deadline: number}>();

  /** Timer handle for periodic cleanup */
  private timer: NodeJS.Timeout;

  /**
   * Creates a new MemoryCache instance.
   *
   * @param options - Configuration options
   * @param options.cleanup - Interval in milliseconds for automatic cleanup of expired entries (default: 10000)
   */
  constructor({cleanup = 10000}: {cleanup?: number} = {}) {
    this.cleanup(cleanup);
  }

  /**
   * Performs cleanup of expired cache entries and schedules the next cleanup.
   * Removes all entries whose deadline has passed.
   *
   * The cleanup timer is automatically unref'd, so it won't prevent the process from exiting.
   *
   * @param delay - Delay in milliseconds before the next cleanup cycle
   *
   * @internal
   */
  cleanup(delay: number) {
    clearTimeout(this.timer);

    const checkpoint = Date.now();
    for (const [key, {deadline}] of Object.entries(this.memory)) {
      if (deadline <= checkpoint) {
        this.memory.delete(key as Key);
      }
    }

    this.timer = setTimeout(() => this.cleanup(delay), delay);
    this.timer.unref();
  }

  /**
   * Releases all cached data and stops the cleanup timer.
   * Use this method to free memory when the cache is no longer needed.
   *
   * @example
   * ```typescript
   * cache.release(); // Clear all data and stop cleanup
   * ```
   */
  release() {
    clearTimeout(this.timer);
    this.memory = new Map();
  }

  /**
   * Retrieves a cached value by key.
   * Returns `undefined` if the key doesn't exist or the value has expired.
   *
   * @param key - The cache key to look up
   * @returns Promise resolving to the cached value, or `undefined` if not found or expired
   *
   * @example
   * ```typescript
   * const value = await cache.get('my-key');
   * if (value === undefined) {
   *   // Cache miss or expired
   * }
   * ```
   */
  async get(key: Key) {
    const {value, deadline} = this.memory.get(key) || {};
    if (deadline >= Date.now()) {
      return value;
    }

    return undefined;
  }

  /**
   * Stores a value in the cache with a time-to-live (TTL).
   * The value will expire after the specified TTL (in seconds).
   *
   * @param key - The cache key
   * @param value - The value to cache (must be JSON-serializable)
   * @param ttl - Time to live in seconds (converted to milliseconds for deadline calculation)
   * @returns Promise that resolves immediately after storing the value
   *
   * @example
   * ```typescript
   * await cache.set('user:123', { name: 'John' }, 3600); // Cache for 1 hour
   * ```
   */
  async set(key: Key, value: Json, ttl: number) {
    const deadline = Date.now() + ttl * 1000;
    this.memory.set(key, {value, deadline});
  }
}
