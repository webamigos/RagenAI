---
title: Document language detection and metadata
status: draft
areas: [rag, knowledge-base, worker]
adrs: [14, 16, 31]
---

# Document language detection and metadata

## TLDR

Detect each document's language at ingest time and persist it (Postgres and
the Qdrant payload), so multi-language organizations — e.g. a Polish branch
under a German HQ communicating in English — get a stored, queryable language
tag instead of the pipeline's current implicit behavior, which only
*preserves* language via prompt instructions with nothing recorded anywhere.
This spec covers detection and storage only; using the tag to filter or boost
retrieval is deferred to a follow-up spec, measured per ADR-20.

## Open Questions

- **Q1.** Detection method: a lightweight heuristic library (e.g. `franc`) run
  in the worker at ingest, or an LLM-based detection that extends the existing
  ADR-16 summary-generation prompt to also emit a language code (no new
  dependency, likely more accurate on short or mixed-language documents, but
  adds a little cost/latency to an already-running call)?
- **Q2.** Granularity: one language tag per document (`UserFile`-level,
  matching ADR-16's whole-document summary granularity), or per-chunk (more
  correct for genuinely bilingual documents, e.g. a contract with parallel
  Polish/English columns, but multiplies detection cost by chunk count)?
- **Q3.** Storage surface: Postgres only, Qdrant payload only, or both? Both
  requires a dual-write and touches the shared embedding contract in
  `packages/rag-core`; Postgres-only is cheaper but per ADR-31 retrieval-time
  filtering can only ever act on what's in the Qdrant payload, so a
  Postgres-only choice effectively forecloses the retrieval-filtering
  follow-up spec unless it re-derives the tag at query time.
- **Q4.** Backfill: do already-ingested `UserFile` rows get a batch job that
  detects and fills in language after the fact, or does the field stay
  `null`/unknown for pre-existing documents until they're next re-embedded
  (e.g. via `Workflow.REINDEX_DOCUMENT_VERSION`)?

## Problem

Confirmed by direct investigation of the ingest and retrieval code (see
session notes): no language-detection library exists anywhere in the repo, no
`UserFile` or related model has a `language`/`locale` column
(`prisma/schema.prisma`), and no Qdrant point payload carries a language key
(`apps/web/src/libs/vector-store/qdrant-client.ts`). The pipeline is
language-*preserving* only by prompt instruction, at three independent
stages — rephrase/multi-query (`apps/web/src/libs/chains/basic-rag/config.ts`),
ADR-16 summary generation, and the final answer prompt — each separately
telling the LLM not to translate. None of this is programmatic, and nothing is
stored, so there is no way today to know, filter, or report on what language a
given document is in.

This is a real gap for the multi-language-org case: a Polish branch under a
German HQ, company communication mostly in English, some documents in Polish,
some in English. Retrieval currently relies entirely on the multilingual
embedding model's (`bge-multilingual-gemma2`) cross-lingual quality plus
whatever the BM25/sparse half of hybrid search can match lexically — with no
stored ground truth to measure, audit, or improve that behavior against.

## Out of scope

- Filtering or boosting retrieval by language at query time — a separate,
  measured follow-up (ADR-20) once this spec's data exists to measure against.
- Translating documents or chunks into a canonical language.
- UI for org-level language policy or per-folder language restriction.
- Retroactively re-embedding documents solely to add the tag (see Q4 —
  backfill, if any, is additive metadata only).

## Proposed solution

<!-- Filled in after Q1-Q4 are answered. -->

## Core surfaces touched

<!-- Filled in after Q1-Q4 are answered. -->

## Data model

<!-- Filled in after Q1-Q4 are answered. -->

## Failure modes

<!-- Filled in after Q1-Q4 are answered. -->

## Phases

<!-- Filled in after Q1-Q4 are answered. -->

## Testing

<!-- Filled in after Q1-Q4 are answered. -->

## Rollout and rollback

<!-- Filled in after Q1-Q4 are answered. -->
