import type {Json, Key} from '../types';
import type {Cache} from './cache';
import type {CacheProvider} from './types';

import {promisify} from 'util';
import {deflate, inflate} from 'zlib';

const deflateAsync = promisify(deflate);
const inflateAsync = promisify(inflate);

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

/**
 * Compresses a JSON value using zlib deflate and encodes it as base64.
 * This reduces memory usage in cache providers like Redis.
 *
 * @param value - JSON value to compress
 * @returns Compressed and base64-encoded string
 * @internal
 */
export async function compressValue(value: Json): Promise<string> {
  const jsonString = JSON.stringify(value);
  const compressed = await deflateAsync(Buffer.from(jsonString, 'utf-8'));
  return compressed.toString('base64');
}

/**
 * Decompresses a base64-encoded compressed value back to JSON.
 *
 * @param compressed - Base64-encoded compressed string
 * @returns Decompressed JSON value
 * @internal
 */
export async function decompressValue(compressed: string): Promise<Json> {
  const buffer = Buffer.from(compressed, 'base64');
  const decompressed = await inflateAsync(buffer);
  const jsonString = decompressed.toString('utf-8');
  return JSON.parse(jsonString) as Json;
}

/**
 * Stores a value in cache, optionally compressing it if zip is enabled.
 *
 * @internal
 */
export async function setValue(
  cache: Cache,
  key: Key,
  value: Json,
  ttl: number,
  zip: boolean,
): Promise<void> {
  if (zip) {
    const compressed = await compressValue(value);
    // Store compressed value as base64 string
    await cache.set(key, compressed, ttl);
  } else {
    await cache.set(key, value, ttl);
  }
}

/**
 * Retrieves a value from cache, optionally decompressing it if it was compressed.
 *
 * Uses the `zip` flag from strategy configuration to determine if decompression is needed.
 * If `zip: true`, attempts to decompress the value (expects base64-encoded compressed string).
 * If `zip: false`, returns the value as-is.
 *
 * @internal
 */
export async function getValue(cache: Cache, key: Key, zip: boolean): Promise<Json | undefined> {
  const rawValue = await cache.get(key);
  if (rawValue === undefined) {
    return undefined;
  }

  // If zip is enabled, expect compressed value (base64 string) and decompress it
  if (zip) {
    if (typeof rawValue === 'string') {
      try {
        return await decompressValue(rawValue);
      } catch {
        // If decompression fails, it might be old uncompressed data
        // Return as-is for backward compatibility
        return rawValue;
      }
    }
    // If value is not a string, return as-is (old uncompressed data)
    return rawValue;
  }

  // If zip is disabled, return value as-is
  return rawValue;
}
