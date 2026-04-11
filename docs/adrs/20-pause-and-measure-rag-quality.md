# ADR-20: Pause and Measure RAG Quality Before Phase 4c / 4d.2

**Status:** Accepted
**Date:** 2026-04-11

## Context

Over the course of about one working session, the RAG pipeline was rebuilt across **six ADRs** (14, 15, 16, 17, 18, 19) covering every stage from ingest to answer. Every phase was tested, reviewed, and shipped. The worker test suite grew from 72 → 164 passing (+92 tests), the ragen-app test suite grew from 449 → 482 passing (+33 tests), and four ADRs' worth of deferred items accumulated on the backlog (Phase 4c PDF table extraction, Phase 4d.2 query-driven metadata filters, plus smaller items).

At this point, the question "what do we ship next" has become harder than "can we ship more". Every remaining deferred item is either:

- **Speculative** — we *think* it will improve retrieval quality but can't yet point at specific user queries that are failing and would benefit
- **Research-y** — PDF table extraction in particular depends on prompt engineering or library choices that have to be validated against real documents, which we don't have a systematic way to do yet
- **Lower marginal ROI** — the first three phases (hybrid, multi-query, summaries) each addressed a distinct retrieval failure mode. Further improvements are increasingly specific to long-tail queries

Meanwhile, we have **zero data** on whether the already-shipped improvements are actually helping users. Phase 4b specifically ships prompt engineering that depends on Claude's compliance with a "return strict JSON" instruction — something unit tests can't verify, only production traces can.

Continuing to ship without measurement risks:

1. **Regressions we don't notice.** Every new phase could subtly hurt retrieval for some query category without anyone realizing until users complain.
2. **Wasted effort on solved problems.** If the current stack already handles 95% of real queries well, Phase 4c table extraction might save 2% of queries for weeks of work — bad ROI compared to whatever the *actual* top complaint is.
3. **Drift from user needs.** The priority list we've been working against was set before any of this shipped. It may be stale now.

## Decision

**Pause further RAG quality work until a measurement cycle is complete.** Spend one focused week collecting data on the shipped stack, then re-prioritize based on what the data shows.

This is an explicit, time-boxed pause — not an abandonment of the remaining roadmap items. The deferred work list (below) stays intact; the decision about which item to tackle next is postponed until we have signal.

### What has shipped (reference snapshot)

Six ADRs. All code is merged to `main` or `dev` on both repos, or on the active PR branches waiting to merge:

| ADR | Phase | What it does | ragen-app | ragen-worker |
|---|---|---|---|---|
| ADR-14 | 1 | Hybrid dense + BM25 sparse search with RRF fusion | ✓ | ✓ |
| ADR-15 | 2 | Multi-query expansion (2 variants per turn) | ✓ | — |
| ADR-16 | 3 | Document summaries at ingest + citation prompting | ✓ | ✓ |
| ADR-17 | 4a | Type-specific chunking (CSV, XLSX, DOCX, SRT) | docs only | ✓ |
| ADR-18 | 4b | PDF heading detection via structured Claude output | docs only | ✓ |
| ADR-19 | 4d.1 | Section-aware context rendering for citations | ✓ | — |

Every change was accompanied by unit tests; every PR was reviewed (by CodeRabbit where rate limits allowed, by the committed test suite always). Five feature flags govern the risky parts of the stack (`FEATURE_FLAG_MULTI_QUERY`, `FEATURE_FLAG_DOC_SUMMARIES`, `FEATURE_FLAG_RERANKING`, `PDF_PROCESSOR`, and the implicit "code revert" flag on Phases 4a/4b/4d.1 which have no runtime toggle).

### The four-stage retrieval pipeline in its current form

```
user question
    ↓ rephrase to standalone question              (ADR-15 prep)
    ↓ expand into N query variants                 (ADR-15)
    ↓ parallel hybrid search per variant           (ADR-14)
    ↓ RRF fusion server-side in Qdrant             (ADR-14)
    ↓ dedupe by chunk content                      (ADR-15)
    ↓ Cohere Rerank v3.5 on unified pool           (ADR-12)
    ↓ render chunks with <chunk> wrappers          (ADR-19)
    ↓ LLM answer generation with section citations (ADR-16 + ADR-19)
```

And at ingest:

```
file upload
    ↓ parse per type                               (existing)
    ↓ chunk per type                               (ADR-17)
    ↓ generate summary                             (ADR-16)
    ↓ prepend synthetic summary chunk              (ADR-16)
    ↓ embed dense + sparse                         (ADR-14)
    ↓ upsert to Qdrant with hybrid schema          (ADR-14)
    ↓ merge UserFile.metadata.summary              (ADR-16)
```

## What to measure during the pause

Four categories of signal, all expected to take ~1 week of passive observation plus a few active spot-checks.

### 1. Pipeline health via Langfuse

Filter by these tags in the Langfuse UI to observe the shipped stack in production:

| Tag | Where it's set | What it tells you |
|---|---|---|
| `structured` | ADR-18 PDF structured call | How often the Claude structured output succeeds |
| `flat` | ADR-18 PDF flat-text fallback | Inverse of `structured` — a high rate means the prompt needs tuning |
| `multi-query` (implicit: `expand-queries` function ID) | ADR-15 expansion step | Latency and failure rate of the expansion LLM call |
| `summary` | ADR-16 summary generation | Latency of per-document summaries at ingest |
| `embedding` | ADR-14 dense embedding calls | Throughput and error rate of Cohere embedding calls |
| `pdf-extraction` | ADR-18 parent trace | End-to-end PDF ingest time |

**Specific metrics worth eyeballing:**

- **Structured PDF fallback rate.** Calculate: `count(flat) / (count(structured) + count(flat))`. Target: <10%. Anything above 20% means the structured prompt needs tuning (or the file types hitting the path are genuinely incompatible and we should add a detection step).
- **Expansion latency p95.** The expansion LLM call (tag `expand-queries`) blocks retrieval. Target: <500ms p95 on `gemini-2.5-flash`. Above 1s means switching models is worth considering.
- **Summary generation latency p95.** Per-document ingest cost. Target: <3s p95. Above 5s means truncating the input more aggressively or switching the summary model is worth considering.
- **Embedding batch failure rate.** Should be ~0. Any non-zero rate is a LiteLLM or Cohere issue worth investigating.

### 2. Qdrant collection health

For each active organization's Qdrant collection, check:

- **Collection schema** — every collection should have `vectors: { dense: {...} }` and `sparse_vectors: { sparse: {...} }`. Any collection missing sparse vectors is a Phase 1 rollout gap.
- **Points with `chunk_type: 'summary'`** — there should be ~1 per uploaded file (sometimes 0 if summary generation failed). If the ratio of summary chunks to total files is below ~0.8, investigate ingest failures.
- **Points with `section_path` populated** — for DOCX and PDF files, this should be close to 100% of chunks (small exceptions for sections that are too short or fallback-path chunks). XLSX files should have `sheet_name` populated on every chunk.
- **Point count per file** — a typical 20-page PDF should produce 15-40 chunks after Phase 4b (1 per section-plus-recursive-split). If it's producing 1 huge chunk, the structured output is probably falling back to the flat path (see `flat` tag above).

### 3. Real-user query spot-checks

Take **10-20 recent real user questions** from production (filter Langfuse for `thread-question` or similar traces). For each:

1. Look at the retrieved chunks in the trace
2. Check if any have `section_path` metadata — if yes, this query is benefitting from Phase 4a/4b
3. Look at the LLM's answer — does it cite a file and/or section?
4. Categorize the query type: factual lookup, numeric query, comparative, multi-hop, open-ended
5. Rate the answer 1-5 subjectively

Keep the ratings in a simple spreadsheet. After 10-20 queries you'll have a much better sense of what's working and what isn't than any theoretical priority list.

**Specific things to look for:**

- **Are CSV/XLSX numeric queries actually getting answered correctly?** Phase 4a claimed big wins here. Spot-check 3-5 numeric queries against spreadsheet-sourced chunks.
- **Are DOCX/PDF citations useful?** ADR-19 promised section-aware citations. Spot-check 3-5 structured-document queries. Does the LLM actually say "Section 3.2 — Revenue terms"?
- **Are summary chunks showing up as top-k results for topic-level queries?** ADR-16's topic anchors. Spot-check 3-5 broad questions.
- **Any regressions?** Any query category that feels *worse* than a week ago? This is the hardest signal to collect but the most important.

### 4. User feedback

If there's any existing feedback mechanism in the product (thumbs up/down on answers, chat ratings, support tickets referencing bad answers), pull the last week of data and bucket complaints. This is the highest-signal source if available but depends entirely on whether the feedback loop exists.

If no feedback mechanism exists, consider this the prompt to add one — even a simple "was this helpful?" button on streamed answers would inform every future phase.

## Decision criteria for resuming work

After the measurement week, revisit this ADR and choose one of four paths based on what the data shows:

### Path A — Phase 4d.2: Query-driven metadata filters

**Choose if**: spot-checks show users asking section-specific or sheet-specific questions that the current stack handles generically. E.g., "what does Section 3 say about X" retrieves generic chunks instead of filtering to `section_path LIKE 'Section 3*'`.

**Scope**: ~1 week of work. Parse section/sheet/time hints from the user's question (probably with a small LLM call or regex extraction), apply as a Qdrant payload filter before vector search. Builds on the metadata that ADR-17 and ADR-18 already produce.

**ROI**: High for knowledge bases with lots of structured documents (contracts, manuals, multi-sheet spreadsheets). Low if users mostly ask open-ended questions.

### Path B — Phase 4c: PDF table extraction

**Choose if**: spot-checks show users asking questions whose answer lives in a PDF table, and the current stack fragments the table or misses it entirely.

**Scope**: ~1-2 weeks. Modify the ADR-18 structured prompt to emit tables as separate top-level entries with `chunk_type: 'table'`, or add a dedicated PDF table extraction library. Prompt-engineering heavy.

**ROI**: Very high for specific domains (contracts with pricing tables, reports with data tables) but niche for general-purpose KBs.

### Path C — Prompt tuning on the shipped phases

**Choose if**: Langfuse metrics show issues — high structured-vs-flat fallback rate on PDFs, slow summary generation, low citation usage in answers, etc.

**Scope**: variable, probably 2-5 days per tuning target. Mostly prompt engineering, no new infrastructure.

**ROI**: Quick wins, cheap to ship, high signal/noise ratio because you're fixing observed problems not speculative ones.

### Path D — Non-RAG improvements

**Choose if**: the measurements show the RAG stack is fine and the real user pain is elsewhere (UI, latency, onboarding, connector integrations, etc.).

**Scope**: completely variable depending on what the data surfaces.

**ROI**: potentially the highest of all four paths, because it means we stop investing in an already-good system and redirect effort to where the actual problem is.

**This is a legitimate outcome** of the measurement week. The point of pausing is not to confirm more RAG work is needed — it's to find out whether more RAG work is needed.

## How to resume

When the measurement week is complete (target: one week from the date of this ADR, 2026-04-18 at the earliest):

1. **Gather the measurements** — Langfuse dashboard snapshot, Qdrant collection stats, spot-check spreadsheet, user feedback summary
2. **Re-read this ADR's "Decision criteria" section** with the data in hand
3. **Pick a path** (A, B, C, or D)
4. **Open a successor ADR** if the chosen path is substantive enough to warrant one (Phase 4c and Phase 4d.2 both will)
5. **If picking Path C** (prompt tuning), the changes may be small enough to not need a new ADR — just a PR with the updated prompts and a note on the observed metric that triggered the change

## Deferred items at the time of this pause

Frozen until the measurement week completes. Keeping the list here so it doesn't get lost:

**From Phase 4 (pre-existing deferrals):**
- Phase 4c — PDF table extraction as atomic chunks with `chunk_type: 'table'`
- Phase 4d.2 — Query-driven metadata filters (section, sheet, timestamp)

**From Phase 4b:**
- Vision-path structural detection (if `PDF_PROCESSOR=vision` ever becomes common)
- Production monitoring dashboard for structured-vs-flat fallback rate (a Langfuse config change, not code)
- Page number preservation through `prepareMetadata` (separate small cleanup PR)

**From Phase 4a:**
- RFC 4180 edge cases in CSV parsing (embedded-newlines-inside-quoted-fields are already handled; rarer cases like alternative delimiters are not)
- Richer DOCX list/table handling (currently treats list items and table cells as plain paragraphs)
- Richer SRT segmentation (block-group mode as a cheaper alternative to LLM segmentation for users who don't need semantic chunks)

**From Phase 3 (ADR-16):**
- Structured summaries (JSON with title, abstract, key facts, entities) — a richer summary format than plain prose
- Hierarchical retrieval using summary chunks for first-pass document selection
- Summary-based document previews in the KB UI

**From Phase 2 (ADR-15):**
- HyDE (Hypothetical Document Embeddings) as another query-time technique
- Query decomposition for multi-hop questions
- More than 2 variants per expansion (tune `MULTI_QUERY_VARIANT_COUNT` based on data)

**Cross-cutting:**
- Client-side BM25 → SPLADE upgrade for sparse vectors (better quality, needs ONNX model hosting)
- FNV-1a 32-bit → 64-bit hash upgrade for BM25 (only relevant at very large vocabulary sizes)
- Polish stemming for BM25 (or language detection + per-language stemming)
- Parent-document retrieval (embed small chunks, return larger parent chunks for context)

## Consequences

**Positive:**
- Avoids shipping-for-shipping's-sake. Every future RAG phase will be grounded in observed user needs.
- Creates space for non-RAG work (UI, connectors, onboarding) that may have higher ROI but has been sidelined by the momentum of the RAG sprint.
- Forces the creation of measurement tooling (Langfuse filters, Qdrant health checks, query spot-check process) that will be useful for every future phase regardless of direction.
- Documents the stopping point explicitly so resuming work later is a deliberate decision, not a drift back in.

**Negative:**
- One week of not shipping RAG improvements. If user pain is high right now, this feels like inaction. Mitigation: monitor user complaints during the week; if a specific problem emerges that has a clear fix in the existing backlog, interrupt the pause and ship the fix.
- Risk of never resuming. Pauses have a way of becoming permanent. Mitigation: this ADR explicitly names a resume date (2026-04-18 at the earliest) and a decision-criteria checklist to force the question.
- Measurement can be inconclusive. The spot-check sample is small and subjective. Mitigation: accept qualitative data is better than no data; a 10-query spot-check will still surface obvious issues.

**Neutral:**
- No code changes associated with this ADR. It's a process decision, not a technical one.

## Key Files

| File | Role |
|------|------|
| `docs/adrs/20-pause-and-measure-rag-quality.md` | This ADR (self-reference for the decision trail) |
| Langfuse UI (external) | Primary measurement surface — tag filters documented above |
| Qdrant dashboard (external) | Secondary measurement surface — collection schema + metadata health |
| (no code changes) | — |

## Relationship to previous ADRs

This is the first **process ADR** in the chain. All prior RAG ADRs (ADR-11 through ADR-19) documented technical decisions about how to build something. ADR-20 documents a decision about **when to stop building and start measuring**. It does not supersede, modify, or depend on any technical ADR — it pauses the roadmap that was implicitly defined by the sequence 14 → 15 → 16 → 17 → 18 → 19.

| ADR | Stage | Phase | Type |
|-----|-------|-------|------|
| ADR-14 | Retrieval | 1 | Technical |
| ADR-15 | Pre-retrieval | 2 | Technical |
| ADR-16 | Ingest + answer prompt | 3 | Technical |
| ADR-17 | Ingest | 4a | Technical |
| ADR-18 | Ingest | 4b | Technical |
| ADR-19 | Answer prompt | 4d.1 | Technical |
| **ADR-20** | **Process** | **—** | **Pause / measurement decision** |

## Review date

This ADR should be explicitly reviewed on or after **2026-04-18**. The review should produce one of:

1. A successor ADR for the next technical phase (if data supports it)
2. A revision of this ADR extending the pause with new criteria (if data is inconclusive)
3. A closing note marking the RAG improvement sprint as complete (if data shows the stack is good enough and effort should redirect elsewhere)

No silent resumption of the work without the review.
