# Re-indexing an organization for contextual chunks

`contextualChunks` adds a context prefix to chunks **at ingest**
([spec](../specs/2026-09-29-contextual-chunks.md)). Turning the key on for an
organization changes nothing already in its index: only files ingested or
re-indexed afterwards carry the prefix. This is how an operator brings the rest
of the organization up to date.

## Before you start

- Turn `contextualChunks` on for the organization in apps/admin. The script
  refuses an organization with the key off, because a re-index would write no
  prefix.
- Point the shell at the environment: `DATABASE_URL`, `REDIS_URL`,
  `QDRANT_URL` and `QDRANT_API_KEY`. The jobs go to that environment's queue
  and run on its workers.

## 1. See where the organization stands

```bash
npx tsx --env-file=.env.local apps/worker/src/scripts/reindex-for-context.ts --org <organizationId> --dry-run
```

It prints the files per `context_version`, read from Qdrant, and what it would
start. A file's version is the lowest over its body chunks, where a chunk with
no `context_version` is `0 (none)`. The summary chunk is never prefixed and is
not counted.

## 2. Start the re-index

```bash
npx tsx --env-file=.env.local apps/worker/src/scripts/reindex-for-context.ts --org <organizationId> --limit 50
```

- **A file nobody edited** is re-ingested with `runFileEmbeddings`, which
  re-parses the stored upload.
- **A file whose active version is an edit, an optimization or a rollback**
  goes through `reindexDocumentVersion` instead. The stored file still holds
  the original upload, and re-parsing it would put the reverted text back
  into retrieval.
- Nothing is overwritten. Each file's ingest status is reset to
  `NOT_STARTED` before its job starts, so a file that was once cancelled can
  record the new run.

`--limit` bounds how many jobs one run starts. The jobs join the ordinary
ingest queue, where the Docling ceiling (`DOCLING_MAX_CONCURRENCY`) bounds them
as it bounds a large upload. They still compete with the organization's own
uploads, though, so a large organization is better done in batches.

## 3. Check it moved

The jobs run after the script exits. When the knowledge base shows them done,
run step 1 again: the files should have moved from version 0 to the current
version. A file still at 0 either failed to ingest (its status says so in the
knowledge base) or has no row in the database. The script counts those as
skipped and cannot re-index them.

## Turning the key off again

New ingests stop adding a prefix. Chunks that already have one keep it until
they are re-indexed. Nothing removes the prefixes in bulk, and nothing has to:
`pageContent` is the bare chunk either way, and the prefix only changes what
was embedded.
