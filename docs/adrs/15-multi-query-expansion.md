# ADR-15: Multi-Query Expansion for Retrieval

**Status:** Accepted
**Date:** 2026-04-11

## Context

The RAG retrieval pipeline after ADR-12 (Cohere Rerank) and ADR-14 (hybrid dense+sparse search) still issues a **single query** per user turn. A user's question is rephrased into a standalone form, that single phrasing is embedded and sent to Qdrant, and the results feed the LLM.

This is fragile for a reason called **vocabulary mismatch**: the way users phrase questions is often different from how the answer is phrased in the source documents. A user asks "how do I cancel my subscription?" but the document says "terminating your plan." Dense embeddings handle some of this, sparse BM25 handles none of it, and reranking can only reorder documents that were found in the first place.

Multi-query expansion addresses vocabulary mismatch at the query side: instead of submitting one phrasing, submit several. Each phrasing is a different probe into the corpus. Union the results, dedupe, rerank. It is cheap — a single LLM call to generate variants, a few parallel vector searches, and the same reranker — and consistently improves recall in the literature and in production RAG systems.

This is Phase 2 of the RAG quality improvements discussed in early April 2026, following hybrid search (ADR-14) and preceding deferred work on extraction, chunking, and query decomposition.

## Decision

Insert a **query expansion step** between rephrasing and retrieval in the `basic-rag` chain.

### Pipeline

```
user question
    ↓  rephraseQuestion (existing)
standalone question
    ↓  expandQueries (new)
[standalone, variant1, variant2]       ← always includes the original standalone
    ↓  parallel vector search per query (dense + sparse hybrid per ADR-14)
candidate pool (with duplicates)
    ↓  dedupe by content string
unique candidates
    ↓  Cohere Rerank (per ADR-12)
top-k documents → LLM
```

### Variant generation

A single LLM call using `generateObject` from the AI SDK with a Zod schema constraining the output to `{ variants: string[] }`. The prompt instructs the model to produce 2 alternative phrasings that capture the same information need using different vocabulary or related terms. The **original standalone question is always preserved as the first query** — variants are additive, never a replacement.

- **Model**: reuses `REPHRASE_MODEL` (default `gemini-2.5-flash`). Faster than the nano tier for short-output tasks in our LiteLLM → Vertex setup, strong Polish support, and no new env var. See ADR-16 for the latency-driven rationale that led us to pick Gemini Flash over `gpt-5.4-nano` for similar short-output LLM roles.
- **Count**: 2 variants → 3 total queries including the original. Balances recall gain against latency and reranker input size.
- **Structured output**: Zod schema eliminates JSON parsing bugs. If the LLM returns malformed output, the AI SDK throws and the caller falls back to the single standalone query.

### Per-query retrieval count

With N=3 queries, each query retrieves `floor(k × RERANK_MULTIPLIER / N)` candidates, floored at `k`. This keeps the total candidate pool roughly the same as the single-query pipeline (pre-dedupe), so the reranker input size does not balloon. After deduplication the unique pool is typically smaller, which is fine — overlapping variants confirm relevance.

### Deduplication

Candidates are deduplicated by exact content string match (`Map<string, VectorStoreDocument>`, first occurrence wins). Content is small, the `Map` is cheap, and hashing buys nothing at this scale. Metadata of duplicates is discarded along with the duplicate.

### Graceful degradation

Multi-query expansion is designed to **never regress** below single-query behavior:

- **LLM expansion throws** (network error, timeout, invalid structured output) → log, fall back to `[standalone]` and continue. The user sees the same result they would have gotten without the feature.
- **LLM returns empty or only whitespace variants** → filtered out; if the filtered array is empty, fall back to `[standalone]`.
- **Feature flag off** (`FEATURE_FLAG_MULTI_QUERY=0`) → skip expansion, behave exactly like the previous pipeline.

### Feature flag

`FEATURE_FLAG_MULTI_QUERY` — **default ON**. A code constant checks the env var; any value that isn't explicitly `"0"` or `"false"` is treated as enabled. Present so the feature can be disabled per-environment without a code change if production hits issues.

### Thread document retrieval is out of scope

`retrieveThreadDocuments` (the retriever for files the user attached to the current chat thread) uses a separate path and typically operates over a handful of documents. Multi-query expansion there is lower-value and adds latency. Left as a follow-up if needed.

## Alternatives Considered

1. **HyDE (Hypothetical Document Embeddings)** — generate a fake answer, embed the fake answer, retrieve with that. Effective but one-shot: only one probe into the corpus. Multi-query with 2–3 variants is strictly more coverage for comparable cost. HyDE remains a future option to **combine with** multi-query, not replace it.

2. **Query decomposition** — split complex questions into sub-questions and run separate retrievals per sub-question. More ambitious, helps multi-hop questions ("compare X and Y"), but requires a harder classifier step to detect when decomposition is appropriate. Deferred to a later phase.

3. **Single rephrase with richer prompt** — ask the rephrase step to incorporate synonyms and related terms. Simpler but fundamentally still one probe. The LLM's attempt to stuff synonyms into a single query dilutes the signal for dense search (embeddings average).

4. **More variants (5 instead of 2)** — tried conceptually. Each extra variant is an extra vector search plus dilutes the reranker input. Marginal recall gains from variants 4 and 5 are small in published RAG evaluations. Can be tuned via a constant if data shows it helps.

5. **Separate LLM call per variant** — rejected in favor of one structured-output call. One call is cheaper, faster, and avoids variant drift (where each independent call generates similar phrasings).

## Consequences

**Higher recall** — particularly for queries where the user's phrasing doesn't match the document's. The hybrid search improvement (ADR-14) already helps with exact-term matches; multi-query helps with semantic vocabulary mismatch. The two are orthogonal and stack.

**Added latency** — one extra LLM call (~200–500ms on `gemini-2.5-flash`) plus 2 extra parallel Qdrant queries. The Qdrant queries parallelize with each other, so the wall-clock cost is roughly one expansion call plus one vector search round trip. Total added latency is typically under 700ms — acceptable for chat UX.

**Added LLM cost** — one `gemini-2.5-flash` call per RAG turn. Per-call cost is negligible compared to the answer generation call that follows.

**Reranker input stays bounded** — per-query retrieval count is divided by N so the pre-dedupe pool stays roughly the same as before. Reranker latency and cost are essentially unchanged.

**Observability via Langfuse** — expansion step traces as `expand-queries` alongside the existing `rephrase-question` span. Generated variants are logged (debug level) for prompt tuning during rollout.

**Fallback safety** — graceful degradation means the feature cannot make retrieval worse than the single-query baseline. Any failure in the expansion path silently falls back. This is essential because the feature ships default-on.

**Rollback via env var** — `FEATURE_FLAG_MULTI_QUERY=0` disables expansion at runtime without a code deploy.

## Relationship to ADR-12 and ADR-14

| ADR | Problem it solves | Where in the pipeline |
|-----|-------------------|-----------------------|
| ADR-12 Cohere Rerank | Reordering candidates by cross-encoder precision | After retrieval |
| ADR-14 Hybrid search  | Exact-term and morphological matches dense alone misses | At retrieval (vector side) |
| ADR-15 Multi-query    | Vocabulary mismatch between query phrasing and document phrasing | Before retrieval (query side) |

All three are active simultaneously and compose cleanly. ADR-15 multiplies the number of retrieval probes; ADR-14 makes each probe hybrid; ADR-12 sharpens the final top-k from the combined pool.

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `FEATURE_FLAG_MULTI_QUERY` | `1` (on) | Set to `0` or `false` to disable query expansion entirely |
| `REPHRASE_MODEL` | `gemini-2.5-flash` | Reused for expansion (no new variable) |

Code constants in `basic-rag/operations.ts`:
- `MULTI_QUERY_VARIANT_COUNT = 2` — alternates to generate per turn (total queries = this + 1)
- `PER_QUERY_RERANK_MULTIPLIER` — derived so total pre-dedupe pool roughly matches single-query behavior

## Key Files

| File | Role |
|------|------|
| `src/libs/chains/basic-rag/operations.ts` | `expandQueries()` function, updated `retrieveRelevantDocuments()` for multi-query + dedupe |
| `src/libs/chains/basic-rag/config.ts` | Prompt template for query expansion |
| `src/libs/chains/basic-rag/chain.ts` | Pipeline wiring: expansion between rephrase and retrieval |
| `src/libs/chains/basic-rag/__tests__/operations.test.ts` | Unit tests: expansion happy path, LLM error fallback, empty-array fallback, dedupe, per-query math |
