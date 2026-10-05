---
title: Answers remember the version they cited, and say when it moved
status: draft
areas: [brain, rag, knowledge-base, threads]
adrs: [20, 42, 50]
---

# Answers remember the version they cited

## TLDR

A chat answer records *which version* of a document or knowledge page it
cited, and when that version is later replaced, withdrawn or edited, the
answer is shown as "source changed since this answer" instead of silently
pointing at different text. Brain pages get revisions with the change shown
as a diff, so there is a version to point at. The non-obvious part is that
**today nothing can do this**: no chunk, citation or page carries a version.
The chunk payload has a `file_id` only. `DocumentCitation` stores
`messageId`/`fileId`. A Brain page's content is one column with no history.

## Open Questions

<!--
Hard gate (docs/specs/README.md): no code until these are answered.
-->

- **Q1. Split?** Three capabilities that are each useful alone:
  (A) citations record a version, (B) old answers flag drift, (C) Brain page
  revisions with a pending diff and an edit flow. (B) needs (A). (C) is
  independent, and the Brain spec already plans part of it (phase E,
  "edit-and-republish", not built). Proposal: **this spec = A + B; C goes into
  the Brain spec as phase E work.** Yes / no?
- **Q2. Where does the document version come from?** (a) stamp
  `document_version_id` on every chunk at embed time, so the citation records
  the version the retrieved chunk was *actually from*. Old chunks have none
  until re-embedded (the backfill question). (b) read the document's active
  `DocumentVersion` when the citation is recorded. No re-index, but it can
  name the wrong version during a re-index window, when old chunks still serve
  while the new version is already active. Proposal: **(a)**, with null
  meaning "recorded before versions were stamped" and no flag shown.
- **Q3. What counts as drift for a document?** (a) any newer active version,
  or (b) a newer version that no longer contains the cited snippet. That is
  the Brain STALE rule (`page-findings.ts:196-256`) applied to
  `DocumentRetrieval.snippet`, which is stored encrypted. Proposal: **(b)**.
  (a) flags every re-upload of the same PDF.
- **Q4. Who sees the flag, and where?** Only on the message in the thread
  (computed on read), or also a list ("answers affected by this change") on
  the document/page, for the operator? The list reads across users' threads,
  which runs into the no-impersonation decision. It is allowed only as counts,
  never message text. Proposal: **on the message only** in v1, counts on the
  page later.

## Problem

Measured in the code (2026-10-05):

- **Chunks carry no version.** `apps/worker/src/activities/embeddings/prepare-metadata.ts:79-143`
  writes `file_id`, `section_path`, `accessible_by`, `chunk_index`. Brain adds
  `brain_generation`, a publish/unpublish race counter, not a revision.
- **Citations carry no version.** `DocumentCitation` (`messageId`, `fileId`)
  and `DocumentRetrieval` (adds rank, encrypted snippet, page/regions), written
  by `record-knowledge-usage-command.ts:79-111`. `Message.metadata` holds no
  sources.
- **Brain citations are resolved live.** `get-brain-citations-query.ts:35-51`
  maps `fileId` to a page filtered on `publishedAt: { not: null }`, so an
  unpublished page's old answers lose the page and fall back to the bare
  vehicle file (Brain spec E8, unticked).
- **Nothing flags an old answer.** The only staleness logic is page-side, and
  it never touches messages. There is no saved-report or pinned-answer
  concept; the nearest is `Thread.isStarred`.
- **Brain pages have no revisions** and no content-edit path at all. Merge is
  the only content rewrite, and it refuses published pages. `publicationOutdated`
  (`get-knowledge-page-query.ts:228-231`) therefore cannot fire today.
  `KnowledgePageStatus.STALE` is never set.

So a person who copied an answer into a report has no way to learn that the
policy it quoted was replaced the week after, and nothing in the product shows
which version the answer used.

## Out of scope

- **Saved reports / pinned answers** as a new object. The flag lives on the
  message. A report feature can read it later.
- **Re-answering automatically** when a source changes.
- **Brain page revisions and editing** if Q1 = split (then Brain spec, phase E).
- **Bitemporality** (Brain spec already declines it).

## Proposed solution (sketch, to be completed after the gate)

1. **Stamp.** `prepare-metadata.ts` adds `document_version_id` (documents) and
   `page_content_hash` + page `publicId` (Brain vehicle files, from
   `UserFile.metadata.brain`) to the chunk payload.
2. **Record.** `DocumentRetrieval` / `DocumentCitation` gain nullable
   `documentVersionId` and `knowledgePageId` + `pageContentHash`, filled from
   the retrieved chunk's payload in `record-knowledge-usage-command`.
3. **Resolve against the record, not live.** Brain citations render from the
   recorded page id even when the page is unpublished. That closes E8's
   "answer loses the page" case.
4. **Flag on read.** When a thread is loaded, each citation compares its
   recorded version with the current state: newer active version without the
   snippet (Q3), page unpublished, page superseded, page content hash moved.
   The message shows "source changed since this answer" with a link to the
   diff (document versions already have a diff view at
   `knowledge/documents/[id]/diff`).

Alternatives considered:

- **Snapshot the cited text into the message.** Rejected: the encrypted
  snippet in `DocumentRetrieval` already is that snapshot. What is missing is
  the version to compare it with.
- **Flag at write time with a sweep job over messages.** Rejected: computing
  on read touches only threads someone opens, and needs no job that reads
  every user's messages.

## Core surfaces touched

| Surface                    | Change                                                         | What catches a mistake                              |
| -------------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| `prisma/schema.prisma`     | nullable version/page columns on the two citation tables       | migration + `npm run verify`                        |
| worker ingest / Qdrant     | two payload fields; old chunks lack them                       | worker tests; payload index if filtered on          |
| `packages/rag-core`        | the retrieved-chunk type carries the new fields                | package tests + web/api/worker builds               |
| thread encryption (ADR-42) | snippet comparison decrypts in the request that renders it     | encryption architecture test                        |

## Failure modes

- **Chunks embedded before the change.** No version is recorded, and the
  answer shows no flag rather than a false one.
- **A document deleted.** Its citations already cascade away with `UserFile`,
  so this is unchanged.
- **Re-index in progress.** With Q2(a), the chunk names its own version, so
  no race.
- **A flag check on a thread with many citations.** Batch by file, one query
  per thread, not per message.

## Phases (draft)

### Phase A: citations record a version

- [ ] **A1.** Payload stamping in the worker; tests on `prepare-metadata`.
- [ ] **A2.** Citation columns + recording; Brain citations resolve from the
      record (closes E8's fallback).

### Phase B: old answers say the source moved

- [ ] **B1.** Drift check on read (Q3 rule), unit-tested on the four cases.
- [ ] **B2.** UI marker on the message and a link to the diff; feature key
      `citationDrift`, default `false`.

## Testing

Unit: payload stamping, the drift rule per case, null-version rows show no
flag. Integration: answer, publish a new version without the quote, reload
the thread, and the flag appears; with the quote kept, it does not. A `p0-*`
e2e for the flag once B2 lands.

## Rollout and rollback

Additive nullable columns and payload fields. Old rows are null and render as
today. The flag is behind `citationDrift`. Rollback = key off. The columns
stay.
