# ADR 0007: Cache Compression with zlib

## Status

Accepted

## Context

When caching large JSON values in providers like Redis, memory usage can become a significant concern. Large cached values consume substantial memory, especially when the same data is cached multiple times with different keys or when caching large result sets.

We needed a way to reduce memory usage for cached values while maintaining compatibility with existing cache providers and strategies.

## Decision

We add an optional `zip` flag to `CacheConfig` that enables compression of cached values using zlib deflate/inflate with base64 encoding.

- Compression is **opt-in** per strategy via `zip: true` in the configuration.
- When `zip: true`, values are compressed using `zlib.deflate()` and encoded as base64 before storing.
- When reading, if `zip: true` is set in the strategy configuration, values are automatically decompressed.
- The compression decision is based on the **strategy configuration**, not on stored value format, ensuring consistent behavior.

## Rationale

### Why compression?

- **Memory savings**: Large JSON values can be compressed significantly (often 50-90% reduction for structured data).
- **Redis cost reduction**: Lower memory usage directly translates to lower Redis hosting costs.
- **Scalability**: Allows caching larger datasets without hitting memory limits.

### Why opt-in?

- **CPU overhead**: Compression/decompression adds CPU cost, which may not be worth it for small values.
- **Flexibility**: Different models may have different compression benefits (large structured data compresses well, small values may not).
- **Backward compatibility**: Existing code continues to work without changes.

### Why zlib deflate/inflate?

- **Standard library**: Node.js built-in `zlib` module, no additional dependencies.
- **Good compression ratio**: Deflate algorithm provides good compression for JSON data.
- **Base64 encoding**: Required for storing binary compressed data in cache providers that expect string values.

### Why strategy-based, not value-based?

- **Consistency**: Same strategy always behaves the same way, regardless of when values were cached.
- **Simplicity**: No need to detect compression format in stored values.
- **Predictability**: Developers know exactly when compression is used based on configuration.

## Implementation Details

- Compression utilities: `compressValue()` and `decompressValue()` in `src/with-cache/utils.ts`.
- All cache strategies support compression: `CacheOnly`, `CacheFirst`, `StaleWhileRevalidate`.
- `Cache.update()` accepts `{ttl, zip?}` configuration object.
- Compression is transparent to cache providers - they receive base64-encoded strings.

## Usage

```typescript
// Enable compression with custom TTL
MyModel.cacheStrategy = CacheFirst.with({ttl: 1800, zip: true});

// Use compression with default TTL
MyModel.cacheStrategy = CacheFirst.with({zip: true});
```

## Consequences

### Positive

- Significant memory savings for large cached values.
- Lower Redis hosting costs.
- Ability to cache larger datasets.
- Opt-in design maintains backward compatibility.

### Negative

- CPU overhead for compression/decompression (typically negligible for most use cases).
- Slightly more complex codebase (compression utilities and logic).
- Developers need to decide when to enable compression (though defaults work fine).

## Alternatives Considered

1. **Automatic compression based on value size**: Rejected - adds complexity and unpredictability.
2. **Separate compression layer outside cache**: Rejected - would require changes to cache providers.
3. **Different compression algorithms**: Rejected - zlib is sufficient and well-supported.

## References

- Inspired by: https://www.danielauener.com/redis-with-node-js-gzip-mem-usage/
- Implementation: `src/with-cache/utils.ts`, `src/with-cache/cache-strategy.ts`


