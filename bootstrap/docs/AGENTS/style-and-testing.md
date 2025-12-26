# Agent Guide – Style and Testing

## Code Style

### Import Organization

Imports must be organized in a specific order:

1. **Type imports first** (all `import type` statements):
   - External type imports
   - Parent module type imports
   - Local type imports

2. **Empty line separator**

3. **Runtime imports** (regular `import` statements):
   - External module imports
   - **Empty line separator**
   - Parent module imports
   - **Empty line separator**
   - Local module imports

**Example**:
```typescript
import type {ExternalType} from 'external-package';
import type {ParentType} from '../parent-module';
import type {LocalType} from './local-module';

import {externalFunction} from 'external-package';

import {parentFunction} from '../parent-module';

import {localFunction} from './local-module';
```

**Important**: Do not use mixed import syntax. Always separate type imports and runtime imports.

### Comments and Documentation

- **All comments must be in English** (including test comments and inline documentation).
- **JSDoc**: All public APIs must be documented with JSDoc comments.
- **Internal functions**: Use concise comments without redundant `@param` and `@returns` tags.

### Code Formatting

The project uses **Prettier** for code formatting. Configuration is in `.prettierrc.json`.

## Testing

### Test Structure

- Test files use `.spec.ts` extension (excluded from build).
- Tests are located next to the code they test.
- Use Vitest framework for unit tests.

### Type Tests

Type tests verify TypeScript type inference and constraints. They are located in `src/types.spec.ts` and use type-level assertions (no runtime code).

## Commit Message Format

This project uses [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <subject>

<body>
```

### Commit Types

- `feat`: New feature for end users
- `fix`: Bug fix for end users
- `perf`: Performance improvement
- `refactor`: Code refactoring (no functional changes)
- `docs`: Documentation changes only
- `chore`: Maintenance tasks and infrastructure changes
- `revert`: Reverting a previous commit

**Key distinction**: `feat` is for **user-facing functionality**, while `chore` is for **development infrastructure**.

**Examples**:
- ✅ `feat(cache): add CacheFirst strategy` – new caching feature
- ✅ `chore(lint): add module import restrictions` – ESLint configuration
- ❌ `feat(lint): add module import restrictions` – incorrect (infrastructure, not user feature)

### Commit Message Rules

- **All commit messages must be in English**
- **Subject**: Brief description in imperative mood (e.g., "add", "fix", not "added", "fixed")
- **Scope** (optional): Area of codebase
- **Body** (optional): Detailed explanation of what and why


