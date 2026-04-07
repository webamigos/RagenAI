# ADR-11: Qdrant as Default Vector Store

**Status:** Accepted (supersedes ADR-08)
**Date:** 2026-04-02

## Context

ADR-08 selected Meilisearch as the vector store for its native hybrid search capabilities. After production usage, several limitations emerged:

- **Experimental vector support** — Meilisearch's vector search remained experimental, with breaking changes across versions and limited configurability (no HNSW parameter tuning, no quantization)
- **Scalability ceiling** — single-node Meilisearch struggled with growing document volumes; no built-in replication or sharding
- **No native reranking integration** — hybrid search ratio was fixed, with no support for learned reranking
- **Limited vector operations** — no support for updating vector payloads without re-embedding, no scroll/pagination for batch operations

Qdrant is a purpose-built vector database with mature production features, strong multilingual support, and a clean REST/gRPC API.

## Decision

**Qdrant** as the default vector store for all new organizations. Existing Meilisearch organizations continue working (multi-backend support preserved via `VectorStoreClient` interface).

### Configuration

- **Collection per organization** — each org gets its own Qdrant collection (named by org ID), same isolation model as Meilisearch indexes
- **Embeddings** — unchanged: `cohere-embed-multilingual-v3` (1024 dimensions) via LiteLLM proxy
- **Distance metric** — Cosine similarity
- **Payload indexes** — `metadata.organization_id`, `metadata.project_id`, `metadata.project_public_id`, `metadata.file_id`, `metadata.accessible_by` (keyword type)
- **Filter format** — intermediate filter format (`{ must: [...], should: [...] }`) used across the codebase, converted to Qdrant native format in the client

### Deployment

- **Local dev:** `docker compose up` includes Qdrant on port 6333
- **Railway:** official `qdrant/qdrant` Docker image, persistent volume at `/qdrant/storage`, API key via `QDRANT__SERVICE__API_KEY`
- **Env vars:** `QDRANT_URL` (required), `QDRANT_API_KEY` (optional for local, required for prod)

### Multi-backend support

The `Organization.vectorStore` column determines which backend to use:
- `null` or `'qdrant'` → Qdrant (new default)
- `'meilisearch'` → Meilisearch (legacy, still supported)
- `'supabase'` → Supabase pgvector (still supported)

New orgs created via auth hooks, onboarding, or settings default to `process.env.DEFAULT_VECTOR_STORE || 'qdrant'`.

## Consequences

- **Better scalability** — Qdrant supports horizontal scaling, sharding, and replication for production loads
- **Richer vector operations** — payload updates, scroll pagination, and named vectors enable features like permission syncing and batch backfills
- **No built-in keyword search** — pure semantic search only (offset by adding Cohere Rerank as a post-retrieval quality step, see ADR-12)
- **Additional infrastructure** — Qdrant container in docker-compose and Railway deployment
- **Migration path** — existing Meilisearch orgs are unaffected; can be migrated by re-triggering embedding workflows after switching `vectorStore` column to `'qdrant'`

## Key Files

| File | Role |
|------|------|
| `src/libs/vector-store/qdrant-client.ts` | Qdrant `VectorStoreClient` implementation |
| `src/libs/vector-store/index.ts` | Exports all vector store clients |
| `src/libs/vector-store/types.ts` | `VectorStoreClient` interface |
| `src/app/api/threads/services/initializeBasicRag.ts` | RAG chain initialization with backend selection |
| `src/app/api/threads/services/saveDataInVectorTable.ts` | Document ingestion |
| `src/app/api/upload/services/TableService.ts` | Document deletion |
| `docker-compose.yml` | Qdrant service definition |
