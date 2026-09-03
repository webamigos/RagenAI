---
title: 'A Stryker mutate entry that matches nothing, or whose tests are out of the runner config, reports success'
modules: ['ci']
areas: ['testing', 'ci']
topics: ['mutation-testing', 'stryker', 'vitest', 'config-drift', 'monorepo']
---

# A Stryker mutate entry that matches nothing, or whose tests are out of the runner config, reports success

**Context**: `stryker.config.mjs` listed four mutation targets, the fourth being
`src/libs/db/tenant-scope-guard.ts` — the tenant-scope Prisma extension, called
out in the config's own header as the highest-value target because "cross-org
IDOR is this codebase's worst failure mode". ADR-29 had moved the web app into
`apps/web/`, so the real path was `apps/web/src/libs/db/tenant-scope-guard.ts`.

**Problem**: two independent failure modes, each of which reports a passing
nightly.

1. **A `mutate` glob that matches nothing is skipped silently.** Stryker does not
   warn, let alone fail, when an entry resolves to zero files. The other three
   entries still matched, so the nightly `Mutation Testing` job kept reporting a
   score — one computed over `packages/*` alone, with the file the config
   describes as its most important target excluded. The recorded baseline
   (`68.33%`, with `break: 65`) had been measured on that reduced scope, so
   nothing looked off.

2. **Fixing the path alone makes the score worse, not better.** Stryker runs the
   test suite defined by its runner config — here `vitest: { configFile: … }`,
   pointed at the root `vitest.config.ts`, whose `include` is
   `packages/*/src/**/*.test.ts` only. The covering test lives at
   `apps/web/src/libs/db/__tests__/tenant-scope-guard.test.ts` and would not
   have run at all, so **every** mutant in the file survives unconditionally.
   That reads in the report as a worthless test suite when it is really a
   missing line of config. The fix was a dedicated `vitest.mutation.config.ts`
   whose `include` spans both, with `@` aliased to `apps/web/src` (apps/web's
   tests get that alias from its own tsconfig via `vite-tsconfig-paths`; running
   one from the repo root means declaring it).

Once actually measured, the file scored 68.57% — 28 survivors, almost all of
them one per entry in `TENANT_SCOPED_MODELS` and `WHERE_OPERATIONS`, because the
tests exercised three models and five of thirteen operations. Emptying
`Thread: 'organizationId'` to `Thread: ''` makes the guard return "not
applicable" for every `Thread` query, silently, and no test noticed. Driving the
tests off the exported table (`it.each(Object.entries(TENANT_SCOPED_MODELS))`)
plus asserting each entry's column name took it to 99.05%.

**Rule**: when a mutation target is added or a path in `mutate` changes, prove
the mutants exist _and_ die — read the per-file row in the Stryker table, don't
trust the job's exit code. `mutate` and the runner config's `include` are two
halves of one decision: a target whose covering tests are not in the runner's
scope is worse than no target at all, because it manufactures survivors. After
changing either, re-measure and update the baseline recorded in the config, and
add any new config file to the workflow's `pull_request.paths` filter so a PR
that breaks it is caught by that PR rather than at 3am.

**Applies to**: `stryker.config.mjs`, `vitest.mutation.config.ts`,
`.github/workflows/mutation.yml`. More generally, any tool that takes a glob
list and treats a zero-match entry as "nothing to do" — the same shape as the
post-ADR-29 CI `paths` filters that stopped matching after the app moved.
