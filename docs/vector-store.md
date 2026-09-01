# Vector Store (Qdrant, Hybrid)

Split out of `AGENTS.md` to keep it under Codex's 32,768-byte `project_doc_max_bytes` budget. Reached from that file's Task Router.

Default: Qdrant hybrid named vectors + server-side RRF fusion. Meilisearch and Supabase are legacy dense-only, selected via `Organization.vectorStore` (`null|'qdrant'|'meilisearch'|'supabase'`).

**Collection schema**:
```
vectors:         dense  { size: 3584, distance: Cosine }  # bge-multilingual-gemma2 (VECTOR_SIZE)
sparse_vectors:  sparse { modifier: idf }                 # Qdrant server-side BM25
```

**Query flow**: dense embed + BM25 sparse encode → Qdrant Query API with two `prefetch` branches + `fusion: 'rrf'` → top-k fused. Falls back to dense-only when query has no tokenizable content (e.g. `"42 !!"`). `PREFETCH_MULTIPLIER = 4`.

**Key files**: `src/libs/vector-store/types.ts` (`VectorStoreClient` interface), `qdrant-client.ts`, `meilisearch-client.ts`, `supabase-client.ts`. The BM25 encoder and the vector contract (`VECTOR_SIZE`, `dense`/`sparse` names, batch/prefetch sizes, default embedding model) live in **`packages/rag-core`** — one source of truth for app, api and worker, since a divergence there breaks retrieval silently (ADR-26). Do not re-introduce per-app copies.

**Config**:
- Per-org Qdrant collection (named by org ID)
- Payload indexes: `metadata.project_id`, `file_id`, `organization_id`, `accessible_by` (keyword type). NOTE: ADR-11 mentioned `project_public_id` but that index was never created — retrieval filters use internal `project_id`.
- `metadata.chunk_type: 'summary'` marks ADR-16 summary chunks (participate in normal hybrid retrieval).
- Filter format: intermediate `{ must: [...], should: [...] }`; each client converts internally.
- Env: `QDRANT_URL` (default `http://localhost:6333`), `QDRANT_API_KEY` (optional).
- **Schema break**: hybrid collections use named vectors; pre-ADR-14 unnamed collections are incompatible — vector store was wiped before rollout.
