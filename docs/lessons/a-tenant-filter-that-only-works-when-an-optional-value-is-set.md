---
title: A tenant filter built from an optional value is not a filter — Prisma drops the clause and the endpoint answers for every organization
modules: [api]
areas: [security]
topics:
  [
    idor,
    data-scoping,
    prisma,
    api-keys,
    undefined-is-not-a-filter,
    dead-column,
    false-green,
  ]
---

## Context

`GET /v1/files` and `GET /v1/files/{id}` in `apps/api` were written on a stated
assumption, in a comment above the query: _"the API key's project scope is the
sole filter we need; there is no cross-project visibility on this endpoint."_
So the `where` clause named `projectId: context.projectId` and nothing else —
no `organizationId`, although `UserFile` has one and it is required.

The assumption was reasonable on paper. `ApiKey.projectId` exists, `ApiKeyGuard`
reads it, and `ApiContext` carries it.

## Problem

`ApiKey.projectId` has never been written. The column exists, the guard reads
it, `createApiKeyCommand` even accepts a `projectId` argument — but the server
action that calls it, `createApiKey(name, debugMode)`, does not pass one and the
panel form has no field for it. Every API key in the product has a null project,
so `context.projectId` is always `undefined`.

Prisma treats `undefined` as "this filter was not supplied" and omits the
clause. With the only clause omitted, the query became `findMany({})`:

**`GET /v1/files` returned every file row in every organization to any valid API
key**, and `GET /v1/files/{id}` resolved any file id regardless of who owned it.
Metadata only — file names, sizes, timestamps, statuses — because there is no
content-download route and `DELETE` scopes by `organizationId` correctly.

Nothing actually leaked, and for a reason that is worth naming: the endpoint
needs a valid API key, and no key has ever been issued — not in production
(there is none) and not on demo. The same absence that caused the bug is what
kept it harmless. It would have started leaking on the first key anyone created,
which in this case was the very next task in the queue.

Three things kept it invisible:

- The unit tests build an `ApiContext` with `projectId: 'proj-1'`, a shape
  production has never had, and assert `where` equals `{ projectId: 'proj-1' }`.
  Green, and testing a configuration that does not exist.
- The comment asserted the invariant instead of the code enforcing it, so a
  reader checking "is this scoped?" found a sentence saying yes.
- `tenant-scope-guard` only warns, and it lives in `apps/web`.

It surfaced sideways: while specifying an unrelated change (making the key carry
its assistant), the finding "nothing ever writes this column" was recorded as
evidence that the column was inert. It was not inert. It was the only filter on
an endpoint.

## Rule

A `where` clause assembled from an optional value is not a tenant filter — under
Prisma an absent value removes the restriction rather than matching nothing.
Write the tenant scope unconditionally and let the optional value narrow within
it:

```ts
where: {
  organizationId: context.orgId,
  ...(context.projectId ? { projectId: context.projectId } : {}),
}
```

Two corollaries, both of which cost more than the fix:

- **A dead column is not a harmless column.** "Nothing writes it" is a finding
  about writers. Grep its _readers_ before concluding anything is inert, and
  check what each reader does when it reads null.
- **A test fixture that supplies a value production never has will pass on the
  bug.** When a field is optional, the case worth asserting is the one where it
  is absent — that is the shape every live caller has.

## Applies to

Every query in `apps/api` against a tenant-scoped model, and any `where` built
by spreading or interpolating an optional. The `ragen-tenant-scope-audit` skill
covers the backlog; `docs/tenant-scope-guard.md` covers the guard that warns.
