# Agent Guide – Development Infrastructure

## Overview

This document describes the development infrastructure setup for the project, including tools, workflows, and CI/CD configuration.

## Build System

### TypeScript Compilation

- **Compiler**: `tspc` (TypeScript Patched Compiler) with custom transformer plugin
- **Build command**: `npm run build`
- **Output**: `build/` directory
- **Custom transformer**: Automatically adds `.js` extensions to relative import paths for ES modules compatibility

### Type Checking

- **Command**: `npm run test:types`
- **Config**: `tsconfig.types.json`
- **Purpose**: Validates TypeScript types without building
- **Runs in**: Pre-commit hooks and CI

## Testing

### Unit Tests

- **Framework**: Vitest
- **Command**: `npm run test:units` (all tests) or `npm run test:units:fast` (excludes examples)
- **Test files**: `**/*.spec.ts`
- **Coverage**: `@vitest/coverage-v8` provider
- **Coverage command**: `npm run test:coverage` or `npm run test:coverage:fast`
- **Coverage formats**: text, json, html, lcov
- **Coverage exclusions**: test files, examples, build/, node_modules/

### Type Tests

- **Command**: `npm run test:types`
- **Purpose**: Validates TypeScript type constraints at compile time
- **Location**: `src/types.spec.ts`
- **Note**: Type tests don't have runtime assertions (excluded from SonarCloud S2699 rule)

### Integration Tests

- **Command**: `npm run test:integration`
- **Location**: `examples/**/*.spec.ts`
- **Purpose**: Tests integration with Express.js and real-world usage

## Code Quality

### ESLint

- **Version**: v9 (flat config)
- **Config**: `eslint.config.js`
- **Command**: `npm run lint` or `npm run lint:fix`
- **Plugins**:
  - `@typescript-eslint/eslint-plugin` - TypeScript rules
  - `eslint-plugin-import` - Import order validation
  - `eslint-config-prettier` - Disables conflicting formatting rules
- **Rules**:
  - Import order: type imports first, then runtime imports
  - Unused vars: allows `_` prefix for intentionally unused variables
  - `no-explicit-any`: warning (off in test files)
- **Ignores**: `build/`, `node_modules/`, `examples/`, `dist/`, `*.config.js`, `scripts/`

### Prettier

- **Config**: `.prettierrc.json`
- **Command**: `npm run format` or `npm run format:check`
- **Settings**:
  - Single quotes
  - Trailing commas: `all`
  - Bracket spacing: `false`
  - Tab width: 2
  - Semicolons: true
- **Ignores**: `build/`, `node_modules/`, `examples/`, `dist/`

### SonarCloud

- **Purpose**: Code quality analysis, coverage tracking, security scanning
- **Config**: `sonar-project.properties`
- **Workflow**: `.github/workflows/sonarcloud.yml`
- **Coverage**: LCOV reports uploaded automatically
- **Exclusions**: `examples/**` excluded from analysis
- **Rules**: `typescript:S2699` (tests without assertions) excluded for `types.spec.ts`

## Git Hooks

### Pre-commit (Husky + lint-staged)

- **Tool**: Husky
- **Config**: `.lintstagedrc.json`
- **Checks for `*.ts` files**:
  1. ESLint (`eslint --max-warnings=0`)
  2. Prettier (`prettier --write`)
  3. Unit tests (`npm run test:units:fast`)
  4. Type tests (`npm run test:types`)

**Note**: Integration tests from `examples/` are excluded from pre-commit to keep hooks fast.

## CI/CD (GitHub Actions)

### Test Workflow (`.github/workflows/test.yml`)

- **Triggers**: `push`, `pull_request` to `master`/`main`
- **Node.js versions**: 20.x, 22.x (matrix strategy)
- **Steps**:
  1. Checkout code
  2. Setup Node.js with npm cache
  3. Install dependencies (`npm ci`)
  4. Run unit tests (`npm run test:units:fast`)
  5. Run type tests (`npm run test:types`)

### Lint Workflow (`.github/workflows/lint.yml`)

- **Triggers**: `push`, `pull_request` to `master`/`main`
- **Node.js version**: 22.x
- **Steps**:
  1. Checkout code
  2. Setup Node.js with npm cache
  3. Install dependencies (`npm ci`)
  4. Run ESLint (`npm run lint`)
  5. Check formatting (`npm run format:check`)

### Examples Workflow (`.github/workflows/examples.yml`)

- **Triggers**: `push`, `pull_request` to `master`/`main`
- **Node.js version**: 22.x
- **Steps**:
  1. Checkout code
  2. Setup Node.js with npm cache
  3. Install root dependencies
  4. Build main package (`npm run build`)
  5. Install example dependencies (`npm ci` in `examples/todo-api`)
  6. Build example (`npm run build` in `examples/todo-api`)
  7. Run integration tests (`npm run test:integration`)

### SonarCloud Workflow (`.github/workflows/sonarcloud.yml`)

- **Triggers**: `push`, `pull_request` to `master`/`main`
- **Node.js version**: 22.x
- **Action**: `SonarSource/sonarqube-scan-action@v7.0.0`
- **Steps**:
  1. Checkout code (with `fetch-depth: 0` for better analysis)
  2. Setup Node.js with npm cache
  3. Install dependencies (`npm ci`)
  4. Run tests with coverage (`npm run test:coverage:fast`)
  5. SonarCloud scan (uses `SONAR_TOKEN` secret)

## NPM Scripts

### Build

- `npm run build` - Compile TypeScript to `build/`
- `npm run prebuild` - Clean `build/` directory

### Testing

- `npm test` - Run all tests (units + types)
- `npm run test:units` - Run all unit tests (including examples)
- `npm run test:units:fast` - Run unit tests excluding examples
- `npm run test:types` - Run type tests
- `npm run test:integration` - Run integration tests from examples
- `npm run test:coverage` - Run tests with coverage (all)
- `npm run test:coverage:fast` - Run tests with coverage (excluding examples)

### Code Quality

- `npm run lint` - Run ESLint
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting

## Project Structure

### Source Code

- `src/` - Main source code
  - `src/*/` - Helper modules (with-models, with-cache, etc.)
  - Each module follows pattern: `index.ts`, `types.ts`, `*.ts` (implementation)

### Tests

- `src/**/*.spec.ts` - Unit tests
- `src/types.spec.ts` - Type tests
- `examples/**/*.spec.ts` - Integration tests

### Configuration Files

- `tsconfig.json` - Main TypeScript config
- `tsconfig.types.json` - Type tests config
- `vitest.config.ts` - Vitest configuration
- `eslint.config.js` - ESLint configuration (flat config)
- `.prettierrc.json` - Prettier configuration
- `.lintstagedrc.json` - lint-staged configuration
- `sonar-project.properties` - SonarCloud configuration
- `.husky/pre-commit` - Pre-commit hook

### Documentation

- `docs/AGENTS/` - Agent-facing documentation
- `docs/ADR/` - Architectural Decision Records
- `src/*/readme.md` - User-facing module documentation

## Node.js Support

- **Supported versions**: 20.x, 22.x
- **CI matrix**: Tests run on both versions
- **Note**: Node.js 18.x is no longer supported

## Coverage

- **Provider**: `@vitest/coverage-v8`
- **Reports**: Generated in `coverage/` directory
- **Formats**: text, json, html, lcov
- **Publishing**: LCOV reports uploaded to SonarCloud
- **Exclusions**: Test files, examples, build/, node_modules/
- **Thresholds**: Not configured yet (TODO: add when coverage is sufficient)

## Security

### SonarCloud
- Security vulnerability scanning
- Code quality and security analysis
- Integrated with GitHub Actions

### Dependabot
- **Config**: `.github/dependabot.yml`
- **Dependency updates**: 
  - Schedule: Weekly (Monday, 09:00)
  - Updates: Minor and patch versions only
  - Major versions: Require manual review
  - Grouping: Production and development dependencies separately
  - PR limit: 10 open PRs
- **Security updates**:
  - Schedule: Daily
  - Automatic PRs for vulnerabilities
  - Labels: security, dependabot
  - PR limit: 5 open PRs

### npm audit
- **Workflow**: `.github/workflows/security.yml`
- **Triggers**: Push, PR, weekly schedule (Monday, 06:00 UTC)
- **Level**: Moderate and above
- **Artifacts**: Audit results uploaded on failure

## Release Process

- **Status**: Manual (automation not configured yet)
- **TODO**: Add `release-please` workflow for automated releases
- **TODO**: Add npm publish workflow

## Known Limitations

- Bundle size monitoring: Not applicable (no bundle)
- Coverage thresholds: Not configured yet
- Dependabot: Not configured yet
- Release automation: Not configured yet
- Security scanning: Only via SonarCloud (no npm audit in CI)

