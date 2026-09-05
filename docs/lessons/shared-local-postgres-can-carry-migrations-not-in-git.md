---
title: 'A shared local Postgres can carry schema from another in-progress feature branch, absent from your branch''s migration history'
modules: ['worker', 'web', 'db']
areas: ['architecture']
topics: ['prisma', 'migrations', 'git-worktrees', 'local-development', 'postgres']
---

# A shared local Postgres can carry schema from another in-progress feature branch, absent from your branch's migration history

**Context**: implementing a Prisma migration (adding a `CANCELLED` enum value and a
`workflowId` column to `UserFile`) in a git worktree checked out from `main`, while a
second, unrelated session worked on i18n translations in the primary checkout. Both
point at the same `.env.local` `DATABASE_URL` — `ragen-postgres` on `localhost:55432`
is one Docker container shared by the whole machine, not one per worktree or branch.

**Problem**: `prisma migrate dev` refused to apply the new migration and reported
drift: the live database already had tables, enum values and indexes (a
`CreditLedgerReason`/`CreditOperation` enum, `credit_ledger_entries`,
`org_credit_balances`, extra `AiUsageStep` variants) that exist in neither
`schema.prisma` nor the migrations directory on `main`. Prisma's own fix for drift is
`prisma migrate reset` — which drops and recreates the whole `public` schema. Running
that would have destroyed someone else's in-progress local schema work (matching this
repo's active credits-system and lead-scoring features) that happened to live only in
that shared database, never committed.

**Rule**: before resolving a `migrate dev` drift warning by resetting, check whether
the drift is actually **yours to fix** — a git worktree isolates the *working tree*,
not shared runtime infrastructure it's still pointed at (the same Postgres, Redis,
Qdrant, etc. from `docker compose`). If the drift comes from unrelated schema you don't
recognize, stop and ask; do not run `migrate reset` on a database you don't fully
control. When your own migration is additive and independent of the unrecognized
drift, `prisma db execute --file <your-migration.sql>` applies just your SQL directly,
without touching migration-history bookkeeping or resetting anything — the database
stays "drifted" from Prisma's perspective (that predates your change and isn't yours to
resolve), but your feature is testable without risking anyone else's data.

Two smaller things learned getting to this point:

- A git worktree does not copy gitignored files — `.env.local` has to be copied in
  manually (`cp <primary-checkout>/.env.local <worktree>/`) before any Prisma or
  Next.js command that reads it will work.
- `prisma.config.ts` here reads `process.env.DATABASE_URL` directly; only
  app-specific bootstraps (`scripts/load-root-env.mjs`, `tsx --env-file=.env.local`)
  actually load `.env.local` into `process.env`. A bare `npx prisma migrate dev` needs
  `DATABASE_URL` exported into the shell first, or it fails with "Connection url is
  empty" even though the file is right there.

**Applies to**: any Prisma migration authored in a worktree, and more generally to any
command in a worktree that touches shared local infrastructure (the Postgres/Redis/
Qdrant containers, LiteLLM, Docling) rather than files — worktrees isolate git state,
not running services.
