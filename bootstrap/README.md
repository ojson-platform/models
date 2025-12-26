# Bootstrap Template

This directory contains a template for setting up a new TypeScript npm package with modern development infrastructure.

## What's Included

### Development Tools

- **TypeScript**: ES2020 target with ES modules
- **ESLint**: Code linting with TypeScript and import rules
- **Prettier**: Code formatting
- **Vitest**: Testing framework with coverage
- **Husky**: Git hooks
- **lint-staged**: Pre-commit linting and formatting

### CI/CD

- **GitHub Actions workflows**:
  - `lint.yml`: Linting and format checking
  - `test.yml`: Unit and type tests on Node.js 20.x and 22.x
  - `release-please.yml`: Automated versioning and changelog
  - `publish.yml`: npm package publishing
  - `sonarcloud.yml`: Code quality analysis
  - `security.yml`: Security audits

### GitHub Integration

- **Issue templates**: Bug reports and feature requests
- **Pull request template**: Standardized PR format
- **Dependabot**: Automated dependency updates

### Documentation

- **AGENTS.md**: Index for AI coding agents
- **docs/AGENTS/**: Detailed guides for AI agents
  - `core.md`: Core concepts and setup
  - `architecture.md`: Architecture and design patterns
  - `style-and-testing.md`: Code style and testing guidelines
  - `dev-infrastructure.md`: Development infrastructure details
- **CONTRIBUTING.md**: Contribution guidelines
- **SECURITY.md**: Security policy
- **LICENSE**: ISC license template

## Setup Instructions

1. **Copy files to your new project**:
   ```bash
   cp -r bootstrap/* /path/to/your/new-project/
   ```

2. **Update configuration files**:
   - `package.json`: Update name, description, author, repository URLs
   - `.release-please-config.json`: Update `package-name`
   - `sonar-project.properties`: Update organization and project keys
   - `CONTRIBUTING.md`: Update repository URLs and project-specific details
   - `SECURITY.md`: Update email address
   - `LICENSE`: Update copyright holder

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Initialize Git hooks**:
   ```bash
   npm run prepare
   ```

5. **Set up GitHub Secrets** (if needed):
   - `NPM_TOKEN`: For publishing to npm
   - `SONAR_TOKEN`: For SonarCloud analysis
   - `RELEASE_PLEASE_TOKEN`: Optional, for release-please (uses GITHUB_TOKEN by default)

6. **Create initial source structure**:
   ```bash
   mkdir -p src
   # Create your source files
   ```

7. **Update `.gitignore`** if needed for your project

## Customization

### TypeScript Configuration

- `tsconfig.json`: Main TypeScript configuration
- `tsconfig.types.json`: Type checking configuration (for type tests)
- `scripts/extensions.js`: TypeScript transformer for import extensions

### ESLint Rules

The ESLint configuration includes:
- TypeScript recommended rules
- Import ordering and organization
- Prettier integration

You can customize rules in `eslint.config.js` based on your project needs.

### Test Configuration

- `vitest.config.ts`: Vitest configuration with coverage settings
- Tests use `.spec.ts` extension
- Coverage reports in `coverage/` directory

### Release Process

- Uses `release-please` for automated versioning
- Creates tags in format `v1.0.0`
- Generates `CHANGELOG.md` automatically
- Publishes to npm on release creation

## Notes

- The `tsconfig.types.json` assumes you have a `src/types.spec.ts` file for type tests. Remove or update if not needed.
- The `examples/` directory is optional. Update workflows if you don't use it.
- SonarCloud setup requires creating a project in SonarCloud first.

## Next Steps

1. Create your source code in `src/`
2. Write tests alongside your code
3. Update `AGENTS.md` and `docs/AGENTS/*.md` with project-specific information
4. Update README.md with project-specific documentation
5. Set up your GitHub repository
6. Configure SonarCloud (optional)
7. Start developing!

