---
title: Each chunk is indexed with the context that places it in its document
status: draft
areas: [rag, worker, knowledge-base]
adrs: [14, 16, 17, 19, 20, 24, 50]
---

# Each chunk is indexed with the context that places it in its document

## TLDR

At ingest, every chunk gets a short prefix that says where it sits in its
document ("Section 4.2 of the 2025 service agreement, on response times…").
The prefix is embedded, and indexed for BM25, together with the chunk. This is
Anthropic's contextual retrieval. The non-obvious parts:

- **Changing the embedded text re-indexes an organization's whole corpus.**
- **There is a free variant to beat first:** a deterministic prefix built from
  the title, the section and the ADR-16 summary, with no model call per chunk.

## Open Questions

<!--
Delete this block once every question is answered. While it is here, the spec
is not ready to implement and no code should be written from it.
-->

- **Q1. Deployment env var, or per-org feature key?** A deployment switch is
  the simplest. Here the cost is per organization. That is the same argument that
  made `ragScoreOnIngest` a feature key: a feature key defaulting to `false`
  (ADR-50), read by the worker at job time. *Recommendation: feature key
  `contextualChunks`.*
- **Q2. What happens to documents indexed before the switch?** Turning the key
  on either:
  - (a) affects new uploads only, leaving a collection where some chunks have
    context and others don't, so retrieval favours the new ones;
  - (b) queues a re-index of the organization's files;
  - (c) offers a re-index action in the panel.

  *Recommendation: (c), plus a `context_version` field in the payload so a
  mixed collection is visible, and a backfill script for operators.*
- **Q3. Measure the free prefix as its own arm?** Title, section path and the
  ADR-16 summary cost no calls per chunk and may deliver most of the gain.
  Build and measure it before the per-chunk model call, and only build the
  model call if it clearly beats the free prefix? *Recommendation: yes.*
- **Q4. Dense only, or BM25 too?** The usual design puts it in both. Our
  measured weakness is cross-lingual: a Polish question about an English
  document scored 2–3/8 on the three unoptimized 2026-09-27 Docling runs. The
  suspected cause is BM25 dominating fusion (`docs/rag-measurement-2026-09-12.md`).
  A prefix written in the document's own language adds keywords in the wrong
  language for such a question, so BM25 could move either way.
  *Recommendation: both, with dense-only and dense + BM25 measured as separate
  arms in Phase A.*
- **Q5. Which model, and what cost ceiling?**
  - A per-chunk call reads the whole document, or its summary, once per
    chunk.
  - One way to bound it: the full document is the prefix only when it is
    ≤ 4096 tokens, otherwise the summary is; context is capped at 100
    tokens; reasoning is off; and it relies on prompt caching.
  - Our default summary model, `gemini-2.5-flash`, caches implicitly. The EU
    route (Scaleway) may not cache at all, in which case the cost grows with
    chunks × document size.

  Should we reuse `SUMMARY_MODEL`, and is there a per-document cap past which
  the free prefix is used instead?
- **Q6. Fix the re-index gaps here or first?** `reindexDocumentVersion` does
  not re-add the summary chunk and does not mask PII
  (`apps/worker/src/handlers/reindex-document-version.ts`). Contextual chunks
  have to go through the same path, so an edited document would lose its
  context the same way. *Recommendation: a separate fix PR before Phase B.*

## Problem

- **A chunk is embedded as bare text.** Dense embedding uses `pageContent` and
  BM25 uses `pageContent` (`apps/worker/src/services/qdrant.ts`). Nothing about
  the document is prepended, not even the title or the section. Docling prose
  chunks do not even carry `section_path`, which only table chunks have
  (`apps/worker/src/activities/splitters/split-documents.ts`).
- **A chunk that only makes sense in context is not found.** An example is
  "The fee is 4% of the contract value": it does not say which contract. The
  ADR-16 summary exists, but it is a separate retrieval candidate
  (`chunk_type: 'summary'`). It helps a question about the whole document, not
  one about that chunk.
- **Cross-lingual retrieval is the measured weak spot.** It scored 2/8, 3/8
  and 3/8 on the three unoptimized `kolej` Docling runs of 2026-09-27
  (`apps/web/evals/rag-benchmark/results/`).

## Design notes

How Anthropic's contextual retrieval is usually built — a starting point, to
be checked against our own numbers:

- **Default.** Off by default.
- **Calls.** One summary call per document, then one context call per chunk.
  The document is the cacheable prefix; the chunk and a request for a short
  context that situates it within the document follow.
- **Budget.** Space for the context is reserved inside the embedding window,
  so the chunk shrinks by that much. Contextualisation is skipped when the
  document fits in one chunk, or when too little content would remain.
- **Where it goes.** Into both the dense and the keyword index. It is stored
  in separate fields so it can be stripped before the chunk reaches the
  answer model or a citation.
- **Failures and cost.** A chunk whose call fails is indexed without context;
  indexing never fails because of it. The admin sees a deliberately high cost
  estimate before switching it on, and switching it on is a full re-index.

## Constraints already known

- **Chunk size.** `MAX_EMBEDDING_TEXT_CHARS = 2000` (`packages/rag-core`), and
  chunks are already 1000–2500 characters, so the prefix needs reserved room
  or the chunk gets truncated.
- **PII.** The context call must run after masking, on masked text, as the
  summary call already does. In `dual_content` mode the dense embedding uses
  the decrypted original, and the rule for the context in that mode is
  undecided.
- **Usage accounting.** Worker usage rows hard-code `estimatedCost: 0`. A
  per-chunk call logged the way the summary is logged (`CHAT_COMPLETION`)
  would also inflate the monthly **message** count by one per chunk. It needs
  its own `AiUsageStep`.

## Out of scope

- Query-time selection and expansion — the sibling spec
  `2026-09-29-llm-document-selection.md`.
- Multipass indexing with small and large chunks.
- Changing chunk sizes or splitters (ADR-17).

## Proposed solution

*To be written after the open questions are answered.* The expected shape is:

- **Phase A: measure** the free prefix, dense only vs dense + BM25, on both
  corpora.
- **Phase B: the per-chunk model call**, behind the feature key, only if A
  says the free prefix leaves a gap.
- **Phase C: re-indexing existing corpora.**
