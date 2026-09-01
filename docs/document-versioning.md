# Document Versions & RAG Optimization

Two features that depend on each other: versioning is the substrate, and the
optimizer is the first thing besides a manual edit that writes to it. Ticket
CU-86b9h9vdu; shipped as PR #824 (versioning) and its follow-up (optimization).

## Versioning

`DocumentVersion` records content + title (+ a metadata snapshot) per change,
numbered per document. `change_type` is one of `UPLOAD`, `MANUAL`,
`AI_REWRITE`, `AI_OPTIMIZE`, `ROLLBACK`.

- **v1 comes from ingest.** `createInitialDocumentVersion` runs in
  `parse-and-embed` after the document row exists, carrying the RAG score the
  scorer just produced. It is idempotent — Temporal replays the workflow — and
  best-effort *after* retries: a document with embeddings and no v1 is still
  usable, and `src/scripts/seed-document-versions-v1.ts` backfills.
- **Rollback appends.** Restoring version N writes a new version with N's
  content, so history is never rewritten and a rollback can be undone.
- **One active version, enforced in Postgres** by
  `document_versions_one_active_per_document`, a partial unique index. The
  active version is what the vector store mirrors, so two of them is a silent
  correctness failure rather than a cosmetic one.
- **Version numbers are allocated under a row lock** on the parent document.
  Reading the highest number inside the transaction is not enough under
  read-committed: two concurrent saves both read N and both write N+1.
- **`organization_id` is denormalised onto the version**, and the foreign key is
  composite `(document_id, organization_id)`. `tenant-scope-guard.ts` only
  covers models with a direct org column, and keyed on the document alone a
  version's tenant could drift from its document's while every filter still
  passed.

## Re-indexing after a content change

**Use `Workflow.REINDEX_DOCUMENT_VERSION`.** Two things that look like
alternatives are not:

- `runFileEmbeddings` downloads and re-parses the *stored file*, which still
  holds the original upload. After a rollback it re-indexes the version the
  user just reverted.
- Overwriting the stored file with the new text so `runFileEmbeddings` picks it
  up destroys the user's original whenever it is not already plain text —
  UTF-8 written under `<id>.pdf` is a PDF that no longer opens.

`reindexDocumentVersion` embeds the version's text and **deletes the file's
chunks first**. Qdrant point ids are random uuids, so an upsert cannot replace
an earlier ingest; without the delete, both versions live in the collection and
retrieval cites reverted text. It refuses empty content rather than emptying
the index, and marks the embedding `FAILED` if it breaks after the delete —
visible in the UI, and recoverable by re-running.

## RAG optimization (Suggest & Accept)

`optimizeDocument` (Temporal) generates candidate edits against the same rubric
as the scorer, then evaluates each one per scoring dimension with a separate
model call. The UI polls `optimization-job` because a long document takes
minutes.

The job lives in `UserDocument.metadata.optimizationJob`. Suggestions the user
has not decided on survive a new run, so a fresh analysis does not discard work
in progress.

Two properties worth preserving:

- **Applying is driven by ids.** `applySuggestionsCommand` reads the
  `before`/`after` bodies from the stored job, never from the request. A version
  stamped `AI_OPTIMIZE` should contain what the model proposed.
- **A suggestion that no longer matches is reported, not skipped.** Suggestions
  apply in sequence, so an earlier one can consume the text a later one was
  written against. The command counts what actually landed and drops the stale
  ones from the job — telling someone their change was applied when it was not
  is worse than telling them it went stale.

`applySuggestions` uses a *function* replacement. `String.replace` treats `$&`,
`` $` ``, `$'` and `$1` in a string replacement as substitution patterns, and
`after` is model-generated prose that can contain a `$`.

## Known gap

Qdrant point ids are `uuidv4()`, so an activity retry after a partial
`addDocumentsToVectorStore` duplicates chunks. This predates both features and
affects every ingest path; deterministic ids derived from file + chunk identity
would fix it, and that is a change to shared code worth doing on its own.
