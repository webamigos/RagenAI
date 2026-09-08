---
title: 'turbo runs no root-package script unless turbo.json declares `//#task`, so the gate skipped every architecture guard and still reported success'
modules: ['ci']
areas: ['ci', 'testing']
topics: ['turborepo', 'architecture-tests', 'fail-open', 'monorepo-tasks', 'vitest']
---

# turbo runs no root-package script unless turbo.json declares `//#task`, so the gate skipped every architecture guard and still reported success

**Context**: `tests/architecture/**` holds the repo-wide guards — tenant scope,
raw-SQL org filters, inlined role checks, recopied contracts, the AGENTS.md
budget. They live in the root vitest project, because they read the whole
monorepo as text and belong to no single workspace. `npm run verify` is
`generate:types && turbo run lint typecheck test build`, and AGENTS.md calls it
"THE gate" and "the one command that checks all of them at once".

**Problem**: it never ran any of them. The root of a Turborepo is not covered
by `workspaces` (here `packages/*` and `apps/*`), and turbo will not run a
script in the root package unless `turbo.json` declares a task for it under the
`//#<task>` key. There was no `//#test`. Turbo does not warn about a root script
it is ignoring — there is nothing to warn about from its point of view — so
`turbo run test` completed and reported success over a set that silently
excluded the guards.

The A/B on one tree, with a guard deliberately broken (AGENTS.md pushed past
its byte budget):

```
before:  Tasks: 45 successful, 45 total     verify exit 0
after:   Tasks: 46 successful, 46 total     verify exit 1   Failed: //#test
```

The whole defect is that single missing task. Note the shape of the evidence:
the failure is not a wrong number in the output, it is a **row that is not
there**, and nothing draws attention to a row that is not there.

CI was fine, which is why this lasted. Its `Test` job carried a separate
`npm run packages:test` step, with a comment explaining that `turbo run test`
does not cover the root project. So the repository read as covered — and it
was, on CI, and on nobody's machine. That asymmetry is the real trap: a
compensating step in one place makes the gap in the other place look
deliberate. It is how the knex-shaped assertion in
`thread-deletion-must-remove-messages.test.ts` passed local validation during
the ADR-40 worker migration and went red on `main`.

One hypothesis worth recording because it was **wrong**: that a `//#test` task
would cache against the root package's own files, so editing
`apps/worker/src/**` would replay a stale green. Tested rather than assumed —
touch a file under `apps/worker` and the root task is a cache miss. Turbo hashes
the repository state for a root task, so it invalidates correctly. The design
decision turned on that measurement, not on the guess.

**Rule**: a task that must see the whole monorepo cannot live in a workspace,
so it lives at the root — and a root task needs **both** halves: the script in
the root `package.json` and a `//#<task>` entry in `turbo.json`. Adding only
the script changes nothing, visibly or otherwise. When a check exists in CI but
not in the local gate, treat the difference as a bug in the gate rather than a
division of labour, and fix it at the shared mechanism instead of adding a
second compensating step. Verify by breaking a guard on purpose and confirming
the gate goes red; a gate is only evidence once you have seen it fail.
`tests/architecture/the-gate-runs-the-repo-wide-guards.test.ts` now holds each
link of that chain.

**Applies to**: `turbo.json` and the root `package.json`; anything added to
`tests/**`, which is reachable only through `//#test`. Same family as
[a stacked PR getting no CI](a-stacked-pr-gets-no-ci-and-retargeting-does-not-start-one.md)
and [a path glob that matches nothing](path-filters-fail-open-after-a-directory-move.md):
a check that never ran is indistinguishable from one that passed.
