---
title: 'A Stryker mutate entry that matches nothing, or whose tests are out of the runner config, reports success'
modules: ['ci']
areas: ['testing', 'ci']
topics: ['mutation-testing', 'stryker', 'vitest', 'config-drift', 'monorepo']
---

# A Stryker mutate entry that matches nothing, or whose tests are out of the runner config, reports success

**Context**: `stryker.config.mjs` lists mutation targets for the nightly
`Mutation Testing` job, one of them the tenant-scope guard — called out in the
config's own header as the highest-value target, since "cross-org IDOR is this
codebase's worst failure mode". The entry read `src/libs/db/tenant-scope-guard.ts`.
ADR-29 had moved the web app into `apps/web/` well before this was noticed, and
ADR-33 later split the guard itself: the model map and predicate
(`isTenantScopeSatisfied`, `TENANT_SCOPED_MODELS`) moved into
`packages/platform-contracts/src/tenant-scope/tenant-scope.ts`, leaving
`apps/web/src/libs/db/tenant-scope-guard.ts` and its `apps/api` counterpart as
thin Prisma Client Extension bindings around it.

**Problem**: Stryker does not warn, let alone fail, when a `mutate` glob
resolves to zero files. The other package entries in `mutate` still matched, so
the nightly job kept reporting a score computed over `packages/rag-core`,
`packages/storage` and `packages/observability` alone — the tenant-scope logic
was excluded from mutation testing from the moment the app moved to
`apps/web/`, and stayed excluded straight through the later package split,
because nobody looked at which files the glob actually resolved to. The
recorded baseline (`68.33%`, `break: 65`) had been measured on that reduced
scope, so nothing about the passing nightly run looked off.

Pointing `mutate` at the predicate's real, current home
(`packages/platform-contracts/src/tenant-scope/tenant-scope.ts`) needed no
companion change to the Stryker vitest runner config this time — unlike the
`apps/web`-era version of this file, which needed a dedicated
`vitest.mutation.config.ts` to reach a test outside `packages/*`. Now that the
logic lives in a package, its test
(`packages/platform-contracts/src/__tests__/tenant-scope.test.ts`) already
matches the root `vitest.config.ts`'s `include: ['packages/*/src/**/*.test.ts', ...]`.
That is itself a lesson: a shared-package extraction can retroactively fix a
"my test isn't in the runner's scope" problem for free, but only if `mutate` is
re-pointed at the new location — the stale path silently ships with the
refactor otherwise, since nothing about moving the source file touches
`stryker.config.mjs`.

Once actually measured, the file scored 68.09% — 27 survivors, nearly all one
per entry in `TENANT_SCOPED_MODELS` (20 models) and `WHERE_OPERATIONS` (12
operations), because the pre-existing tests exercised a handful of each.
Emptying `Thread: 'organizationId'` to `Thread: ''` makes the guard return "not
applicable" for every `Thread` query, silently — and it survived even past this
package's own schema-drift tests (`against prisma/schema.prisma`), because
those check that the map's _keys_ name real models and that the declared field
exists on them via a regex loose enough to still match against an emptied
value; they do not exercise the predicate itself for each model. Driving a
separate set of tests directly off `Object.entries(TENANT_SCOPED_MODELS)` and
the full `WHERE_OPERATIONS` set (rather than a hand-picked sample) took it to
99.05%, with the one remaining survivor provably equivalent.

**Rule**: when a mutation target is added or a path in `mutate` changes, prove
the mutants exist _and_ die — read the per-file row in the Stryker table, don't
trust the job's exit code. A drift-detection test (assert the map's keys exist
in the schema) is not a substitute for exercising the predicate with each
entry's own value — a check on the map's shape and a check on its behavior can
each pass while the other fails. After changing `mutate`, re-measure and update
the baseline recorded in the config's own comment, and add any new supporting
config file to the mutation workflow's `pull_request.paths` filter so a PR that
breaks it is caught by that PR rather than at 3am.

**Applies to**: `stryker.config.mjs`. More generally, any tool that takes a
glob list and treats a zero-match entry as "nothing to do" — the same shape as
a CI `paths` filter that stops matching after the directory it names moves —
and any refactor that relocates a file a `mutate`/`include`/`paths` entry names
by exact path.
