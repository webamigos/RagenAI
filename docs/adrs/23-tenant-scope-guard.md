# ADR-23: Warn-Only Tenant-Scope Guard

**Status:** Accepted
**Date:** 2026-08-31

## Context

Ragen is multi-tenant: nearly every table carries an `organizationId`, and correctness depends on every query filtering by it. That filtering is done by hand at roughly 200 Prisma call sites across ~20 models in ragen-app and apps/api, and a review found the pattern is genuinely inconsistent:

1. Sometimes `organizationId` is a mandatory top-level key in the `where` clause.
2. Sometimes it is conditionally spread, and silently omitted when the caller's context happens to be undefined.
3. In at least one confirmed case it was **missing entirely**: `getProjectByIdOrThrowQuery(id)` looked a project up by numeric ID with no org filter, letting any caller fetch any organization's project — including its public `accessToken`. It was reachable from `getProjectStorageInfo` (leaking another org's storage usage and limits for a guessed `projectId`) and from `/api/upload`.

No automated guard existed: a grep for `$extends` / `$use` across both apps returned zero hits. ADR-21 already documents this same bug class being found and patched ad hoc during the NestJS port, which is evidence the problem recurs rather than being a one-off.

`AGENTS.md` states the rule ("Scope all user-data queries by `organization_id`"), but a rule that is only written down is enforced by reviewer attention, and reviewer attention is exactly what fails on the 150th call site.

## Decision

### 1. A Prisma Client Extension that warns, never throws

A `$extends`-based query interceptor logs a structured warning whenever a query on an allowlisted tenant-scoped model runs without its org field present — as a **defined, non-`undefined`** value — in the relevant part of `args`.

It does not throw. With ~200 existing call sites and no audit of them, hard enforcement would risk taking down working paths in production for the sake of a rule the codebase does not yet fully satisfy. The guard's job in this iteration is to _find_ the violations, not to punish them.

### 2. Coverage is limited to models with a direct scoping column

`TENANT_SCOPED_MODELS` maps 20 models to their column: 19 use `organizationId`, and `DocumentCitation` is the one naming outlier at `orgId`.

Models scoped only through a relation are **explicitly not covered** and are documented as such in the source: `Message` and `ThreadDocument` (via `Thread`), `DocumentPermission` (via `UserFile`/`DocumentFolder`), `ProjectPermission` and `ProjectSettings` (via `Project`), `Lead` and `LeadEnrichmentJob` (via `LeadList`), `ThreadShare` and `ThreadPublicLink` (via `Thread`). The guard has no column to inspect on those, so a missing scope there is invisible to it. Pretending otherwise would be worse than the documented gap.

> **Update 2026-08-31:** `Lead`, `LeadEnrichmentJob` and `LeadList` were removed
> with the leads feature later the same day. `TENANT_SCOPED_MODELS` therefore
> maps 19 models, not 20, and the relation-scoped exclusion list no longer
> includes the `Lead*` models. The reasoning above is unchanged.

### 3. `undefined` counts as a violation

Prisma treats `{ organizationId: undefined }` as "no filter at all", not "match null" — the single most dangerous way to write this bug, because the key is present and the code reads as correct. The predicate therefore requires the field to be present _and_ not `undefined`.

### 4. Operations are checked where the scope would actually live

`where` for the read/update/delete family, `data` for `create`, every item of `data` for `createMany`, and all of `where`/`create`/`update` for `upsert`. Operations the guard doesn't understand (raw queries) return "not applicable" rather than being reported as violations.

### 5. The one confirmed bug is fixed in the same change

`getProjectByIdOrThrowQuery` takes an `orgId` and filters on it. `getPublicProjectQuery` in the same file is left untouched — it is an intentional cross-tenant lookup by public `accessToken`, a different auth surface. `/api/upload` keeps its existing `403` response by catching the now-thrown not-found, and its redundant manual `!==` check is removed.

### 6. Mirrored, not shared

The guard exists independently in both `src/libs/db/tenant-scope-guard.ts` and `apps/api/src/prisma/tenant-scope-guard.ts` (NestJS `Logger` instead of Pino). There is no shared package infrastructure between the two, matching the existing convention for small duplicated files.

## Consequences

### Positive

- **The bug class becomes visible** instead of being found by audit or by a customer.
- **A real IDOR is closed**, and it is closed at the query layer rather than by another manual check at one call site.
- **Zero blast radius.** Warn-only cannot break a working path, so it can ship without auditing 200 call sites first.
- **Cheap to act on.** Warnings carry the model and operation, so violations can be fixed incrementally.

### Negative

- **It prevents nothing today.** A missing scope still returns cross-tenant data; the guard only records that it happened. Hard enforcement is deferred, and until it lands the security property rests on the same manual discipline as before.
- **Relation-scoped models are a real blind spot**, and it is a meaningful one: `Message` holds chat content.
- **Log noise is likely at first**, in proportion to how many of the ~200 call sites are non-compliant. If the volume is high, the temptation will be to mute the guard rather than fix the callers.
- **A small per-query cost** on covered models, and `src/libs/db/index.ts` / `PrismaService` now expose the extended client type, which propagates to consumers.

## Key files

| File                                                          | Purpose                                             |
| ------------------------------------------------------------- | --------------------------------------------------- |
| `src/libs/db/tenant-scope-guard.ts`                           | Allowlist, pure predicate, extension factory        |
| `src/libs/db/index.ts`                                        | Wraps the singleton with the guard                  |
| `apps/api/src/prisma/tenant-scope-guard.ts`                   | Mirrored guard for the NestJS app                   |
| `apps/api/src/prisma/prisma.service.ts`                       | Wraps `this.client` with the guard                  |
| `src/features/projects/services/queries/get-project-query.ts` | The fixed IDOR (`getProjectByIdOrThrowQuery`)       |
| `src/app/api/upload/route.ts`                                 | Preserves the existing 403 via the org-scoped query |
| `docs/lessons/missing-org-scope-on-project-lookup.md`         | The lesson entry for the underlying bug             |
