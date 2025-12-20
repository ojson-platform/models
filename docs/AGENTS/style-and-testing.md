# Agent Guide – Style, Testing, and Documentation

## Code Style

- TypeScript strict mode.
- ES2020 target, ES modules.
- Use functional patterns where possible.
- Models are pure functions (deterministic).
- Prefer composition over inheritance.
- **All comments must be in English** (including test comments and inline documentation).
- **All commit messages must be in English** (including commit titles and descriptions).

### Commit Message Format

This project uses [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <subject>

<body>
```

**Type** (required): One of the following:

- `feat`: New feature for end users (e.g., new helper function, new API method, new model capability)
- `fix`: Bug fix for end users (e.g., fixing incorrect memoization, fixing error handling)
- `perf`: Performance improvement (e.g., optimizing cache lookup, reducing memory usage)
- `refactor`: Code refactoring that doesn't change functionality (e.g., extracting helper functions, reorganizing code)
- `docs`: Documentation changes only (e.g., updating README, adding JSDoc comments, updating AGENTS)
- `chore`: Maintenance tasks and infrastructure changes (e.g., updating dependencies, configuring ESLint, setting up CI/CD, updating build scripts)
- `revert`: Reverting a previous commit

**Key distinction**: `feat` is for **user-facing functionality**, while `chore` is for **development infrastructure**:

- ✅ `feat(cache): add CacheFirst strategy` – new caching feature for users
- ✅ `chore(lint): add module import restrictions` – ESLint configuration change
- ❌ `feat(lint): add module import restrictions` – incorrect (this is infrastructure, not user feature)

**Scope** (optional): The area of the codebase affected (e.g., `cache`, `models`, `telemetry`, `lint`).

**Subject** (required): Brief description in imperative mood (e.g., "add", "fix", "update", not "added", "fixed", "updated").

**Body** (optional): Detailed explanation of what and why, separated from subject by blank line.

### Import Organization

Imports must be organized in a specific order:

1. **Type imports first** (all `import type` statements):
   - External type imports (from `node_modules` or absolute paths).
   - Parent module type imports (from `../module`).
   - Local type imports (from `./module`).

2. **Empty line separator**

3. **Runtime imports** (regular `import` statements):
   - External module imports (from `node_modules` or absolute paths).
   - **Empty line separator**
   - Parent module imports (from `../module`).
   - **Empty line separator**
   - Local module imports (from `./module`).

**Example:**

```typescript
import type {Test1} from 'external-package';
import type {Test2} from '../parent-module';
import type {Test3} from './local-module';

import {externalFunction} from 'external-package';

import {parentFunction} from '../parent-module';

import {localFunction} from './local-module';
```

**Important**: Do not use mixed import syntax like `import {value, type Type}`. Always separate type imports and runtime imports:

- ✅ `import type {Type} from './module';` followed by `import {value}from './module';`
- ❌ `import {value, type Type} from './module';`

Within each group (types or runtime), imports are sorted by source location: external → parent → local.

**Module boundaries**: When importing from other modules in `src/with-*/`, always import from the module root (e.g., `'../with-models'`) rather than internal files (e.g., `'../with-models/types'`). This is enforced by ESLint rule `no-restricted-imports`.

## Testing Instructions

- Test files use `.spec.ts` extension (excluded from build).
- Run tests: `npm test`.
- Run specific test: `npm test -- -t "test name"`.
- Tests use Vitest framework.

Focus areas:

- model memoization behavior;
- generator handling;
- cache strategies;
- context lifecycle;
- error handling.

Key test patterns:

- verify memoization by checking call counts;
- test generator interruption with `kill()`;
- verify cache sharing between contexts;
- test nested generator resolution;
- test models as objects with `action` method;
- test models calling other models (composition);
- test error handling in generators and promises;
- test registry cleanup on promise rejection;
- test memoization across different contexts with shared registry.

## Development Workflow

1. Make changes to source files in `src/`.
2. Run `npm test` to verify tests pass.
3. Run `npm run build` to check compilation.
4. TypeScript config excludes `.spec.ts` files from build.
5. Tests should verify memoization behavior and edge cases.

## Documentation & JSDoc Style

- **User documentation**: Detailed, user-facing guides live in module READMEs:
  - `src/with-models/readme.md`
  - `src/with-cache/readme.md`
- **README structure**: Module READMEs should follow the common template described in `docs/readme-template.md`
  (sections: Overview, Key Concepts, Installation, Basic Usage, Advanced Usage, API Overview, Testing Notes, Best Practices, See Also).
- This agent guide is intentionally focused on agent-facing notes and implementation details, not full user guides.

### JSDoc style

- For complex context extension types (e.g. `WithModels`, `WithCache`), use a single JSDoc block with `@property` entries that describe the whole shape.
- For interfaces and classes like `CacheProvider`, `CacheConfig`, `Cache`, prefer a brief type-level JSDoc and short per-property/method comments, without duplicating the same information in `@property` lists.

**Documentation depth**:

- **Public APIs**:
  - Include parameter descriptions (`@param`), return value descriptions (`@returns`), and brief usage examples when helpful.
  - Keep general descriptions concise but ensure all parameters are documented.
- **Internal APIs**:
  - Use brief one-line descriptions.
  - Avoid redundant parameter documentation if types are self-explanatory.
- **Balance**:
  - Remove verbose examples and lengthy explanations, but always document public method parameters for clarity.

Additional notes:

- All public APIs are documented with JSDoc comments.
- Type definitions provide full TypeScript support with strict typing for models, props, and results.

### Utility Functions

**Property checking**: Use the `has()` utility from `src/utils` for checking object properties with optional type validation. This is cleaner than using `'prop' in obj && typeof obj.prop === 'type'`:

```typescript
// Instead of: 'disableCache' in ctx && typeof ctx.disableCache === 'function'
if (has(ctx, 'disableCache', 'function')) {
  ctx.disableCache();
}

// Instead of: 'endTime' in this && typeof this.endTime === 'number'
const endTime = has(this, 'endTime', 'number') ? this.endTime : Date.now();
```


