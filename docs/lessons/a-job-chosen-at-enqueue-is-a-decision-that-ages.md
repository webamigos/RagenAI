---
title: 'A job chosen when it is enqueued is a decision that ages in the queue'
modules: ['worker', 'web']
areas: ['architecture', 'rag']
topics: ['document-versions', 'reindex', 'bullmq', 'race', 'runFileEmbeddings']
---

# A job chosen when it is enqueued is a decision that ages in the queue

**In short**: A re-embed picks between two jobs from the document's active version: re-parse the stored upload, or embed the edited version's text. Every producer read the version and then enqueued, so an edit made while the job waited was overwritten in the index by the original upload. The choice now travels as intent (`keepActiveVersion`) and the handler makes it again when it starts. It cannot be made unconditionally in the handler: a Drive sync starts the same job after replacing the stored file, and there the re-parse is the point.

**Context**: writing `reindex-organization.ts`, an operator command that re-indexes every file after an embedding-model change (appliance spec, C4). It plans all of an organization's files, then starts their jobs, so the gap between reading a file's active version and its job running can be hours. A reviewer pointed at that gap.

**Problem**: the gap was not the command's. `startFileReindexCommand` — the single-file action, the bulk Reprocess and the folder PII-policy re-embed — and `reindex-for-context.ts` all decide the same way: read `changeType` of the active version, start `runFileEmbeddings` if it is `UPLOAD`. `runFileEmbeddings` re-parses the stored file, which still holds the original upload (AGENTS.md, "Document Versions"). An edit, an optimization or a rollback that becomes active before the job runs is then replaced in search by text the document no longer shows. Nothing fails: the file reads COMPLETED.

The first fix proposed was a guard in the handler: "active version is not the upload, so do not parse". That is wrong for the Drive sync, which writes new upstream content to the stored file and starts the same job on a document someone may have edited in Ragen. Unconditionally, the sync would re-embed the old edit and drop the new content.

**Rule**: when a producer chooses between jobs from state that can change, send the intent and let the handler choose again when it runs. And before putting a guard in a shared handler, list every producer of its job: the one with the opposite intent is the one the guard breaks.

**How to apply**: `RunFileEmbeddingsPayload.keepActiveVersion` is set by producers that change no content, and left unset by producers that bring new content. A new producer of `runFileEmbeddings` has to decide which it is. `parse-and-embed-keeps-active-version.test.ts` holds both sides.
