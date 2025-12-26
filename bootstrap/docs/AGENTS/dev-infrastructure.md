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
- **Location**: `src/types.spec.ts` (if applicable)
- **Note**: Type tests don't have runtime assertions (excluded from SonarCloud S2699 rule)

### Integration Tests

- **Command**: `npm run test:integration`
- **Location**: `examples/**/*.spec.ts` (if applicable)
- **Purpose**: Tests integration with real-world usage

## Code Quality

### ESLint

- **Config**: `eslint.config.js`
- **Command**: `npm run lint` or `npm run lint:fix`
- **Rules**: TypeScript recommended + import ordering + Prettier integration
- **Module boundaries**: Enforced via `no-restricted-imports` rule

### Prettier

- **Config**: `.prettierrc.json`
- **Command**: `npm run format` or `npm run format:check`
- **Integration**: Runs automatically via lint-staged on commit

### SonarCloud

- **Config**: `sonar-project.properties`
- **Workflow**: `.github/workflows/sonarcloud.yml`
- **Coverage**: Uses `coverage/lcov.info` from Vitest
- **Setup**: Requires `SONAR_TOKEN` secret in GitHub

## Git Hooks

### Husky

- **Setup**: `npm run prepare` (runs `husky install`)
- **Pre-commit**: Runs `lint-staged` to lint and format staged files

### lint-staged

- **Config**: `.lintstagedrc.json`
- **Actions**: ESLint + Prettier on TypeScript files, runs tests for spec files

## CI/CD

### GitHub Actions Workflows

- **lint.yml**: Linting and format checking
- **test.yml**: Unit and type tests on Node.js 20.x and 22.x
- **release-please.yml**: Automated versioning and changelog generation
- **publish.yml**: npm package publishing on release
- **sonarcloud.yml**: Code quality analysis
- **security.yml**: Security audits (weekly schedule)

### Release Process

- **Tool**: release-please
- **Config**: `.release-please-config.json`
- **Manifest**: `.release-please-manifest.json`
- **Tag format**: `v1.0.0` (configurable via `tagPrefix`)
- **Changelog**: Auto-generated in `CHANGELOG.md`
- **Trigger**: Push to `master`/`main` branch

### Publishing

- **Trigger**: GitHub release creation
- **Workflow**: `.github/workflows/publish.yml`
- **Steps**: Test → Build → Verify → Publish to npm
- **Secrets**: `NPM_TOKEN` required

## Dependencies

### Dependabot

- **Config**: `.github/dependabot.yml`
- **Schedule**: Weekly on Monday at 09:00
- **Updates**: Minor and patch versions (grouped)
- **Security**: Automatic security updates enabled

## npm Scripts

- `prepare`: Install Husky git hooks
- `prebuild`: Clean build directory
- `build`: Compile TypeScript
- `test`: Run all tests (units + types)
- `test:units`: Run unit tests
- `test:units:fast`: Run unit tests (exclude examples)
- `test:coverage`: Run tests with coverage
- `test:coverage:fast`: Run tests with coverage (exclude examples)
- `test:types`: Run type tests
- `test:integration`: Run integration tests
- `lint`: Run ESLint
- `lint:fix`: Run ESLint with auto-fix
- `format`: Format code with Prettier
- `format:check`: Check code formatting

## Project Structure

```
your-package/
├── src/                    # Source code
├── build/                  # Compiled output (generated)
├── coverage/              # Coverage reports (generated)
├── examples/              # Example applications (optional)
├── docs/                  # Documentation
│   └── AGENTS/           # AI agent guides
├── .github/              # GitHub configuration
│   ├── workflows/       # CI/CD workflows
│   ├── ISSUE_TEMPLATE/  # Issue templates
│   └── dependabot.yml  # Dependabot config
├── scripts/             # Build scripts
└── .husky/             # Git hooks
```

## Troubleshooting

### Coverage Not Showing in SonarCloud

- Ensure `npm run test:coverage:fast` generates `coverage/lcov.info`
- Check that `SONAR_TOKEN` secret is set in GitHub
- Verify `sonar-project.properties` has correct paths

### Local Coverage Viewing

```bash
npm run test:coverage:fast
open coverage/index.html
```


