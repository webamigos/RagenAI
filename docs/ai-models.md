# AI Models Configuration

Ragen uses AI models in four distinct areas. This document describes each, how to
configure it, and the caveats that bite.

**`litellm/config.yaml` is the source of truth for which models exist.** Only
eight entries are uncommented today; everything else (`gpt-5.4-nano`,
`gpt-5.3-chat`, `claude-opus-4-6`, `claude-haiku-4-5`, `gemini-2.5-pro`,
`cohere-rerank-v3-5`, `cohere-embed-multilingual-v3`) is commented out and will
fail at the proxy until re-enabled. Verify with `curl localhost:4000/v1/models`.

## Overview

| Area | Routed via | Env var | Default |
|---|---|---|---|
| **Embedding** | LiteLLM → Scaleway | `EMBEDDING_MODEL` | `bge-multilingual-gemma2` |
| **Reranking** | Scaleway `/v1/rerank` (direct) | `RERANK_PROVIDER`, `RERANK_MODEL` | Scaleway + `qwen3-embedding-8b` |
| **Rephrasing** | LiteLLM | `REPHRASE_MODEL` | `gemini-2.5-flash` |
| **Answer generation** | LiteLLM | `DEFAULT_MODEL`, per-org override | `gemini-3-flash-preview` |
| **Moderation** | OpenAI direct (not LiteLLM) | `OPENAI_MODERATION_KEY` | fixed endpoint |

Everything except moderation and reranking goes through the LiteLLM proxy
(ADR-04). Moderation uses OpenAI's dedicated Moderation API, which has no
LiteLLM equivalent; reranking calls Scaleway directly because LiteLLM's `cohere/`
adapter targets Cohere's `/v2/rerank` shape.

## 1. Embedding

Generates vectors for document chunks at ingest and for queries at retrieval.

- `EMBEDDING_MODEL` — default `bge-multilingual-gemma2` (Scaleway)
- `VECTOR_SIZE` — **must match the model**: 3584 for `bge-multilingual-gemma2`,
  1024 for `cohere-embed-multilingual-v3`. Defaults to 3584 in code
  (`src/libs/vector-store/qdrant-client.ts`). A mismatch makes Qdrant reject
  every upsert.

Code: `src/app/lib/services/llm.ts` → `createEmbeddingsInstance()`.

> **Warning:** changing the embedding model after documents are indexed produces
> incompatible vectors. Re-index everything if you change it — and change
> `VECTOR_SIZE` with it.

## 2. Reranking

Post-retrieval cross-encoder that sharpens the top-k (ADR-12). The chain
over-retrieves 3x, reranks, and falls back to the raw vector order if the
provider errors — a rerank failure degrades quality but never breaks the answer.

- `RERANK_PROVIDER` — unset (default) → Scaleway; `cohere` → Bedrock Cohere
  Rerank v3.5 via LiteLLM
- `RERANK_MODEL` — default `qwen3-embedding-8b` on Scaleway,
  `cohere-rerank-v3-5` on the Cohere path
- `SCW_API_BASE` — Scaleway endpoint; the client appends `/rerank`

Opting back into Cohere needs AWS credentials **and** `cohere-rerank-v3-5`
uncommented in `litellm/config.yaml`.

Code: `src/libs/reranker/` (`index.ts` picks the provider).

## 3. Rephrasing

Turns a multi-turn exchange into a standalone question before retrieval, and
seeds multi-query expansion (ADR-15).

- `REPHRASE_MODEL` — default `gemini-2.5-flash`
- `REPHRASE_TEMPERATURE` — default `0.5`

**Do not upgrade the rephrase model without explicit approval** — it runs on
every question and cost matters.

Code: `src/app/api/threads/services/initializeBasicRag.ts`.

## 4. Answer generation

The final user-facing answer, generated over the retrieved context.

- `DEFAULT_MODEL_PROVIDER=litellm`, `DEFAULT_MODEL` — the fallback when an
  organization has no preference
- Per-organization selection happens in the app UI, constrained by
  `OrganizationSettings.allowedModels` (empty = no restriction)

Code: `src/app/lib/services/llm.ts`,
`src/app/lib/actions/checkAvailableProviders.ts`.

## 5. Moderation

Checks user messages for harmful content before processing. **Not routed through
LiteLLM** — it calls OpenAI's Moderation API directly, which is a different
endpoint shape from chat completions.

- `OPENAI_MODERATION_KEY` — falls back to `OPENAI_API_KEY`; an org-level key
  takes precedence over both
- The model is not configurable — the Moderation API is a fixed endpoint
- It is **free**, and there is no alternative provider

This is the one reason an `OPENAI_API_KEY` may still be needed even though all
chat traffic goes through LiteLLM.

Code: `src/app/lib/services/llm.ts` → `createModerationInstance()`, called from
`src/libs/chains/basic-rag/chain.ts`.

## Environment summary

```env
DEFAULT_MODEL_PROVIDER=litellm
DEFAULT_MODEL=gemini-3-flash-preview

REPHRASE_MODEL=gemini-2.5-flash
REPHRASE_TEMPERATURE=0.5

EMBEDDING_MODEL=bge-multilingual-gemma2
# VECTOR_SIZE=3584            # must match EMBEDDING_MODEL

# RERANK_PROVIDER=scaleway    # unset behaves the same
# RERANK_MODEL=qwen3-embedding-8b

OPENAI_MODERATION_KEY=sk-...  # optional, falls back to OPENAI_API_KEY
```

See `.env.example` for the full list with inline notes.
