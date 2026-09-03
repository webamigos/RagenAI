# ADR-12: Cohere Rerank as Post-Retrieval Quality Step

**Status:** Accepted; gating and default provider superseded — see the update at the end
**Date:** 2026-04-02

> "Reranking is automatically active when AWS credentials are present" is
> **stale**: reranking is opt-in behind `FEATURE_FLAG_RERANKING=1`, and the
> default provider is Scaleway, not Bedrock Cohere. See
> [the update](#update-2026-09-03-reranking-is-opt-in-and-the-default-provider-is-scaleway).

## Context

The switch from Meilisearch to Qdrant (ADR-11) removed built-in hybrid search (keyword + semantic). Pure dense vector search works well for most queries but can miss documents that match on exact keywords or terminology — especially important for Polish-language content where morphological variations are common.

Rather than implementing sparse vector search (BM25 + fastembed), which adds operational complexity and native dependencies, a post-retrieval reranking step provides higher quality with simpler architecture.

## Decision

Add **Cohere Rerank v3.5** (`cohere.rerank-v3-5:0`) via AWS Bedrock as a post-retrieval reranking step in the RAG chain.

### How it works

1. **Over-retrieve** — fetch 3x the desired document count from Qdrant (e.g., 12 candidates for top-4)
2. **Rerank** — send the query + candidate documents to Cohere Rerank via Bedrock
3. **Select top-k** — return the highest-scoring documents to the LLM context

### Why Cohere Rerank

- **Best-in-class multilingual support** — Cohere Rerank v3.5 excels at Polish, German, and other non-English languages
- **Cross-encoder architecture** — considers query-document pairs jointly, producing more accurate relevance scores than bi-encoder embeddings alone
- **Already on Bedrock** — uses existing AWS credentials, no new service to manage
- **Complements dense search** — catches keyword/terminology matches that pure vector search misses

### Graceful degradation

- **No AWS credentials** (local dev) → reranking is silently skipped, returns vector search results directly
- **Bedrock API error** → falls back to original top-k from vector search, logs the error
- **Fewer candidates than top-k** → skips reranking (nothing to re-order)

### Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `RERANK_MODEL` | `cohere.rerank-v3-5:0` | Bedrock model ID |
| `AWS_ACCESS_KEY_ID` | — | Required for reranking |
| `AWS_SECRET_ACCESS_KEY` | — | Required for reranking |
| `AWS_DEFAULT_REGION` | `eu-central-1` | Bedrock region |

No additional env var to enable/disable — reranking is automatically active when AWS credentials are present.

## Alternatives Considered

1. **Sparse vectors (BM25 via fastembed)** — hybrid search at the vector store level. Rejected: adds native Python dependency (`fastembed` via ONNX), increases ingestion complexity (must generate both dense + sparse vectors), and BM25 tokenizers are not optimized for Polish morphology.

2. **Meilisearch hybrid search** — keyword + semantic in one query. Rejected per ADR-11 (moving away from Meilisearch).

3. **No reranking** — rely solely on Cohere embeddings. Viable but leaves quality on the table, especially for exact-match and terminology-heavy queries.

4. **LLM-based reranking** — use a chat model to score relevance. Rejected: much higher latency and cost per query compared to a dedicated reranker.

## Consequences

- **Higher retrieval quality** — particularly for Polish content, legal/procedural documents, and exact terminology matches
- **Added latency** — ~100-200ms per query for the Bedrock API call (acceptable for chat UX)
- **Added cost** — Cohere Rerank pricing on Bedrock (low per-query cost, significantly cheaper than LLM-based reranking)
- **No impact on ingestion** — reranking is query-time only, no changes to document processing pipeline
- **Transparent in local dev** — developers without AWS credentials see no difference (graceful skip)

## Key Files

| File | Role |
|------|------|
| `src/libs/reranker/bedrock-cohere-reranker.ts` | Reranker client and `rerankDocuments()` function |
| `src/libs/reranker/index.ts` | Public exports |
| `src/libs/chains/basic-rag/operations.ts` | Integration point in `retrieveRelevantDocuments()` |

## Update (2026-09-03): reranking is opt-in, and the default provider is Scaleway

"No additional env var to enable/disable — reranking is automatically active
when AWS credentials are present" was true for a few hours. Commit `7b34ad11`,
the same day this ADR was accepted, moved the reranker off the direct Bedrock
client and onto LiteLLM, and in doing so replaced the credential sniff with an
explicit gate:

```ts
process.env.FEATURE_FLAG_RERANKING === '1' && !!process.env.LITELLM_PROXY_URL
```

The Scaleway reranker added later (`isScalewayRerankingEnabled()`) requires the
same flag plus `SCW_API_BASE` and `SCW_API_KEY`. So **reranking is off on a
default install** — the flag is unset, and any doc claiming the retrieval
improvements "all default to on" is describing three of the four.

Two further changes to the decision as written:

- **Scaleway is the default provider.** `RERANK_PROVIDER` unset means Scaleway
  `qwen3-embedding-8b`; `cohere` opts back into Bedrock Cohere Rerank v3.5 and
  needs `cohere-rerank-v3-5` uncommented in `infra/litellm/config.yaml`. The
  Scaleway model is a bi-encoder, so the "true cross-encoder" quality argument
  above applies to the opt-in path, not the default one.
- **A per-org `rerankingEnabled` setting** (default on) gates it further. It can
  only turn reranking off for an organization; it cannot turn it on when the
  env flag is unset.

Opt-in was not argued for in this ADR — it arrived with the LiteLLM move and was
never revisited. Whether it should stay opt-in is worth deciding explicitly the
next time retrieval quality is measured (ADR-20).
