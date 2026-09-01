# LiteLLM Proxy

Split out of `AGENTS.md` to keep it under Codex's 32,768-byte `project_doc_max_bytes` budget — content past that offset is silently dropped. Reached from that file's Task Router.

All LLM calls (chat + embeddings) route through LiteLLM (OpenAI-compatible). Flow: ragen-app → `@ai-sdk/openai` → LiteLLM proxy → Scaleway/Azure/Bedrock/Vertex.

**Key files**: `litellm/config.yaml` (source of truth for models), `litellm/Dockerfile`, `src/libs/litellm/client.ts`, `src/libs/llm/chat-completion-factory.ts`, `src/libs/llm/embeddings-factory.ts`, `src/app/lib/services/llm.ts`, `src/app/lib/actions/checkAvailableProviders.ts`.

**Model list drifts — always check `litellm/config.yaml`.** Snapshot:
Only eight entries are uncommented today — the rest (including `gpt-5.4-nano`, `gpt-5.3-chat`, `claude-opus-4-6`, `claude-haiku-4-5`, `gemini-2.5-pro`, `cohere-rerank-v3-5` and `cohere-embed-multilingual-v3`) are commented out and will 404 at the proxy until re-enabled:

- Scaleway: `gpt-oss-120b`, `mistral-small-3.2`, `bge-multilingual-gemma2` (embeddings, 3584-dim), `qwen3-embedding-8b` (reranking)
- Azure: `gpt-5.4`
- Bedrock: `claude-sonnet-4-6`
- Vertex: `gemini-3-flash-preview`, `gemini-2.5-flash`

**Manage models** via LiteLLM UI at `http://localhost:4000/ui` (login `admin` / `LITELLM_MASTER_KEY`). Changes reflect in ragen-app via `/v1/models`.

**Env**:
- `LITELLM_PROXY_URL` — the client falls back to `http://localhost:4000`, but `checkAvailableProviders.ts` reports LiteLLM as available only when this is **actually set** (`available: !!process.env.LITELLM_PROXY_URL`). Set it explicitly, including locally.
- `LITELLM_MASTER_KEY` (dev: `sk-litellm-dev-key`)
- `DEFAULT_MODEL_PROVIDER=litellm`
- `DEFAULT_MODEL` (e.g. `gpt-5.4`)
- `REPHRASE_MODEL` (default `gemini-2.5-flash`, hardcoded in `initializeBasicRag.ts`)
- `EMBEDDINGS_MODEL` (default `bge-multilingual-gemma2`) — set identically for app and worker; must match `VECTOR_SIZE` (3584 for this model, 1024 for `cohere-embed-multilingual-v3`); a mismatch makes Qdrant reject every upsert
- `RERANK_PROVIDER` / `RERANK_MODEL` — unset means Scaleway + `qwen3-embedding-8b`
- `FEATURE_FLAG_MULTI_QUERY`

**Langfuse tracing**: LiteLLM traces all LLM calls via `success_callback`/`failure_callback` in `config.yaml` (needs `LANGFUSE_*` env vars on the LiteLLM container). `@langfuse/otel` span processor was removed.
