# Agent Guide – Core Concepts

## Two modes: metapackage vs standalone

This package can be developed in **two modes**:

- **Metapackage mode**: the package is developed inside the ojson metapackage workspace. Other `@ojson/*` packages may be linked locally, and shared dev infrastructure is available via workspace.
- **Standalone mode**: the package is cloned and developed on its own. Dependencies resolve from npm (semver ranges), and metapackage scripts (submodule/bootstrap) do not apply.

## Behavioral differences

- **Dependency resolution**:
  - metapackage: workspace can override semver deps with local clones
  - standalone: only installed deps (npm registry) are used
- **Tooling & scripts**:
  - metapackage: root scripts (bootstrap/check-submodules) exist at metapackage root
  - standalone: only package-local scripts exist
- **Lockfiles/CI**:
  - metapackage: workspace setup may differ from per-package CI
  - standalone: CI typically runs against the package alone

## How to detect current mode (copy/paste)

### Quick check (filesystem)

```bash
# Run from the package root
test -f ../pnpm-workspace.yaml && echo "metapackage-like" || echo "standalone-like"
test -f ../.gitmodules && echo "metapackage gitmodules present" || true
```

### Tool-assisted

If `ojson-infra` CLI is available:

```bash
pnpm exec ojson-infra status
```
