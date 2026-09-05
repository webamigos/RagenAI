---
title: 'A storage download streamed straight to destPath leaves a truncated file that a retry mistakes for a complete one'
modules: ['storage', 'worker']
areas: ['architecture']
topics: ['temporal', 's3', 'streaming', 'atomicity', 'retries', 'silent-corruption']
---

# A storage download streamed straight to destPath leaves a truncated file that a retry mistakes for a complete one

**Context**: A code review of `apps/worker` (prompted by evaluating BullMQ as a
Temporal replacement, then deciding to stay on Temporal per
[ADR-07](../adrs/07-temporal-document-processing.md)) looked at
`packages/storage`'s `downloadToFile` — the path every ingest activity uses to
pull a document from S3/R2/Scaleway onto local disk before parsing it.

**Problem**: both `S3StorageProvider.downloadToFile` and
`LocalStorageProvider.downloadToFile` wrote (streamed or copied) directly onto
`destPath`. `apps/worker/src/services/ensure-local-file.ts`'s `ensureLocalFile`
— called by every activity that needs the file, per its own comment, because
activities can land on different worker pods across retries — treats
`fs.existsSync(localPath)` as the sole signal that the file is present and
complete, then skips downloading again. If the stream failed partway (an
activity's `startToCloseTimeout` firing mid-download for a large file, or a
worker pod restarting), `destPath` already existed with partial bytes. A retry
on the *same* host (not even a different pod — just the next activity
invocation) would see `existsSync() === true`, skip the download, and silently
parse/embed the truncated content. Nothing in the pipeline surfaces this: no
error, no size check, no checksum — just quietly wrong data reaching Qdrant.

**Rule**: any storage provider method that streams or copies into a path a
caller will later treat as "exists ⇒ complete" must write to a temporary path
in the same directory first, then `rename()` onto the real path only after the
write fully succeeds — `rename()` within one directory is atomic, so the final
path only ever appears once the content is whole. Writing "mostly there" is not
an acceptable intermediate state for anything gated by an existence check. This
applies symmetrically to both providers even though only the S3 one streams —
`fs.copyFile` is not guaranteed atomic either, and the two providers are meant
to be interchangeable (ADR-27).

**Applies to**: `packages/storage`'s `downloadToFile` on both providers (now
fixed to write-temp-then-rename); any future storage provider added to the
same interface; and any other place that treats "a file/row/key exists" as
"the write behind it fully completed" — the same shape of bug (a partial write
observable as if complete) can recur anywhere a multi-step write isn't made
atomic at its boundary.
