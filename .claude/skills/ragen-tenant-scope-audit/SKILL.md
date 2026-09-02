---
name: ragen-tenant-scope-audit
description: Audit database queries for a missing organization scope — the cross-org IDOR class — or work through the backlog of unaudited call sites so the tenant-scope guard can be switched from warning to throwing. Use when adding a query on a tenant-scoped model, reviewing one, or investigating a data-leak report. Triggers on "IDOR", "cross-org", "tenant scope", "organizationId", "wyciek danych między organizacjami".
---

# Auditing tenant scope

Every row of customer data belongs to an organization. A query that looks a
record up by its id alone returns it to whoever asks — the id is in the URL.
That is not a style problem, it is a cross-org data leak, and it has happened
here once already: `docs/lessons/missing-org-scope-on-project-lookup.md`.

## What protects this today, and what it does not do

`apps/web/src/libs/db/tenant-scope-guard.ts` is a Prisma Client Extension
covering **19 models**. When a query on one of them runs without its org field
in `where`/`data`, it logs a warning.

Three limits worth holding in mind:

1. **It warns. It does not throw.** A repo-wide grep found roughly 200 existing
   call sites across `apps/web` and `apps/api` — too many to audit at once,
   which is why enforcement was deferred. So the guard tells you afterwards, in
   a log nobody reads during a code review.
2. **It only covers models with a direct org column.** `Message`,
   `ThreadDocument`, `DocumentPermission`, `ProjectPermission` and the
   `ThreadShare*` models are scoped through a relation, so there is no column to
   check and no warning to miss. Those need the join written correctly, with no
   safety net at all.
3. **It exists twice**, once per app, with no shared package. The two lists are
   kept identical by `tests/architecture/tenant-scope-guards-agree.test.ts` —
   add a model to one and that test tells you about the other.

## Auditing a single query

Ask, in order:

1. **Where does the org id come from?** It must be derived from the session —
   `getOrgIdFromAuthOrThrow()`, `getOrgIdFromAuth()`, `getCurrentUserId()` —
   never from an argument the client controls. A client-supplied `orgId` that is
   then used to scope the query scopes it to whatever the caller claims.
2. **Is it in the `where`, or only checked afterwards?** Fetching by id and then
   comparing `row.organizationId` works, but it is a different shape: it leaks
   existence, and it is one early return away from not working. Prefer the
   `where`.
3. **`findUnique` by id is the shape to distrust.** It cannot take a second
   condition on a non-unique column, which is how the confirmed bug happened —
   `findUniqueOrThrow({ where: { id } })` looks complete. Use `findFirst` with
   both conditions, or `findUnique` with a compound unique that includes the org.
4. **Relation-scoped models**: follow the relation to something with an org
   column and constrain that. A `Message` query scoped only by `threadId` is
   scoped by a client-supplied id.

## Working through the backlog

The goal is flipping the guard to throw. Do it per model, not repo-wide:

```bash
# every query on one model, both apps
grep -rn "prisma\.thread\.\|db\.thread\." apps/web/src apps/api/src | grep -v "/generated/"
```

For each hit, apply the four questions above; add the org condition where it is
missing, and a test that would fail without it. When a model's call sites are
all clean, that model can be moved to a throwing list ahead of the others —
which is more useful than an audit that has to finish before anything improves.

`docs/lessons/missing-org-scope-on-project-lookup.md` has the shape of a good
regression test for this: it asserts the `where` clause contains the org, so
removing the scope fails the test rather than passing quietly.

## Do not rely on the guard instead of the query

AGENTS.md is explicit: the guard logs a warning, it does not block, so getting
the `where` clause right is the actual control. Treat a warning in the logs as
a bug report, not as the guard having handled it.
