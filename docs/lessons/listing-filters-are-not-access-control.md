---
title: 'A listing query that filters by permission is not access control — the by-id routes beside it have to check too'
modules: ['documents', 'web']
areas: ['security']
topics: ['data-scoping', 'access-control', 'idor', 'document-permissions']
---

# A listing query that filters by permission is not access control — the by-id routes beside it have to check too

**Context**: the knowledge base has a real per-file permission model — `UserFile.ownerId`, `DocumentPermission` grants to a user or a team, and team-bound folders. `getUserFilesQuery` and `getAllOrgFilesQuery` both build a wide `OR` over exactly those, so a member sees only their own files, files shared with them, files in their team's folders, and legacy unowned ones. That filtering is correct, and there are unit tests asserting the shape of the `where` clause.

**Problem**: every route that resolves a document by its id instead of listing them scoped on `organizationId` alone and stopped there — `GET /api/files/[fileId]`, `GET /api/files/[fileId]/thumbnail`, `GET /api/documents/[id]/versions`, `GET /api/documents/[id]/versions/[versionId]`, and the `POST .../rollback` beside them, plus `getFileDetailsByIdQuery`, `getDocumentByIdQuery` and `getDocumentPreviewQuery`. Ownership and `DocumentPermission` were never consulted. Verified against a live app with seeded users: a plain org `member` who owned nothing and had been granted nothing downloaded another member's private file in full, read its version history and content, and — through `rollback` — wrote a new active version of it under their own author id, which then re-indexes and changes what the assistant answers from. Cross-org and unauthenticated access were correctly refused (404/401); the hole was entirely *within* one organization, which is exactly the case the org filter cannot see. The listing hid those files from the same user at the same moment, which is what made it invisible: the UI never offers the id, so nothing in the product surfaces the gap.

**Rule**: tenant scoping and authorization are two different checks, and `where: { id, organizationId }` is only the first. For any resource with a per-user or per-team permission model, a by-id read or write must re-apply that model — the cheapest correct form is to reuse the same access predicate the listing builds, rather than hand-rolling a second one that can drift. Treat "the listing already filters this" as a statement about the listing only. And when you assert a filter, assert it against rows: a mocked-Prisma test that checks the `where` object cannot tell you whether a *different* code path reaches the same row.

**Applies to**: every route under `src/app/api/files/` and `src/app/api/documents/`, the by-id queries in `src/features/documents/services/queries/`, and any future resource that grows a `*Permission` table. `apps/web/perf/access-control.test.ts` and `apps/web/perf/idor-http.test.ts` hold the matrix; the by-id cases are marked `it.fails()` so they flip to green when the check lands.
