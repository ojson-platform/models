## README template for modules (withModels, withCache, etc.)

This template defines a common structure for module-level READMEs.
Modules can omit sections that are not relevant, but SHOULD keep the
order and naming for consistency.

1. **Title**
   - `# withModels` / `# withCache` / ...

2. **Overview**
   - Short 1–2 paragraph description of what the helper does.
   - High-level positioning (server-side, composition with other helpers).

3. **Key Concepts**
   - Core domain concepts specific to the module.
   - Typical subsections for `withModels`:
     - Models
     - OJson type
     - Memoization
     - Registry
   - Typical subsections for `withCache`:
     - CacheConfig
     - CacheProvider vs Cache
     - Cache strategies
     - Dead-aware caching
     - `disableCache` and `withModels` memoization

4. **Installation**
   - How to import the helper and required types/classes.
   - Short code snippet.

5. **Basic Usage**
   - Step-by-step usage in simple scenarios.
   - For example (for most helpers):
     1. Prepare dependencies (registry, CacheProvider, etc.).
     2. Enhance `Context` with wrapper(s).
     3. Define a basic model / behavior.
     4. Call it through the enhanced context.

6. **Advanced Usage**
   - More complex patterns specific to the module:
     - For `withModels`: models calling other models, generators, nested
       generators, execution control (`kill`, `isAlive`), server
       integration examples (optional).
     - For `withCache`: `Strategy.with({ttl})`, `Cache.update`,
       strategy-specific behavior.

7. **API Overview**
   - High-level summary of the main public entry points:
     - Factory functions (`withModels`, `withCache`, etc.).
     - Key methods on the enhanced context.
     - Important types if needed.
   - Each entry: short description, parameters, return type, small example.

8. **Testing Notes**
   - How this module is usually tested.
   - Recommended test helpers (e.g. `TrackingCacheProvider`).
   - Key scenarios to cover (e.g. Dead-aware behavior, TTL validation).

9. **Best Practices** (optional but recommended)
   - Guidelines and common pitfalls for this module.

10. **See Also**
    - Links to related helpers (withModels, withCache, withDeadline,
      withOverrides, etc.).


