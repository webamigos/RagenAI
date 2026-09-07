# ADR-40: The Worker Uses Prisma, From the Same Schema as Everything Else

**Status:** Accepted, not yet implemented. The migration is phased and each
phase is independently revertible; nothing here changes behaviour on its own.
**Date:** 2026-09-07

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
`npm run verify` cannot see a stale column name inside a knex string.

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
