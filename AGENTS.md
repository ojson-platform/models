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

Use these files as the primary reference when modifying or extending the library.

