---
title: 'A shared cleanup helper that reads the session fails silently for every secret-authenticated caller'
modules: ['web']
areas: ['architecture', 'security']
topics: ['data-retention', 'better-auth', 'internal-api', 'vector-store', 'silent-failure', 'idor']
---

# A shared cleanup helper that reads the session fails silently for every secret-authenticated caller

**Context**: `deleteFileCommand` is the one path every file delete goes
through — the knowledge-base delete, the project-scoped delete, the bulk
action, the folder cascade, and the internal `/api/v1/files/[fileId]` route
that `apps/api` calls for the public `DELETE /v1/files/:id`. It does the row,
the S3 object, the thumbnail, the `UserDocument` and the vectors.

**Problem**: the vectors were never deleted on the API path, and every caller
saw a successful delete.

`deleteFileFromVectorStore` opened with
`const orgId = await getOrgIdFromAuthOrThrow()` — it re-derived the
organisation from the Better Auth session instead of taking the one its caller
had already validated. The internal route authenticates on the
`x-internal-secret` shared secret and has no session at all, so that threw
`Organization ID is required`, `deleteFileCommand`'s `catch` logged a
`logger.warn`, and the function returned `deleted: true`. The HTTP response was
`200 {deleted: true}`.

Measured while running the RAG benchmark: eight files deleted that way, all
200, `user_files` down to 0 rows, and all 34 of their chunks still in the
Qdrant collection — so the documents kept being retrieved and cited in answers
after the user had deleted them.

Three things kept it invisible. The UI path works (it has a session), so manual
testing never reproduced it. The failure was a `warn`, not an `error`, on a
line that reads like best-effort cleanup. And no test asserted what
`deleteFileFromVectorStore` was called *with* — only that it was called.

**This was a recurrence.** The same file had already been corrected for the
same mistake one block earlier: `deleteDocumentFromDbCommand` used to read the
session too, and its comment now says "A session read could only fail, and the
failure was silent". The fix was applied to one of the two neighbouring calls.

**Rule**: internal cleanup that runs *after* an operation was authorized takes
the already-validated `organizationId` as a parameter. It must never re-derive
identity from the session — the session is an input to authorization, not to
the work that follows it, and a caller authenticated some other way has none.
Make the parameter required so the compiler finds every call site.

Corollary on severity: a cleanup failure that leaves user content retrievable
after a delete is a data-retention problem, not a best-effort nicety. Log it at
`error` with the file and org named. A `warn` on that line is why this sat
unnoticed.

**Applies to**: anything imported across a feature boundary to do cleanup —
`deleteFileCommand`, `deleteFolderCommand`, `update-document-command`, and any
new helper reached from both a Server Action and `src/app/api/v1/*`. Grep a
shared helper for `getOrgIdFromAuth` / `getCurrentUser` before calling it from
a route that authenticates on a secret.
