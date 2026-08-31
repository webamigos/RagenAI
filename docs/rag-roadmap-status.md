# RAG Roadmap Status

**Snapshot date:** 2026-04-11
**Current state:** Deliberate measurement pause (see [ADR-20](adrs/20-pause-and-measure-rag-quality.md)). Last technical phase shipped was **Phase 4d.1**. Pause is time-boxed to 2026-04-18 at the earliest.

This document is a concise summary of where the RAG improvement sprint stands and what the next action is. It mirrors ADR-20 but in a shorter, decision-oriented form. When in doubt, ADR-20 is authoritative.

---

> ## Status update — 2026-08-31
>
> **The pause outlasted its time-box by four months and was never formally
> reviewed.** The snapshot above is April's; read it as history, not as current
> state. What changed since, that bears on the decision:
>
> - **The embedding stack was replaced.** Dense embeddings moved from
>   `cohere-embed-multilingual-v3` (1024-dim, Bedrock) to
>   `bge-multilingual-gemma2` (3584-dim, Scaleway), and reranking moved to
>   Scaleway `qwen3-embedding-8b`. **This invalidates any retrieval-quality
>   measurement taken before the migration** — the "measurement week" below has
>   to be run against the current stack, not compared with April numbers.
> - **Measurement tooling now exists**, which it did not in April. The five
>   promptfoo suites in `evals/` were dead (wrong provider config, a renamed
>   function, unprovisioned models); they now run and gate CI. `evals/e2e-rag/`
>   drives the real ingestion path end to end against a fixture document about a
>   company that does not exist, with hallucination and sycophancy guards.
>   Signal category 3 (spot-checking real queries) is still manual and unbuilt.
> - **Signal category 4 was the stated highest-ROI item** ("if no feedback
>   mechanism exists, adding one is"). A feedback-collection task sits in
>   ClickUp at `ready for dev`. It is still not built.
>
> **So the next action is unchanged in shape but not in cost:** run the
> measurement week against the Scaleway stack, using the eval suites that now
> exist, before picking any of Paths A–D. Do not pick a path from April's
> reasoning.

## Shipped so far (phases 1 → 4d.1)

| Phase | ADR | What |
|---|---|---|
| 1 | [14](adrs/14-hybrid-search-dense-sparse.md) | Hybrid dense + BM25 sparse with RRF fusion |
| 2 | [15](adrs/15-multi-query-expansion.md) | Multi-query expansion (2 variants per turn) |
| 3 | [16](adrs/16-document-summaries-at-ingest.md) | Document summaries at ingest + citation prompting |
| 4a | [17](adrs/17-type-specific-chunking.md) | Type-specific chunking (CSV/XLSX/DOCX/SRT) |
| 4b | [18](adrs/18-pdf-heading-detection.md) | PDF heading detection via structured Claude output |
| 4d.1 | [19](adrs/19-section-aware-context-rendering.md) | Section-aware context rendering for citations |

Visual diagrams of the full pipeline: [`docs/rag-pipeline.md`](rag-pipeline.md).

## Next action: measurement week (the pause)

The next step is **not more building** — it's collecting data on whether the shipped stack is actually helping users. Per ADR-20, four categories of signal:

1. **Langfuse metrics**
   - PDF structured-vs-flat fallback rate — target <10% (ratio of `flat` tag to `structured`+`flat`)
   - Multi-query expansion call latency — target <500ms p95 on `gemini-2.5-flash`
   - Summary generation latency — target <3s p95
   - Embedding batch failure rate — target ~0
2. **Qdrant collection health**
   - Every collection has named dense + sparse vectors
   - ~1 summary chunk per uploaded file (ratio to files >= 0.8)
   - `section_path` populated on DOCX and PDF chunks
   - `sheet_name` populated on XLSX chunks
   - Point count per file looks reasonable (a 20-page PDF ≈ 15–40 chunks)
3. **Spot-check 10–20 real user queries** from Langfuse traces
   - Does the retrieved context include `section_path` metadata?
   - Does the LLM's answer cite a file and/or section?
   - Categorize: factual lookup, numeric, comparative, multi-hop, open-ended
   - Rate 1–5 subjectively; note regressions
   - Target query categories: CSV/XLSX numeric, DOCX/PDF structured, topic-level broad questions
4. **User feedback**
   - Pull last-week thumbs/ratings/support tickets referencing bad answers, if any
   - If no feedback mechanism exists, adding one is the highest-ROI work

## After the pause — choose a path

When ADR-20 is reviewed on or after **2026-04-18**, the data picks exactly one of four paths:

### Path A — Phase 4d.2: Query-driven metadata filters

**Pick if**: spot-checks show users asking section-specific or sheet-specific questions that the current stack handles generically.
**Scope**: ~1 week. Parse section/sheet/time hints from user questions (small LLM call or regex), apply as Qdrant payload filter before vector search. Builds on metadata from ADR-17 / ADR-18.
**ROI**: High for structured-document KBs (contracts, manuals, multi-sheet spreadsheets).

### Path B — Phase 4c: PDF table extraction

**Pick if**: spot-checks show users asking questions whose answer lives in a PDF table, and the current stack fragments or misses it.
**Scope**: ~1–2 weeks. Modify ADR-18 structured prompt to emit tables as `chunk_type: 'table'`, or add a dedicated PDF table extraction library. Prompt-engineering heavy.
**ROI**: Very high for specific domains; niche for general-purpose KBs.

### Path C — Prompt tuning on already-shipped phases

**Pick if**: Langfuse metrics show specific issues (high flat-fallback rate, slow summary generation, low citation usage, etc).
**Scope**: 2–5 days per tuning target. Mostly prompt engineering, no new infrastructure.
**ROI**: Quick wins on observed problems. May not need a new ADR — just a PR with a note on the metric that triggered it.

### Path D — Non-RAG improvements

**Pick if**: measurements show the RAG stack is fine and real user pain is elsewhere (UI, latency, onboarding, connectors).
**Scope**: variable.
**ROI**: Potentially the highest of all four — means we stop investing in an already-good system. **This is a legitimate outcome.** The point of the pause is not to confirm more RAG work is needed — it's to find out whether it is.

## Frozen backlog (not abandoned, waiting for resume)

Grouped by origin phase.

**Phase 4 (pre-existing deferrals)**
- Phase 4c — PDF table extraction as atomic `chunk_type: 'table'` chunks
- Phase 4d.2 — Query-driven metadata filters (section, sheet, timestamp)

**From Phase 4b (ADR-18)**
- Vision-path structural detection (if `PDF_PROCESSOR=vision` ever becomes common)
- Production monitoring dashboard for structured-vs-flat fallback rate (Langfuse config, not code)
- Page number preservation through `prepareMetadata` (small cleanup PR)

**From Phase 4a (ADR-17)**
- RFC 4180 edge cases in CSV parsing (embedded newlines inside quoted fields already handled; alternative delimiters not)
- Richer DOCX list/table handling (currently treats list items and table cells as plain paragraphs)
- Richer SRT segmentation (block-group mode as cheaper alternative to LLM segmentation)

**From Phase 3 (ADR-16)**
- Structured summaries (JSON with title, abstract, key facts, entities)
- Hierarchical retrieval using summary chunks for first-pass document selection
- Summary-based document previews in the KB UI

**From Phase 2 (ADR-15)**
- HyDE (Hypothetical Document Embeddings) as another query-time technique
- Query decomposition for multi-hop questions
- Tuning `MULTI_QUERY_VARIANT_COUNT` beyond 2 based on data

**Cross-cutting**
- Client-side BM25 → SPLADE upgrade (better quality, needs ONNX model hosting)
- FNV-1a 32-bit → 64-bit hash upgrade for BM25 (only relevant at very large vocabulary sizes)
- Polish stemming for BM25 (or language detection + per-language stemming)
- Parent-document retrieval (embed small chunks, return larger parent chunks for context)

## The cheapest non-measurement win

If measurement slips and you want one low-risk next action without waiting for the full week:

**Prompt tuning on the ADR-18 structured PDF prompt (Path C).** Unit tests can't verify Claude's compliance with the "return strict JSON" instruction — only production traces can. But even this still needs a quick Langfuse glance at the `structured` vs `flat` tag ratio first to know whether tuning is warranted. A 5-minute check is not the same as skipping measurement.

## Bottom line

The question right now isn't "what's next technically" — it's **"do we know the current stack is helping users?"** Today we don't have that data. Spending the week on the four measurement items is the next action. On or after 2026-04-18, the data picks exactly one of Paths A–D.

**Explicit commitment from ADR-20**: no silent resumption of the work. When the review happens, one of three outcomes must be produced:

1. A successor ADR for the next technical phase (data supports it)
2. A revision of ADR-20 extending the pause with new criteria (data inconclusive)
3. A closing note marking the RAG improvement sprint complete (data shows stack is good enough, redirect effort)
