# Register tests for every OpenSpec scenario

## Problem

`openspec/specs/` has 82 scenarios across 10 specs. Tests already observe much of that behavior, but they are not registered with `@ojson/spec-coverage`, so a spec coverage check cannot see them.

## Outcome

Every scenario in `openspec/specs/` is registered by `spec` / `requirement` / `scenario` during the vitest run. The spec coverage check runs in that same pull request and passes.

## Scope

Register the scenarios already in the baseline specs. Where a test already observes a scenario, keep its body, wrap it with the exact spec id, requirement heading, and scenario heading, and remove the old `it` in the same commit. A scenario with no test gets a new one. A test that matches no scenario stays a plain `it`. Test files stay where they are.

## Out of scope

Requirement text, scenario titles, and baseline behavior. A second copy of a test. Moving tests into new files. Publishing `@ojson/spec-coverage`.

## Constraints

`@ojson/spec-coverage@0.0.1` is already on npm. The first slice adds it as a devDependency. The last slice turns the check on: vitest `globalSetup` is `@ojson/spec-coverage/setup`, and the reporters include `@ojson/spec-coverage/reporter`. Until that last slice the check is not part of CI.

Design slices, one per spec id: `cache-first`, `cache-only`, `cache-ttl`, `cache-zip`, `disable-cache`, `interrupted-run`, `model-identity`, `network-only`, `span-end`, `stale-while-revalidate`. The first slice also adds the devDependency. The last slice also enables the check. No other files.

`scenario.skip` does not cover a required scenario.

The change delta is one file, `openspec/changes/issue-18/specs/coverage/spec.md`, and nothing else under `specs/`. Its whole body is:

```
## REMOVED Requirements

- Coverage placeholder
```

No Requirement heading and no Scenario heading. If that file is missing, add it before design. After archive, the skeleton `openspec/specs/coverage/spec.md` stays in the tree.

Design has no open decisions.

## Capabilities

### Added

### Modified

## Open questions

None.
