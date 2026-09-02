# Tenant-Scope Guard

Moved out of `AGENTS.md` to keep that file inside Codex's 32,768-byte
instruction budget. `AGENTS.md` links here from its "Prisma (v7)" section and
from the Task Router.

## What it is

**Tenant-scope guard (warn-only)**: the guard is a Prisma Client Extension, wired into the singleton, that logs a warning (via `logger.warn`) whenever a query on a tenant-scoped model runs without its org field (`organizationId`, or `orgId` for `DocumentCitation`) present in `where`/`data`. It covers ~20 models with a direct org column (`Thread`, `Project`, `UserFile`, `DocumentFolder`, `McpConnector`, etc. — see the file for the full list); it does **not** cover models scoped only via a relation (`Message`, `ThreadDocument`, `DocumentPermission`, `ProjectPermission`, `ThreadShare*`) since there's no column to check. It **warns, it does not throw** — a repo-wide grep found ~200 existing call sites across `ragen-app` and `apps/api`, too many to audit in one pass; flipping to hard enforcement is deliberate future work once the warning logs are clean. The model map and the predicate now live in `@ragenai/platform-contracts` (ADR-33); `src/libs/db/tenant-scope-guard.ts` and `apps/api/src/prisma/tenant-scope-guard.ts` are thin bindings that wrap them in each app's own `Prisma.defineExtension` — do not re-declare the model map. See `docs/lessons/missing-org-scope-on-project-lookup.md` for the one confirmed real bug this already caught.

## Where the pieces live

| Piece | Where | Why there |
|---|---|---|
| `TENANT_SCOPED_MODELS`, `isTenantScopeSatisfied()` | `packages/platform-contracts/src/tenant-scope/` | web and api must agree on which models are scoped and on the column each uses; neither needs Prisma to answer that (ADR-33) |
| The Prisma Client Extension | `apps/web/src/libs/db/tenant-scope-guard.ts`, `apps/api/src/prisma/tenant-scope-guard.ts` | `Prisma.defineExtension` needs each app's own generated client, and each app has its own logger |

Do not re-declare the model map in an app —
`tests/architecture/shared-contracts-are-not-recopied.test.ts` fails if you do.
The package's own tests check every entry against `prisma/schema.prisma`, so a
model renamed in the schema fails there rather than silently dropping out of the
guard's coverage.

## Adding a model to the map

1. Confirm the model has a **direct** org column. A model scoped only through a
   relation has nothing for this guard to check — add it and the guard reports
   a violation on every query.
2. Add it to `TENANT_SCOPED_MODELS` in the package, with the column name
   (`organizationId`, or `orgId` for `DocumentCitation`).
3. Run `npm run packages:test`. The schema cross-check tells you immediately if
   the model or the column is spelled wrong.

## Related

- [ADR-23](adrs/23-tenant-scope-guard.md) — why the guard warns instead of throwing
- [ADR-33](adrs/33-shared-platform-contracts-package.md) — why the map is shared
- [`lessons/missing-org-scope-on-project-lookup.md`](lessons/missing-org-scope-on-project-lookup.md) — the one confirmed real bug it has caught
- [`.claude/skills/ragen-tenant-scope-audit/SKILL.md`](../.claude/skills/ragen-tenant-scope-audit/SKILL.md) — working through the unaudited call sites
