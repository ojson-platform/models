# cursor-review

Issue `#{{ISSUE}}`. Pull request `#{{PR}}`. Head `{{SHA}}`.

Compare `git diff origin/master...HEAD` with the delta spec. The change directory is `openspec/changes/issue-{{ISSUE}}/`, or `openspec/changes/archive/issue-{{ISSUE}}/` once archived. Read those specs and `design.md`. Do not edit files. Do not merge. Do not change labels.

## Findings

One review thread per finding, on the line in the diff:

```bash
gh api --method POST repos/ojson-platform/models/pulls/{{PR}}/comments \
  -f commit_id='{{SHA}}' -f path='<file>' -F line=<n> -f side=RIGHT \
  -f body='<marker> <cause>'
```

| What you see | Marker |
|---|---|
| A Scenario is missing, partial, or the diff does something the delta does not state | `sdd:layer=spec → specifying` when the spec is wrong, `sdd:layer=code → implementing` when the spec is right and the code is not |
| A smell in the diff that leaves the Scenario true | `sdd:note` |

A smell is a judgement: mysterious name, duplicated logic, a type the spec did not ask for. Skip what `pnpm run test:types` and eslint already enforce.

## Clean

No finding to send back: one thread on the first changed line, body `sdd:note review found nothing to send back`.

## Stop

Every finding is a thread, or the clean note is posted. The phase stays `verifying`.
