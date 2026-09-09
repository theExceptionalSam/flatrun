<!--
Thanks for opening a PR. Fill in the sections below.
The reviewer (or future you) should be able to understand the change without
reading the diff.
-->

## Summary

<!-- One or two sentences. What does this PR change and why? -->

## Slice

<!-- Which slice does this belong to? See docs/build-slices.md -->
- Slice: <!-- e.g. 1, 2, 3, 4, 5, 6, 7, or "0" for foundation work -->
- Brief phases covered: <!-- e.g. "Phase 2 + Phase 11" -->

## Acceptance criteria

<!-- Tick the boxes that apply. Delete ones that don't. -->

- [ ] Code written
- [ ] Tests added or updated
- [ ] Tests pass locally (`bun run lint`, engine fixtures if engine-touching)
- [ ] Multi-tenancy: a user in Org A cannot read Org B's data (if auth/data-touching)
- [ ] No deterministic financial logic replaced with AI
- [ ] Worklog updated (`worklog.md`)
- [ ] No scope changes outside `docs/product-brief.md` (or scope change approved below)

## Scope change?

<!-- If this PR adds, removes, or changes anything not in docs/product-brief.md,
     explain here. Otherwise write "No". -->

## Worklog entry

<!-- Paste the worklog entry added for this work, or link to the diff:
     e.g. See worklog.md Task ID slice-1
-->

## Checklist before requesting review

- [ ] Self-reviewed the diff
- [ ] Comments added for non-obvious code
- [ ] Documentation updated (`docs/*.md` if architecture decision changed)
- [ ] Commit message follows convention: `slice-N: short description`

<!--
Note: Per docs/operating-protocol.md, the reviewer should verify:
  1. The change does not introduce features outside the brief.
  2. The change does not replace deterministic financial logic with AI.
  3. The change follows the build loop: PLAN → IMPLEMENT → TEST → INSPECT → FIX → DOCUMENT → COMMIT.
-->
