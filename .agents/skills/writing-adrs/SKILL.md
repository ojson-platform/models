---
name: writing-adrs
description: >
  Use when creating or editing an ADR in docs/ADR, when a change is about to
  lock in an architectural choice, or when a step says **Write the approach**
  and that approach would be surprising without the reason. Also when a
  decision is hard to reverse, a rejected alternative is worth keeping, or
  someone asks for an ADR.
---

# Writing ADRs

An ADR records a choice that later code must not "fix" by accident. It lives in `docs/ADR/NNNN-slug.md`. The next number is one above the highest file there. The title line is `# ADR NNNN: {the choice}`.

## When to write one

All three hold:

1. Reversing it later is expensive.
2. A reader of the code will wonder why it is this way.
3. Another option was real, and it lost for a stated reason.

Otherwise do not add a file. A decision already recorded is a citation (`ADR 0009`), not a second ADR. A reversal is a new ADR; the old one's Status becomes `Superseded by ADR NNNN`.

## During **Write the approach**

`## Approach` in `design.md` names the ADR when this change makes such a choice (`ADR NNNN`) and does not repeat it. No such choice: `## Approach` is `none`. Do not create an ADR to fill the section.

## The file

```md
# ADR NNNN: {the choice, one line}

## Status

Accepted

## Context

{The constraint that forced a choice. Not the solution.}

## Decision

{What we do. Short enough to cite.}

## Rationale

{Why this option meets the constraint.}

## Consequences

- Keep: {what a later change must not undo}
- Cost: {what we pay}

## Alternatives

- {Option}: {why it lost}
```

Status is `Proposed` until the decision is in the code or the person has accepted it, then `Accepted`.

No implementation, no usage sample, no test plan. Point at the module in one line inside Decision if the code is the record. Specs say what the caller observes; this file says why the shape is not the other one.

Leave existing ADRs as they are. A new ADR follows this file even when a neighbor has extra sections.
