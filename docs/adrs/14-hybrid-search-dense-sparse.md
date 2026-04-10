# ADR-14: Hybrid Search (Dense + BM25 Sparse) with RRF Fusion

**Status:** Accepted
**Date:** 2026-04-11

## Context

ADR-11 established Qdrant as the vector store and ADR-12 added Cohere Rerank v3.5 as a post-retrieval quality step. Those decisions left one category of query systematically under-served: **exact-term retrieval**. Dense embeddings reward semantic similarity, but they can miss documents that match on literal tokens — product codes, SKUs, account numbers, proper nouns, regulation identifiers, and morphologically-varied Polish word forms ("faktura" vs. "faktury").

Reranking helps when the right document is already in the candidate pool, but it cannot rescue documents that vector search never surfaced. The cross-encoder only reorders what the bi-encoder found.

ADR-12 explicitly considered sparse vectors (BM25 via `fastembed`) and rejected them: "adds operational complexity and native dependencies." Two things changed that made hybrid search viable:

1. **Qdrant 1.10+** natively supports sparse vectors with an `idf` modifier — the server computes IDF from stored term frequencies and applies BM25-style scoring at query time. No client-side IDF bookkeeping.
2. **Qdrant 1.13+** supports `fusion: "rrf"` in the Query API — dense and sparse prefetch branches fuse server-side in a single round trip. No client-side Reciprocal Rank Fusion code.

Together these eliminate the operational complexity ADR-12 was worried about. A pure-TypeScript BM25 encoder (~80 lines, no native deps) produces the sparse vectors at ingest time. Everything else runs on the existing Qdrant instance.

## Decision

Add **BM25 sparse vectors** alongside the existing Cohere dense vectors in every Qdrant collection. Queries fan out into dense and sparse prefetch branches that Qdrant fuses with **Reciprocal Rank Fusion** in a single request. Cohere Rerank (ADR-12) continues to run over the fused top-N.

### Collection schema

Collections are created with **named vectors** — a breaking change from the previous unnamed single-vector schema. The vector store was wiped before rollout, so no migration was required.

```
vectors:
  dense:  { size: 1024, distance: Cosine }   # Cohere embed-multilingual-v3
sparse_vectors:
  sparse: { modifier: idf }                  # Qdrant computes IDF server-side
```

Payload indexes (`metadata.project_id`, `metadata.file_id`, `metadata.organization_id`, `metadata.accessible_by`) are unchanged.

### BM25 encoder

A pure-TypeScript encoder at `src/libs/vector-store/bm25-encoder.ts` (and a parallel copy in `ragen-worker/src/services/bm25-encoder.ts`):

1. **Tokenize** with a unicode-aware regex (`\p{L}[\p{L}\p{N}]*`) — letter-starting tokens with optional trailing letters/digits. Handles "faktura", "GPT4", "łódź", "python3" correctly. Pure-numeric and punctuation-only tokens are dropped as low-signal.
2. **Normalize** via NFKC + lowercase so visually-identical variants collapse ("Faktura" == "faktura", full-width "Ａ" == "a").
3. **Hash tokens** with FNV-1a 32-bit. Stable across processes, dependency-free, collision rate ~0.01% at 1M unique tokens.
4. **Output** sparse vectors as `{ indices: hashes, values: raw term frequencies }`. Qdrant's `idf` modifier handles IDF weighting and BM25 scoring at query time.

### Query flow

Single request to Qdrant's Query API with two prefetch branches:

```
prefetch: [
  { query: denseVector,  using: 'dense',  limit: k * 4, filter },
  { query: sparseVector, using: 'sparse', limit: k * 4, filter },
]
query:   { fusion: 'rrf' }
limit:   k
```

`PREFETCH_MULTIPLIER = 4` over-fetches 4×k candidates per branch before RRF fusion. Qdrant applies the metadata filter to both branches so access control stays intact.

### Graceful degradation

- **Query has no sparse signal** (punctuation or digits only, e.g. "42 !!") → client submits a single-branch prefetch (dense only). RRF fusion trivially returns the dense branch.
- **Chunk has no sparse signal** at ingest time → the point is upserted with the dense vector only. Qdrant accepts partial named vectors, so the chunk is still retrievable via the dense branch.
- **Existing Cohere Rerank pipeline** is unchanged — it consumes the post-fusion top-N exactly as before.

### Why no stemming (yet)

Polish is morphologically rich. Without stemming, "faktura" and "faktury" hash to different tokens, so BM25 won't match them. This is a known v1 limitation accepted because:

1. The **dense branch** still catches the semantic match — that's what it's good at.
2. Adding stemming means either a language detection step or always stemming through a multilingual stemmer, both of which add complexity for modest gains.
3. The upgrade target is **SPLADE** (learned sparse vectors from a transformer), which is language-agnostic and sidesteps stemming entirely. Deferred until we see real quality data.

## Alternatives Considered

1. **SPLADE sparse vectors** via ONNX Runtime in Node. Best theoretical quality. Rejected for v1: heavier dependency, slower ingest, new infrastructure. Worth revisiting if hybrid BM25 + dense plateaus below our quality bar.

2. **Qdrant server-side fastembed inference** (Qdrant 1.13+ can run fastembed internally). Rejected: requires enabling the inference service, which is not available in all Qdrant deployments including the current self-hosted Docker setup. Pure-TS encoding works everywhere.

3. **Client-side BM25 with full IDF bookkeeping** — maintain `(term, doc_freq)` stats per collection in TypeScript. Rejected in favor of Qdrant's `idf` modifier: less code, global IDF stats update automatically as the corpus grows, no sync concerns.

4. **Keep dense-only, rely purely on reranking** (status quo per ADR-12). Rejected: reranking cannot rescue documents vector search never surfaced. Exact-term queries remained the weakest category in informal testing.

## Consequences

**Improved retrieval quality** — particularly for:
- Exact-term queries (product codes, SKUs, proper nouns, legal references)
- Polish morphological variations (dense catches "faktura"/"faktury" semantically; sparse catches them when they appear verbatim)
- Acronyms and technical terminology that embeddings often flatten

**Minor ingest cost** — BM25 encoding is O(n) over document text. Negligible compared to the cost of computing dense embeddings via LiteLLM → Cohere.

**Minor query cost** — one extra sparse search branch per query. Fusion runs server-side in Qdrant, so the client sees a single round trip.

**Schema incompatibility with pre-rollout collections** — named vectors are not backwards-compatible with the old unnamed single-vector collections. The vector store was wiped intentionally before rollout; no migration script exists. Any future re-rollout that needs to preserve data would require a reindex.

**Coordinated change across two repos** — `ragen-app` (retrieval side) and `ragen-worker` (ingest side) both write to the same Qdrant collections and must use the same schema. Deployment requires both PRs to land together.

**Reranker unchanged** — ADR-12's Cohere Rerank still runs over the fused top-N. The two improvements compose cleanly: hybrid widens the candidate pool, reranking sharpens it.

## Relationship to ADR-12

ADR-12 chose reranking *instead of* sparse vectors. ADR-14 chooses reranking *and* sparse vectors. The trade-off ADR-12 flagged (operational complexity of BM25 + fastembed native deps) is resolved by pure-TS encoding and Qdrant's `idf` modifier. Both decisions are in force — they are complementary, not contradictory.

## Configuration

No new environment variables. Hybrid search is the only supported schema; there is no feature flag (data was wiped, no legacy path to gate against).

`PREFETCH_MULTIPLIER = 4` is a code constant in `qdrant-client.ts` — tune if recall/latency trade-off needs adjustment.

## Key Files

| File | Role |
|------|------|
| `src/libs/vector-store/bm25-encoder.ts` | Tokenizer, FNV-1a hash, sparse vector encoder (ragen-app) |
| `src/libs/vector-store/qdrant-client.ts` | Named-vector collection creation, hybrid upsert, RRF query |
| `src/libs/vector-store/__tests__/bm25-encoder.test.ts` | Encoder unit tests (19 tests) |
| `src/libs/vector-store/__tests__/qdrant-client.test.ts` | Hybrid client unit tests (13 tests) |
| `ragen-worker/src/services/bm25-encoder.ts` | Parallel copy kept in sync with ragen-app |
| `ragen-worker/src/services/qdrant.ts` | Worker-side hybrid collection creation + upsert |
