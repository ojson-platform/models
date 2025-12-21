# Contributing to @ojson/models

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Testing](#testing)
- [Documentation](#documentation)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

This project adheres to a code of conduct that all contributors are expected to follow. Please be respectful and constructive in all interactions.

## Getting Started

### Prerequisites

- **Node.js**: Version 20.x or 22.x
- **npm**: Latest version
- **Git**: For version control

### Setup

1. **Fork and clone the repository**:
   ```bash
   git clone https://github.com/ojson-platform/models.git
   cd models
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Verify the setup**:
   ```bash
   npm run build
   npm test
   ```

## Development Workflow

### Project Structure

```
models/
├── src/                    # Source code
│   ├── with-models/       # Core memoization module
│   ├── with-cache/        # Caching strategies
│   ├── with-deadline/     # Timeout support
│   ├── with-overrides/    # Model substitution
│   ├── with-telemetry/    # OpenTelemetry integration
│   ├── utils/             # Shared utilities
│   └── types.ts           # Core type definitions
├── examples/              # Example applications
├── docs/                  # Documentation
│   ├── AGENTS/           # AI agent guides
│   └── ADR/              # Architectural Decision Records
└── build/                # Compiled output (generated)
```

### Making Changes

1. **Create a branch** from `master`:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Make your changes** following the [Code Style](#code-style) guidelines.

3. **Run tests** to ensure everything works:
   ```bash
   npm test
   ```

4. **Run linting** to check code quality:
   ```bash
   npm run lint
   ```

5. **Format your code**:
   ```bash
   npm run format
   ```

6. **Commit your changes** following [Commit Guidelines](#commit-guidelines).

## Code Style

### TypeScript

- **Strict mode**: All code must pass TypeScript strict mode checks.
- **ES2020 target**: Code is compiled to ES2020 with ES modules.
- **Functional patterns**: Prefer functional programming patterns where possible.
- **Pure functions**: Models must be deterministic (pure functions).

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

### Module Boundaries

When importing from other modules in `src/with-*/`, always import from the module root (e.g., `'../with-models'`) rather than internal files (e.g., `'../with-models/types'`). This is enforced by ESLint.

### Comments and Documentation

- **All comments must be in English** (including test comments and inline documentation).
- **JSDoc**: All public APIs must be documented with JSDoc comments.
- **Internal functions**: Use concise comments without redundant `@param` and `@returns` tags.

See `docs/AGENTS/style-and-testing.md` for detailed documentation guidelines.

### Code Formatting

The project uses **Prettier** for code formatting. Configuration is in `.prettierrc.json`. Run `npm run format` before committing.

## Testing

### Test Structure

- Test files use `.spec.ts` extension (excluded from build).
- Tests are located next to the code they test.
- Use Vitest framework for unit tests.

### Running Tests

```bash
# Run all tests (unit + type tests)
npm test

# Run only unit tests
npm run test:units

# Run only unit tests (excluding examples)
npm run test:units:fast

# Run type tests
npm run test:types

# Run integration tests (examples)
npm run test:integration

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

Focus areas:
- Model memoization behavior
- Generator handling
- Cache strategies
- Context lifecycle
- Error handling

Key test patterns:
- Verify memoization by checking call counts
- Test generator interruption with `kill()`
- Verify cache sharing between contexts
- Test nested generator resolution

### Type Tests

Type tests verify TypeScript type inference and constraints. They are located in `src/types.spec.ts` and use type-level assertions (no runtime code).

## Documentation

### User Documentation

- **README.md**: Main project documentation
- **Module READMEs**: User-facing guides in `src/*/readme.md`
- **Examples**: Working examples in `examples/` directory

### Developer Documentation

- **AGENTS.md**: Index for AI coding agents
- **docs/AGENTS/**: Detailed guides for AI agents
- **docs/ADR/**: Architectural Decision Records

### Updating Documentation

- Update relevant README files when adding features
- Add ADRs for significant architectural decisions
- Keep examples up to date with API changes

## Commit Guidelines

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
- **Scope** (optional): Area of codebase (e.g., `cache`, `models`, `telemetry`)
- **Body** (optional): Detailed explanation of what and why

## Pull Request Process

1. **Update your branch**:
   ```bash
   git checkout master
   git pull origin master
   git checkout your-branch
   git rebase master
   ```

2. **Ensure all checks pass**:
   - Tests pass: `npm test`
   - Linting passes: `npm run lint`
   - Code is formatted: `npm run format:check`
   - Type checking passes: `npm run test:types`

3. **Create a Pull Request**:
   - Use the PR template provided
   - Provide a clear description of changes
   - Link related issues if applicable
   - Ensure CI checks pass

4. **Code Review**:
   - Address review comments
   - Keep commits focused and logical
   - Squash commits if requested

### PR Checklist

- [ ] Tests pass locally
- [ ] Added/updated tests for new functionality
- [ ] Type tests pass (`npm run test:types`)
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated (if needed)
- [ ] No new warnings generated
- [ ] CHANGELOG will be updated by release-please (if applicable)

## Additional Resources

- **Project Overview**: See `docs/AGENTS/core.md`
- **Architecture**: See `docs/AGENTS/helpers-and-architecture.md`
- **Style Guide**: See `docs/AGENTS/style-and-testing.md`
- **Infrastructure**: See `docs/AGENTS/dev-infrastructure.md`

## Questions?

If you have questions or need help, please:
- Open an issue for bugs or feature requests
- Check existing documentation in `docs/`
- Review examples in `examples/` directory

Thank you for contributing! 🎉

