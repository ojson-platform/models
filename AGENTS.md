# AGENTS.md

A short index for AI coding agents working on this repository.

Most of the detailed guidance has been split into focused documents under `docs/AGENTS/`:

- `docs/AGENTS/core.md` – core concepts:
  - project overview;
  - setup commands;
  - context, models, `OJson`, `withModels`, `sign`;
  - high-level architecture notes.
- `docs/AGENTS/helpers-and-architecture.md` – helper modules and internal architecture:
  - `withCache`, `withDeadline`, `withOverrides`, `withTelemetry`;
  - `ctx.set()` pattern and registry/Context internals.
- `docs/AGENTS/style-and-testing.md` – style, testing, and documentation rules:
  - import organization, JSDoc style;
  - testing patterns and development workflow.
- `docs/AGENTS/dev-infrastructure.md` – development infrastructure:
  - build system, testing setup;
  - code quality tools (ESLint, Prettier, SonarCloud);
  - Git hooks, CI/CD workflows;
  - npm scripts and project structure.

Use these files as the primary reference when modifying or extending the library.

<!-- OJSON_INFRA_AGENTS:BEGIN -->

## Important

Additional AI agent guidance is available as fragments in the `.agents/` directory:

- `.agents/core.md` — Core concepts, two modes (metapackage vs standalone), and mode detection
- `.agents/dev-infrastructure.md` — Lint/format/test tooling and @ojson/infra usage

This section is managed by `@ojson/infra` migrations. Edit content outside this block freely.

<!-- OJSON_INFRA_AGENTS:END -->
