---
title: 'A migration and schema.prisma can drift apart, and until now nothing compared them'
modules: ['db', 'ci']
areas: ['architecture', 'ci']
topics: ['prisma', 'migrations', 'enums', 'indexes', 'better-auth', 'drift', 'fail-open']
---

# A migration and schema.prisma can drift apart, and until now nothing compared them

**Context**: `prisma migrate diff --from-migrations prisma/migrations
--to-schema prisma/schema.prisma` on `main` (October 2026) proposed five
statements with no schema change at all: drop `accounts_issuer_account_id_idx`,
drop the default on `document_versions.id`, and drop three lead enum types.
Anyone running `prisma migrate dev` for an unrelated change would have had them
folded into their migration — including dropping an index Better Auth needs on
every social sign-in.

**Problem**: three separate hand-edits, each invisible to every check we ran:

- **A `DROP ... IF EXISTS` under the wrong name is a silent no-op.**
  `20260831120000_remove_leads` dropped `"LeadEnrichmentStatus"` and friends —
  the Prisma enum names. The types had been created under their `@@map` names
  (`lead_enrichment_status`, …), so all three drops matched nothing, reported
  success, and the types outlived their tables by a month.
- **An index added in SQL and not in the schema is one `migrate dev` from being
  dropped.** The Better Auth 1.7 migration created `(issuer, account_id)` — the
  pair `findAccountByKey` and `findAccountOwnerByKey` filter on — but the model
  never declared it. Here the migration was right and the schema wrong.
- **A hand-written `DEFAULT` the schema does not mention.** `document_versions`
  got `DEFAULT gen_random_uuid()`; `@default(uuid())` is client-side, and no
  other UUID key in the schema has a database default. Here the schema was right.

`migrate deploy` applies SQL; it never checks the result against the schema.
`prisma generate`, typecheck and the test suites read only the schema. So a
migration can say anything, and the first tool to notice is the next developer's
`migrate dev`.

**Rule**: when a migration is written or edited by hand, the schema is the
contract and the migration must produce exactly it — check with `migrate diff`
on a throwaway database, never on the local `ragen` DB, which has diverged. Drop
Postgres types by their `@@map` name. When fixing drift, decide per item which
side is right from the history (who added it, and does a library query depend on
it) rather than accepting whatever the diff proposes.

The E2E workflow now runs
`prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
right after `migrate deploy`, so a drifting PR fails `test-e2e` instead of the
next person's migration.

**Applies to**: any change under `prisma/migrations/`, especially hand-written
SQL (partial indexes, defaults, backfills, drops) and migrations for tables a
library owns.
