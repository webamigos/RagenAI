---
title: 'A vitest path filter from the repository root runs none of an app''s tests, and reports success'
modules: ['web', 'api', 'admin', 'worker']
areas: ['testing']
topics:
  ['vitest', 'turborepo', 'monorepo', 'test-filters', 'false-green', 'verification']
---

# A vitest path filter from the repository root runs none of an app's tests, and reports success

**Context**: a change to `packages/env` altered a rule that all four apps call,
so each app's environment contract test had to be checked. The check run was
`npx vitest run packages/env apps/web/src/config apps/admin/src/config` from the
repository root. It reported **8 files, 153 tests passed**, and the work was
pushed on that basis.

**Problem**: the root `vitest.config.ts` defines a project covering
`packages/*/src` and `tests/architecture`. It does not include `apps/*`. A path
argument to `vitest run` is a *filter over the files the project already
collects*, not an instruction to collect more — so `apps/web/src/config` matched
nothing at all. The 153 passing tests were `packages/env` and its neighbours;
not one of them was the test being verified. CI then failed on
`apps/web/src/config/__tests__/env.test.ts`, which had been demanding a
credential the change had just made conditional.

Nothing distinguishes this from a clean run. Vitest does not warn that a
filter matched no files, and the pass count is large enough to look like
coverage. It is the same failure shape as
[an empty grep from the wrong path](deleting-a-route-is-invisible-to-typecheck.md) —
absence of output reading as absence of problems.

The same session had already been caught by the sibling of this: a suite that
*was* run, but whose double (`usingNativeGateway: () => env.LLM_GATEWAY ===
'native'`) had gone stale in the direction that keeps a suite green.

**Rule**: run an app's tests through **turbo**, which knows each workspace's own
config: `npx turbo run test --filter=./apps/web`. Add a path only to narrow
within a workspace, and from that workspace's directory. Whenever a filtered run
is the evidence for a change, check that the file count and the named suites
match what was meant to run — a filter that matches nothing is the one result
that looks identical to success. Related:
[running vitest directly tests the last built `dist`](a-package-edit-is-invisible-to-apps-until-its-dist-is-rebuilt.md),
which is the same trap in the other direction.

**Applies to**: any verification of `apps/*` from the repository root, and any
change in `packages/*` whose consumers are apps.
