# ADR-08: Meilisearch as Vector Store

**Status:** Accepted
**Date:** 2024-09-01

## Context

The RAG pipeline needs a vector store for document retrieval. Requirements: hybrid search (keyword + semantic), per-organization data isolation, and reasonable operational complexity.

## Options Considered

1. **Pinecone** — managed vector DB, strong semantic search, no keyword search
2. **Qdrant** — self-hosted vector DB, good performance, no built-in keyword search
3. **Supabase pgvector** — PostgreSQL extension, simple but limited hybrid search
4. **Meilisearch** — search engine with experimental vector store support, native hybrid search

## Decision

**Meilisearch** with the `vectorStore` experimental feature enabled.

**Rationale:**
- **Native hybrid search** — keyword + vector in a single query (no need to combine two systems)
- **Per-organization isolation** — each org gets its own Meilisearch index (named by org ID)
- **Simple operations** — single binary, low resource usage, easy Docker deployment
- **Good enough** semantic search for RAG use case

### Configuration

- Embeddings: `userProvided` embedder with Cohere `cohere-embed-multilingual-v3` via LiteLLM (1024 dimensions)
- Experimental vector feature enabled via `PATCH /experimental-features` API call
- Qdrant-style filter objects converted to Meilisearch filter strings internally

## Consequences

- Vector store is experimental in Meilisearch — API may change across versions
- Not as performant as dedicated vector DBs (Qdrant, Pinecone) for pure semantic search at scale
- `VectorStoreClient` interface (`src/libs/vector-store/types.ts`) abstracts the implementation, making future migration possible
- Meilisearch metadata keys use snake_case (external system convention, not governed by Prisma camelCase)
