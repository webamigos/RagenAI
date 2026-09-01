---
title: 'Missing organizationId on a findUnique-by-id query is a cross-org IDOR, not just a style nit'
modules: ['projects']
areas: ['architecture', 'security']
topics: ['data-scoping', 'access-control']
---

# Missing organizationId on a findUnique-by-id query is a cross-org IDOR, not just a style nit

**Context**: `getProjectByIdOrThrowQuery(id)` in `src/features/projects/services/queries/get-project-query.ts` looked up a `Project` by its internal numeric `id` alone, then `select`ed fields including `accessToken` (the project's public-sharing token) and its full thread list. Two callers used it: `getProjectStorageInfo` (`src/app/actions/index.ts`) and the upload route (`src/app/api/upload/route.ts`).

**Problem**: neither the query nor `getProjectStorageInfo` checked that the returned project belonged to the caller's organization — any authenticated user could pass an arbitrary `projectId` and receive another org's real storage usage/limits, project title, and thread list. The upload route did check `projectRecord.organizationId !== orgId` afterwards and returned a 403, but only after already fetching the foreign org's full record. `getPublicProjectQuery` in the same file is a different, *intentionally* unscoped case — it resolves org from a public `accessToken`, which is the point of that endpoint.

**Rule**: a `findUnique`/`findUniqueOrThrow` by internal ID is not automatically safe just because the ID isn't guessable — always add the tenant-scoping field (`organizationId`) as an explicit second `where` key unless the lookup is deliberately public (and if so, name/document why, the way `getPublicProjectQuery` does). Prisma supports non-unique filters alongside a unique key in the same `where` (`{ id, organizationId }`) — there's no need to fetch first and check after.

**Applies to**: any `db.<model>.findUnique*`/`findFirst*` call on a model in `src/libs/db/tenant-scope-guard.ts`'s `TENANT_SCOPED_MODELS` list. The guard now logs a warning (not a throw) when this field is missing — check the logs, don't wait for a live report.
