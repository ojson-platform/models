# Design

## Verification boundary

none

No capability is added or modified. The delta removes the coverage placeholder and adds no scenario. Baseline behavior stays as it is.

## External contracts

`@ojson/spec-coverage@0.0.1` is already published. This change does not publish it. The package must count a scenario when the vitest run registers that spec id with that requirement heading and that scenario heading, and must fail the run when a required scenario in `openspec/specs/` has no such registration. A skipped scenario does not count. Headings under `REMOVED Requirements` are not required.

## Technical prerequisites

- Code in this PR. The first slice adds `@ojson/spec-coverage@0.0.1` as a devDependency and updates the lockfile. No other dependency is added.
- Code in this PR. One slice per spec id, in this order: `cache-first`, `cache-only`, `cache-ttl`, `cache-zip`, `disable-cache`, `interrupted-run`, `model-identity`, `network-only`, `span-end`, `stale-while-revalidate`. Each slice registers only that spec's scenarios. The first slice also adds the devDependency. The last slice also enables the check. No other files.
- Code in this PR. Where a test already observes a scenario, keep its body, register it with the exact spec id, requirement heading, and scenario heading, and remove the old `it` in the same commit. A scenario with no test gets a new one in a test file that already exists. A test that matches no scenario stays a plain `it`. Test files stay where they are. A second copy of a test is not added. Requirement text, scenario titles, and baseline behavior stay as they are. `scenario.skip` does not cover a required scenario.
- Code in this PR. The last slice sets vitest `globalSetup` to `@ojson/spec-coverage/setup` and includes `@ojson/spec-coverage/reporter` in the reporters, keeping the rest of the existing vitest config. Until that slice the check is not part of CI. No flag: after that slice the check runs with the vitest run and passes. After merge nothing is left to turn on by hand.

## Open decisions

none
