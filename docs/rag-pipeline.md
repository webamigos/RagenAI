# RAG Pipeline Diagrams

Visual reference for the retrieval-quality stack. See ADRs 11, 12, 14, 15, 16 for decision history, and `AGENTS.md` for the concise prose summary.

## Ingest flow (in `ragen-worker`)

```mermaid
flowchart LR
    A[File upload] --> B[Parse<br/>PDF/DOCX/EPUB/…]
    B --> C[Chunk<br/>type-specific splitter]
    C --> D[Generate summary<br/>ADR-16]
    D --> E[Prepend summary chunk<br/>chunk_type: summary]
    E --> F[Hybrid embed<br/>Cohere dense + BM25 sparse<br/>ADR-14]
    F --> G[Upsert to Qdrant<br/>named vectors]
    F --> H[Merge UserFile.metadata.summary<br/>jsonb merge, best-effort]
```

## Retrieval flow (in `ragen-app`, `src/libs/chains/basic-rag/`)

```mermaid
flowchart TD
    Q[User question] --> R[Rephrase → standalone question]
    R --> X[expandQueries<br/>ADR-15<br/>+2 alternative phrasings via LLM]
    X --> P["[standalone, variant1, variant2]"]
    P --> S1[Hybrid search<br/>q=standalone]
    P --> S2[Hybrid search<br/>q=variant1]
    P --> S3[Hybrid search<br/>q=variant2]
    S1 --> D1[Qdrant RRF fusion<br/>dense + sparse per query<br/>ADR-14]
    S2 --> D1
    S3 --> D1
    D1 --> U[Dedupe by content]
    U --> RR[Cohere Rerank v3.5<br/>ADR-12]
    RR --> G[Answer generation<br/>with citation prompting<br/>ADR-16]
```

## Vector store query (Qdrant hybrid)

```mermaid
flowchart LR
    Q[Query text] --> D[Dense embed<br/>Cohere multilingual]
    Q --> S[Sparse encode<br/>BM25 tokens<br/>pure TS]
    D --> P[Qdrant Query API]
    S --> P
    P --> RRF[Server-side<br/>RRF fusion]
    RRF --> K[top-k fused]
    K --> C[Cohere Rerank<br/>ADR-12]
```

## How the four improvements compose

| ADR | Pipeline stage | Problem it solves |
|-----|---------------|-------------------|
| **ADR-12** Cohere Rerank | After retrieval | Sharpens top-k by cross-encoder precision |
| **ADR-14** Hybrid search | At retrieval | Exact-term + morphological matches that dense alone misses |
| **ADR-15** Multi-query | Before retrieval | Vocabulary mismatch between user phrasing and document phrasing |
| **ADR-16** Summaries | At ingest | Per-document topic anchors that no flat chunk contains |

ADR-14/15/16 widen the candidate pool; ADR-12 sharpens it. All four are gated behind env flags that default to on.
