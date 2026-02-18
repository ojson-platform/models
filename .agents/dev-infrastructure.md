# Agent Guide – Dev infrastructure

This package uses **@ojson/infra** for shared development tooling:

- ESLint: `eslint.config.js` re-exports from `@ojson/infra/eslint`
- Prettier: `prettier.config.js` re-exports from `@ojson/infra/prettier`
- Vitest: `vitest.config.mjs` re-exports from `@ojson/infra/vitest`
- TypeScript: `tsconfig.json` extends `@ojson/infra/tsconfig/base` (and/or build/test presets)

If you update tooling, prefer updating **@ojson/infra** and applying migrations rather than copy/paste changes per package.
