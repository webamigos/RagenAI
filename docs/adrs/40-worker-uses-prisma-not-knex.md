# ADR-40: The Worker Uses Prisma, From the Same Schema as Everything Else

**Status:** Accepted and **implemented**. Knex is gone from `apps/worker`.
**Date:** 2026-09-07

## Update: step 1 done, 2026-09-07

The generator block, the client, the guard binding and the Dockerfile are in.
Nothing is migrated — `services/db/db.ts` is untouched and every activity still
goes through knex, which is what step 1 is for.

Two things in this ADR turned out to be wrong, and both were only visible from
a real image build.

**The output path cannot be `apps/worker/src/generated/prisma`.** This ADR said
it should, following apps/api. apps/api gets away with it because
`nest-cli.json` declares `"assets": ["generated/**/*"]` and nest copies them
into `dist`. The worker builds with plain `tsc --build`, which emits only what
it compiles, and the generated client is `.js`, `.mjs` and `.wasm` — so a
client under `src/` is simply absent from `dist/`, and the container fails at
require time. It is generated to `apps/worker/generated/prisma` instead, which
also removes the need for a copy step: `generated/` and `dist/` are both direct
children of `apps/worker`, so a relative import resolves identically from a
source file and from its compiled twin. Verified by resolving it from
`/app/apps/worker/dist/services/db` inside the built image.

**The schema has to be copied into the `builder` stage, not the manifests
stage.** The first attempt put it where apps/api puts it, and the build failed
with "Could not find Prisma Schema" — `builder` is `FROM base`, so it inherits
nothing the manifests stage copied. This is exactly the failure mode this ADR
predicted for step 1 and the reason it insisted on being its own PR.

Two smaller notes:

- **Adding `@ragenai/platform-contracts` to the worker took the four
  coordinated Dockerfile changes** that
  [`../lessons/workspace-scoped-npm-ci-nests-conflicting-versions.md`](../lessons/workspace-scoped-npm-ci-nests-conflicting-versions.md)
  describes: the manifest COPY, both `npm ci --workspace` lists, and the
  hand-maintained package build order.
- **The Prisma CLI's "Please manually install OpenSSL" message is advisory
  here.** The image has no OpenSSL and the client works: Prisma 7 with a driver
  adapter ships a WASM query compiler and no Rust engine binary, which was
  confirmed by looking for one in the built image. Do not add openssl to the
  Dockerfile to silence it.

## Update: step 3b, the JSONB merges, 2026-09-07

Three functions stay in SQL rather than becoming Prisma calls, and the reason
is worth recording because it is the one place this migration does not deliver
what it set out to.

`mergeFileMetadata`, `mergeDocumentMetadata` and `updateOptimizationJobFields`
merge a JSONB document server-side with `||` and `jsonb_set`, in one statement.
The Prisma equivalent is read-modify-write: fetch the column, spread the patch
over it in TypeScript, write it back. That introduces a lost update which
cannot happen today — two activities patching the same row, the second reading
before the first writes, one patch gone with nothing logged. The worker runs up
to 50 activities concurrently and several patch the same file's metadata, so
that is a real race and not a theoretical one.

They move from knex to `$executeRaw`, which keeps the statement and lets knex
go. `apps/web` had already reached the same conclusion for the same column —
`apply-suggestions-command` and the optimize-suggestions route write these
merges with `$executeRaw` — so this follows an existing shape rather than
inventing a second one.

**The cost, stated plainly:** the tenant-scope guard is a Prisma Client
Extension, so it cannot see inside a raw statement. For these three, the blind
spot this ADR set out to close stays open.

The substitute is `tests/architecture/raw-sql-carries-its-org-filter.test.ts`:
every raw statement touching a tenant-scoped table must name its org column,
with the table list derived from the same model map the runtime guard uses.
For a fixed set of hand-written statements that is the stronger of the two — it
fails the build rather than logging a warning nobody reads, and it names the
statement that is wrong rather than the query that happened to run. It covers
`apps/web`, `apps/api` and `apps/admin` too; all five raw statements that
already existed there pass it.

## Update: knex is gone, 2026-09-08

Steps 2, 3a–3d and 4 landed as planned. `apps/worker` has no knex dependency,
no knex connection, and 28 query functions on the shared schema.

Three functions were deleted rather than migrated, because nothing called them:
`spendCredits`, `mergeDocumentMetadata` and `getUserDocument`.

**A correction worth recording.** `createSecurityEvent` was described as having
no consumer across three of these PRs, and it does have one —
`sanitize-documents.ts` calls it as `db\n  .createSecurityEvent(…)`, split
across lines, which the `db.createSecurityEvent` grep used to find consumers
never matched. It was migrated, not deleted. The lesson is in the method: a
member call can be split across lines, so a consumer search has to allow for
that. The corrected pass also confirmed the other three really are unused.

Its enums turned out to line up exactly — the earlier note about a
`SecurityEventType`/`SecurityEventSeverity` mismatch was wrong. The signature
was loose (`eventType: string`), not incompatible, and Prisma's generated types
tighten it.

**What is not done.** `services/db/types/` still holds hand-written snake_case
row shapes and enums that Prisma also generates, and they are still imported in
about a dozen files. That is the second source of truth this ADR is actually
for, and unifying it is its own change — see the note in the step 4 PR.

Steps 2–4 are unchanged.

## Context

`apps/worker` reaches Postgres through **knex**. Every other consumer of the
database — `apps/web`, `apps/api` — uses Prisma, generated from the single
`prisma/schema.prisma` that [ADR-21](21-monorepo-and-api-decoupling.md) established as the only source of truth.

### Knex was inherited, not chosen

It arrived with `feat(worker): absorb ragen-worker into the monorepo as
apps/worker` (#807, [ADR-26](26-absorb-ragen-worker-into-monorepo.md)). The standalone `ragen-worker` repository had no
access to this schema, so knex was the reasonable choice there. The absorption
deliberately moved the code without rewriting its data layer — the right call
for a migration whose risk budget was already spent on the move itself. What it
left behind is a data layer that predates the monorepo and has no reason to
survive it.

### What the surface actually is

Measured on `main`:

|                                            |                                  |
| ------------------------------------------ | -------------------------------- |
| `apps/worker/src/services/db/db.ts`        | 741 lines, 27 exported functions |
| Files under `src/activities/` importing it | 29                               |
| Table and column names written by hand     | all of them, in snake_case       |

### The worker is not leaking today — and that is the point

The obvious argument for this change is the tenant-scope guard: it is a Prisma
Client Extension (`packages/platform-contracts` holds the model map, each app
binds it to its own client), so it cannot see a knex query at all. That sounds
like it implies a live cross-org leak in the worker.

**It does not, and the honest version of the argument is narrower.** Every one
of the 27 functions was checked: all 27 filter by `organization_id` / `org_id`.
The worker's tenant scoping is correct as written.

The difference is that `apps/web` and `apps/api` have a runtime tripwire that
says so, and the worker has 27 hand-written `where` clauses and a hope. The
28th, whenever somebody adds it under time pressure, is unguarded in a way its
equivalents in the other two apps are not. That is a real asymmetry, and it is
worth fixing before it costs something rather than after.

### The concrete cost, from this week

Phase E of the demo-environment spec added a scheduled delete of a demo
organization's stale threads. Writing it in knex meant:

- hand-writing `threads`, `messages`, `thread_documents`, `thread_id`,
  `organization_id`;
- reading `prisma/migrations/0_init/migration.sql` to discover that
  `messages_thread_id_fkey` is `ON DELETE SET NULL`, not `CASCADE`.

The spec had asserted the cascade existed. In Prisma the relation and its
`onDelete` are declarations in the file you are already looking at; in knex
they are facts about a database you have to go and check. The spec's version
would have shipped a cleanup job that emptied the thread list and silently
left every message behind, orphaned and permanently unreadable — the DEK lives
on the thread row that was deleted.

A schema change today breaks the worker at **runtime**, not at typecheck.
`npm run typecheck` cannot see a stale column name inside a knex string. A
test that executed the affected query would, and `npm run verify` does run the
suites — so the honest version is that the gap is coverage rather than
tooling. What tests exist for this layer run against a mocked knex, which
answers whatever the mock is told to answer whether or not the column is
still there. Prisma moves the same protection into `tsc`, where it applies to
all 27 functions at once instead of the ones somebody remembered to cover.

## Decision

Generate a third Prisma client from `prisma/schema.prisma` for the worker, and
migrate `services/db` onto it, function by function, until knex can be removed.

`AGENTS.md` already prescribes the mechanism — "Do not create a separate schema
for another app — add another `generator` block here instead" — so this is
applying an existing rule to the one workspace that predates it, not inventing
policy.

### Provider: `prisma-client-js`, matching apps/api

The two existing generators differ, and the difference is not cosmetic:

| Generator   | Provider           | Consumer                              |
| ----------- | ------------------ | ------------------------------------- |
| `client`    | `prisma-client`    | `apps/web` — ESM (`"type": "module"`) |
| `apiClient` | `prisma-client-js` | `apps/api` — CommonJS                 |

`apps/worker` has no `"type"` field, so it is CommonJS, and `worker.ts` uses
`require.resolve` for the workflow bundle. It follows `apps/api`:
`prisma-client-js`, output `apps/worker/src/generated/prisma`.

### Client construction follows apps/api too

`apps/api/src/prisma/prisma.service.ts` is the template: a `PrismaPg` adapter
over `DATABASE_URL`, then `$extends(createTenantScopeWarnExtension(...))` with
the app's own logger injected. The worker does the same through
`services/logger`. This is the third binding of the shared guard, which is
exactly the shape [ADR-33](33-shared-platform-contracts-package.md) intends — the model map stays in one place, each app
wires it to its own client and its own logger.

## How, in order

Each step is a separate PR and leaves the worker working.

1. **Add the generator block and the client.** Prisma alongside knex, nothing
   migrated. Includes the Dockerfile change (below), so the image is proven
   before any query depends on it.
2. **Migrate the read-only functions.** Lowest risk, and they establish the
   shape the rest follow.
3. **Migrate the writes, in groups by activity.** The ingest path last, because
   it is the hot one.
4. **Delete knex** — the dependency, `services/db/db.ts`'s connection, and the
   hand-rolled types under `services/db/types/` that Prisma now generates.

Step 1 must not be skipped or merged into step 2. The Dockerfile is where this
migration can fail in a way local development cannot reproduce: `.dockerignore`
excludes `**/dist`, package build order in worker images is maintained by hand
(see `tests/architecture/dockerfile-package-build-order.test.ts`), and
`apps/worker/Dockerfile` currently does nothing Prisma-related at all.
`apps/web/Dockerfile` shows the working pattern — `COPY prisma/schema.prisma`,
`COPY prisma.config.ts`, then an explicit `npx prisma generate`, because
`npm ci --ignore-scripts` skips the root's generate postinstall.

## Consequences

**The good, stated precisely:**

- One schema, one set of types, for every consumer of the database. A column
  rename becomes a typecheck failure in the worker instead of a runtime error
  in an ingest three days later.
- The tenant-scope guard covers the worker's queries. It still only warns —
  that is ADR-33's current design, not something this change alters — but the
  worker stops being the one place where nothing watches.
- `services/db/types/` goes away. Those interfaces are a hand-maintained
  parallel description of tables Prisma already describes, and they are the
  same drift class as the copied constant lists in
  [the copied-lists lesson](../lessons/hand-copied-lists-drift-and-typecheck-only-sees-one.md).

**The costs, not minimised:**

- 27 functions and their tests, plus 29 importing activity files. The imports
  mostly do not change — `services/db` keeps its shape and only its innards
  move — but "mostly" is doing work in that sentence and each one needs
  looking at.
- The worker image grows. The generated client for `apps/web` is 3.7 MB;
  `@prisma/engines` in `node_modules` is 26 MB, though the repository uses the
  `@prisma/adapter-pg` driver adapter, so how much of that reaches the image
  is a question for step 1 to answer rather than a number to assume here.
- The ingest path carries real risk. It is the product's busiest write path,
  and a subtle behaviour change there — a transaction boundary, a returned
  shape, a `null` where knex gave `undefined` — is worse than the drift this
  ADR is fixing. Hence "ingest last", and hence step 3 being grouped rather
  than a single sweep.

**Deliberately not decided here:** whether the tenant-scope guard should throw
rather than warn. That is a question about the whole monorepo, it has its own
backlog (`.claude/skills/ragen-tenant-scope-audit`), and answering it inside a
worker migration would make both changes harder to review.

## Alternatives considered

**Leave knex.** It works, all 27 functions are correctly scoped, and nothing is
broken today. Rejected because the cost is paid in small increments by whoever
next writes a query there — and because "the spec asserted a cascade that did
not exist" is what that cost looks like when it lands.

**Wrap knex in a generated type layer.** Derive TypeScript types from the
schema and keep knex for execution. Rejected: it is a bespoke version of what
Prisma already does, it would still be invisible to the tenant-scope guard, and
it leaves the repository maintaining two query builders and a code generator
instead of one query builder.

**Migrate the worker to `packages/db`.** The Prisma singleton package exists,
but it is built for the app's ESM environment; the worker is CommonJS and needs
its own generated client for the same reason `apps/api` does. Revisit if the
worker ever moves to ESM.
