---
title: Document language detection and metadata
status: draft
areas: [rag, worker, knowledge-base]
adrs: [14, 16, 31]
---

# Document language detection and metadata

## TLDR

Detect each document's language at ingest time with `franc` and persist it —
one tag per document, in both Postgres (`UserFile.language`) and every one of
that document's chunks in the Qdrant payload — so multi-language
organizations get a stored, queryable language signal instead of the
pipeline's current implicit behavior, which only *preserves* language via
prompt instructions with nothing recorded anywhere. This spec covers
detection and storage only; using the tag to filter or boost retrieval is
deferred to a follow-up spec, measured per ADR-20.

## Problem

Confirmed by direct investigation of the ingest and retrieval code: no
language-detection library exists anywhere in the repo, no `UserFile` or
related model has a `language`/`locale` column (`prisma/schema.prisma`), and
no Qdrant point payload carries a language key
(`apps/worker/src/services/qdrant.ts`, `apps/web/src/libs/vector-store/qdrant-client.ts`).
The pipeline is language-*preserving* only by prompt instruction, at three
independent stages — rephrase/multi-query
(`apps/web/src/libs/chains/basic-rag/config.ts`), ADR-16 summary generation,
and the final answer prompt — each separately telling the LLM not to
translate. None of this is programmatic, and nothing is stored, so there is
no way today to know, filter, or report on what language a given document is
in.

This is a real gap for the multi-language-org case: a Polish branch under a
German HQ, company communication mostly in English, some documents in
Polish, some in English. Retrieval currently relies entirely on the
multilingual embedding model's (`bge-multilingual-gemma2`) cross-lingual
quality plus whatever the BM25/sparse half of hybrid search can match
lexically — with no stored ground truth to measure, audit, or improve that
behavior against.

## Out of scope

- Filtering or boosting retrieval by language at query time — a separate,
  measured follow-up (ADR-20) once this spec's data exists to measure
  against.
- Translating documents or chunks into a canonical language.
- UI for org-level language policy or per-folder language restriction, and
  any UI surfacing of the tag at all (e.g. a badge on the files table) —
  purely backend storage for now.
- The thread-document ingestion path (`apps/web/src/app/api/threads/services/saveDataInVectorTable.ts`,
  `initializeBasicRag.ts`, `initializePublicBasicRag.ts`) — a second,
  structurally identical but functionally separate Qdrant write path used
  only for files uploaded directly into a chat. Confirmed at investigation
  time that this path does not share code with the main ingest pipeline
  below the `VectorStoreClient` interface, so it needs its own follow-up if
  ever in scope.
- Backfilling existing documents — there is no production release yet, so
  there is no existing data to migrate. The `language` column starts `null`
  for nothing, since nothing has been ingested against it.

## Proposed solution

**Detection**: use `franc` (new dependency, `apps/worker` only — confirmed
not already present anywhere in the monorepo). It has no external-service
dependency and returns an ISO 639-3 code (or `'und'` for undetermined).

`franc` 6.x ships ESM-only (`"type": "module"`, no CommonJS build), and
`apps/worker` compiles as CommonJS (no root-level `"type": "module"`
override, `tsconfig` inherits `module: "node16"`). A static
`import { franc } from 'franc'` would throw `ERR_REQUIRE_ESM` at runtime.
This repo already has an established fix for exactly this class of
dependency (`file-type`, `meilisearch`, `@qdrant/js-client-rest`, and others
are all consumed via dynamic `await import(...)`, e.g.
`apps/worker/src/activities/files/check-mime-type.ts:11`,
`apps/worker/src/services/qdrant.ts:36`) — the new activity uses the same
`const { franc } = await import('franc')` pattern, which is free since the
activity is already async. Rejected alternatives:
- **LLM-based detection** (piggybacking on the existing ADR-16 summary
  prompt): rejected because it ties every ingest to LLM latency/cost for a
  problem a five-millisecond heuristic already solves well at
  paragraph-length input, and because it would silently break if the
  summary prompt or model ever changes shape.
- **Per-chunk detection**: rejected per the user's explicit answer — one tag
  per document. Also avoids `franc`'s well-known accuracy problems on very
  short strings (a single chunk can be a few dozen words; franc wants
  whole-paragraph input to be reliable).

**Granularity**: one language tag per document, computed once from the same
whole-document `documentText` string that `runFileEmbeddings` already builds
for `generateDocumentSummary` and `scoreDocumentForRag`
(`apps/worker/src/workflows/parse-and-embed.ts:376`) — not per-chunk. That
single value is then propagated to every chunk's Qdrant payload via
`prepareMetadata`, so a chunk-level reader (the reranker, a future retrieval
filter) sees the same tag as its parent document, but exactly one detection
call happens per document, not once per chunk.

**Storage**: both, per the user's answer — a new nullable `UserFile.language`
column in Postgres (the durable, queryable record — what an admin UI or a
future analytics query would read), and the same value spread into every
chunk's Qdrant payload via `prepareMetadata` (what retrieval-time filtering
would need, per ADR-31 — retrieval-time filtering can only ever act on what
is in the Qdrant payload, not on a value that exists only in Postgres).

**Backfill**: none. Per the user: no production release yet, so the column
starts empty by construction, not by omission.

**A design fork the investigation surfaced, resolved without re-asking**:
`Workflow.REINDEX_DOCUMENT_VERSION` (`apps/worker/src/workflows/reindex-document-version.ts`)
re-chunks and re-embeds a document after a version rollback or an accepted
optimization suggestion, but today it does **not** call
`generateDocumentSummary` or `scoreDocumentForRag` — those stay stale across
a reindex, which is an accepted existing gap (presumably for LLM cost/latency
reasons, since both are LLM calls). Language detection has no such cost —
`franc` is a synchronous heuristic — so there is no reason to accept the same
staleness for `language`. This spec adds a `detectDocumentLanguage` call to
`reindexDocumentVersion` as well, so a document's language tag always
reflects its current chunk content, unlike its summary or RAG score.

## Core surfaces touched

| Surface | Change | What catches a mistake |
|---|---|---|
| `prisma/schema.prisma` | New nullable `language String?` column on `UserFile`, next to the existing worker-detected nullable columns (`fileExtension`, `fileMimeType`, `pageCount`) | migration + `npm run verify` |
| `apps/worker` (new dependency) | Adds `franc` to `apps/worker/package.json` only — not `apps/web`, since the only other ingestion path (thread documents) is out of scope | `apps/worker`'s build/typecheck |
| `apps/worker/src/activities/documents/` | New activity `detect-document-language.ts` (+ its own `__tests__/` file), exported from the domain's activity barrel | `worker:test` |
| `apps/worker/src/activities/embeddings/prepare-metadata.ts` | `FileRecordInfo` gains an optional `language` field, spread into the returned `VectorStoreDocumentMetadata` alongside `file_name`/`file_id` | `worker:test` |
| `apps/worker/src/services/llm/types/vector-store.ts` | `VectorStoreDocumentMetadata` type gains an optional `language` field | typecheck |
| `apps/worker/src/workflows/parse-and-embed.ts` | Calls the new activity alongside `generateDocumentSummary`/`scoreDocumentForRag`, persists via a new `updateDocumentLanguage`-style activity mirroring `updatePageCount`, **and** passes the detected value into the `fileRecord` object literal (line ~409) already passed to `prepareMetadata` — this is what actually gets the tag into the Qdrant payload, not just the type change above | `worker:test`, e2e ingest scenario |
| `apps/worker/src/workflows/reindex-document-version.ts` | Same as above: calls the activity, persists to Postgres, and passes the value into its own `fileRecord` literal (line ~82) | `worker:test` |
| `apps/worker/src/services/qdrant.ts` | No code change — `addDocuments` already spreads `doc.metadata` into the payload as-is (confirmed at line 218); the new field flows through automatically once the workflow actually puts it in `fileRecord` | — |
| `packages/rag-core` | None. Confirmed at investigation time: `embedding-contract.ts` and `vector-contract.ts` standardize batching/truncation and wire-level vector constants, not payload/metadata shape — that stays owned independently by each caller | — |
| `apps/web` | None required by this spec (read-only consumer deferred to the follow-up retrieval spec) | — |

A review pass on this spec (see docs/specs workflow's "review before
implementing" step) caught that an earlier draft split phases along a
Postgres/Qdrant seam that doesn't correspond to how the code actually works:
`prepareMetadata`'s `fileRecord` parameter is built from object literals
inline in each workflow file, not from the full `UserFile` row, so a phase
that only changed the shared type (`FileRecordInfo`) without also editing
both literal call sites would compile cleanly but silently never populate
the Qdrant payload — the "leaves the app working" bar has to mean the
literal edit too, not just the type. The phases below are restructured
around the two workflows instead, so each phase's own acceptance test
(Postgres column populated, Qdrant payload populated) is actually true when
that phase is done.

## Data model

Additive-only migration, safe pre-production:

```prisma
model UserFile {
  // ...
  language String? // ISO 639-3 code detected by franc in the Temporal worker
  // ...
}
```

No backfill (per the user, there is no existing data). Rows written before
this ships simply don't exist yet. Rows written after this ships but where
detection was skipped or failed get `language = null`, which every reader
must already treat as "unknown" rather than assume is populated.

## Failure modes

- **`franc` throws or returns `'und'` (undetermined)** — the activity
  catches internally and returns `null`; the workflow does not fail, and the
  document ingests exactly as it would without this feature.
- **Input too short for reliable detection** — `franc`'s own documentation
  is explicit that very short strings produce unreliable results. The new
  activity applies a minimum-length guard (skip detection, return `null`)
  rather than trust a low-confidence call on a near-empty document.
- **Two ingest/reindex workflows race on the same `UserFile` row** — not a
  new risk class: the language value is derived fresh from that run's own
  `documentText`/`payload.content` and written via a plain update, the same
  idempotency the existing `updatePageCount`/summary-metadata writes already
  rely on.
- **Existing Qdrant collections gain a new payload key on newly-written
  points only** — Qdrant payloads are schemaless, so this is not a
  migration; older points (there are none yet, per no-backfill) simply lack
  the key, and any future retrieval-time code must already tolerate
  `metadata.language` being `undefined`.
- **Nothing reads the new field yet** — by design for this phase. The only
  risk is scope creep into building a consumer before this data has been
  observed; the follow-up spec is explicitly deferred until there's real
  language data to measure against (ADR-20).

## Phases

### Phase A — Foundations (no behavior change yet)

- [ ] **A1.** Add the `language String?` migration to `UserFile`.
- [ ] **A2.** Add `franc` to `apps/worker/package.json`.
- [ ] **A3.** Implement `apps/worker/src/activities/documents/detect-document-language.ts`:
      async, dynamically imports `franc` (`await import('franc')` — see
      Proposed solution for why static import breaks), applies a
      minimum-length guard on the input text, catches internally, returns
      `string | null`. Export from the domain's activity barrel.
- [ ] **A4.** Add the optional `language` field to `FileRecordInfo`
      (`apps/worker/src/activities/embeddings/prepare-metadata.ts`) and to
      `VectorStoreDocumentMetadata`
      (`apps/worker/src/services/llm/types/vector-store.ts`), spread into
      `prepareMetadata`'s returned object. This step alone changes no
      runtime behavior — nothing constructs a `FileRecordInfo` with
      `language` set yet — it exists so Phases B and C don't also have to
      touch these shared type/function definitions.

### Phase B — Wire into the main ingest workflow

- [ ] **B1.** In `runFileEmbeddings`
      (`apps/worker/src/workflows/parse-and-embed.ts`), call the new
      activity alongside the existing `generateDocumentSummary`/
      `scoreDocumentForRag` calls, using `documentText` (line 376).
- [ ] **B2.** Persist the result to `UserFile.language` via a new activity
      mirroring the existing `updatePageCount` pattern.
- [ ] **B3.** Pass the same detected value into the `fileRecord` object
      literal already built at line ~409 and passed to `prepareMetadata` —
      **this line is what actually gets the tag into the Qdrant payload**;
      skipping it means B2 succeeds but the payload never carries the
      field, silently defeating half the feature.
- [ ] **B4.** Test: after `runFileEmbeddings` runs for a document, both
      `UserFile.language` and the `language` key on every one of that
      document's Qdrant points are populated.

Phase B alone is a complete, working slice: every newly-ingested document
gets a language tag in both stores, exactly what the problem statement asks
for on first ingest.

### Phase C — Wire into the reindex workflow

- [ ] **C1.** In `reindexDocumentVersion`
      (`apps/worker/src/workflows/reindex-document-version.ts`), call the
      same activity using `payload.content`.
- [ ] **C2.** Persist to `UserFile.language`, same as B2.
- [ ] **C3.** Pass the value into this workflow's own `fileRecord` literal
      (line ~82), same as B3.
- [ ] **C4.** Test: after a version rollback or an applied optimization
      suggestion, the language tag reflects the *new* content, not the
      pre-edit content.

Phase C alone is also a complete, working slice — it closes the "summary
and RAG score go stale on reindex, but there's no LLM-cost reason for
language to" gap identified in Proposed solution, independent of whether B
has landed (both phases depend only on A, not on each other).

## Testing

- Unit tests for `detect-document-language.ts`, mirroring
  `apps/worker/src/activities/documents/__tests__/generate-document-summary.test.ts`'s
  structure: happy path returns the expected ISO 639-3 code; empty/whitespace
  input short-circuits without calling `franc`; input below the
  minimum-length guard returns `null`; a thrown error from `franc` is caught
  and returns `null` rather than propagating.
- Unit tests for `prepareMetadata` updated to assert `language` passes
  through into the returned metadata when present, and is simply absent
  when not.
- Package/workspace tier: `npm run worker:test` covers all of the above.
- No new e2e test required — this is a backend-only, unobservable-in-UI
  change. If useful, the existing `apps/web/evals/e2e-rag` XLSX/PDF
  scenarios could assert `UserFile.language` gets populated after ingest,
  but that's a nice-to-have, not a blocking requirement for this spec.

## Rollout and rollback

No feature flag: this is additive-only (a new nullable column, a new
payload key) and changes no existing behavior — nothing reads `language`
yet. Rollback is a plain revert; the migration is a nullable-column add, so
the down-migration is a simple column drop, safe pre-production with no data
to lose.
