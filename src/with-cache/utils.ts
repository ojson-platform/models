import type {CacheProvider} from './types';

/**
 * Helper function to check if a value is empty (undefined).
 * Used to determine cache misses.
 *
 * @internal
 */
export const isEmptyValue = (target: unknown): target is undefined => target === undefined;

/**
 * Gets the name of a cache provider for logging purposes.
 * Attempts to get constructor name, falls back to 'unknown'.
 *
 * @internal
 */
export const getProviderName = (provider: CacheProvider): string => {
  if (provider && typeof provider === 'object' && provider.displayName) {
    return provider.displayName;
  }

  return 'unknown';
};
