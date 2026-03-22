# AI Models Configuration

Ragen uses AI models in four distinct areas. This document describes each, how to configure them, and important caveats.

## Overview

| Area | Provider | Connection | Env Var | Default |
|---|---|---|---|---|
| **Embedding** | Cohere (via AWS Bedrock) | AWS Bedrock | `EMBEDDING_MODEL` | `cohere.embed-multilingual-v3` |
| **Moderation** | OpenAI | Direct (native API) | — (not configurable) | `omni-moderation-latest` |
| **Rephrasing** | Any (via OpenRouter) | OpenRouter | `REPHRASE_MODEL` | `google/gemini-2.0-flash-001` |
| **Answer generation** | Any (via OpenRouter or native) | Configurable per-org | Per-org settings | `openai/gpt-4o` |

## 1. Embedding

**Purpose**: Generates vector embeddings for document chunks during indexing and for user queries during retrieval.

**Provider**: Cohere via AWS Bedrock. Uses `inputType` differentiation (`search_document` for indexing, `search_query` for retrieval) for improved retrieval quality.

**Configuration**:
- `EMBEDDING_MODEL` — model name (default: `cohere.embed-multilingual-v3`)
- `AWS_BEDROCK_REGION` — Bedrock region (defaults to `AWS_DEFAULT_REGION`, then `eu-central-1`)
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — AWS credentials (shared with S3)

**Code**: `src/app/lib/services/llm.ts` → `createEmbeddingsInstance()`

> **Warning**: Changing the embedding model after documents have been indexed will produce incompatible vectors. You must re-index all documents if you change this value.

**Current model**:
| Model | Dimensions | Cost (per 1M tokens) | Notes |
|---|---|---|---|
| `cohere.embed-multilingual-v3` | 1024 | ~$0.10 | Default. Strong multilingual (Polish+English) support, EU data residency via `eu-central-1` |

## 2. Moderation

**Purpose**: Content moderation of user messages before processing. Checks for harmful content categories.

**Provider**: OpenAI only (uses the dedicated Moderation API endpoint, not chat completions).

**Configuration**:
- `OPENAI_MODERATION_KEY` — dedicated API key (falls back to `OPENAI_API_KEY`)
- Model is not configurable (OpenAI Moderation API is a fixed endpoint)

**Code**: `src/app/lib/services/llm.ts` → `moderateContent()`

**Notes**:
- The OpenAI Moderation API is **free** — no cost per request
- There is no alternative provider for this API
- No reason to change this; it's free and works well

## 3. Rephrasing

**Purpose**: Rephrases the user's question using conversation context to create a standalone query for RAG retrieval. This improves search quality by resolving pronouns and references.

**Provider**: Any model available via OpenRouter (uses the `openrouter/` prefix internally).

**Configuration**:
- `REPHRASE_MODEL` — OpenRouter model identifier (default: `google/gemini-2.0-flash-001`)
- `REPHRASE_TEMPERATURE` — temperature for generation (default: `0.5`)

**Code**:
- `src/app/api/threads/services/initializeBasicRag.ts`
- `src/app/api/guest-threads/[...guestDetails]/services/initializePublicBasicRag.ts`

**Recommendations**:
| Model | Cost (per 1M tokens) | Notes |
|---|---|---|
| `google/gemini-2.0-flash-001` | ~$0.10 in / $0.40 out | Default. Fast, cheap, sufficient for rephrasing |
| `openai/gpt-4o-mini` | ~$0.15 in / $0.60 out | Alternative. Slightly more expensive |
| `openai/gpt-4o` | ~$2.50 in / $10.00 out | Previous default. Overkill for rephrasing |

## 4. Answer Generation

**Purpose**: Generates the final answer shown to the user, using the retrieved context from RAG.

**Provider**: Configurable per-organization through the app UI (Settings → Model). Supports OpenAI, Anthropic, Google, and other providers via OpenRouter or native APIs.

**Configuration**: Managed via organization settings in the app UI, not via env vars. Default model is set by `DEFAULT_MODEL_PROVIDER` and `DEFAULT_MODEL` env vars.

**Code**: `src/app/lib/services/llm.ts` → `createLlmInstance()`

## Environment Variables Summary

```env
# Answer model defaults (used when org has no custom config)
DEFAULT_MODEL_PROVIDER=openai
DEFAULT_MODEL=gpt-4o

# Rephrase model (routed via OpenRouter)
REPHRASE_MODEL=google/gemini-2.0-flash-001
REPHRASE_TEMPERATURE=0.5

# Embedding model (Cohere via AWS Bedrock)
EMBEDDING_MODEL=cohere.embed-multilingual-v3
# AWS_BEDROCK_REGION=eu-central-1  # defaults to AWS_DEFAULT_REGION, then eu-central-1

# API keys
OPENAI_API_KEY=sk-...          # Still needed for moderation
OPENAI_MODERATION_KEY=sk-...   # Optional, falls back to OPENAI_API_KEY
AWS_ACCESS_KEY_ID=...          # Shared with S3
AWS_SECRET_ACCESS_KEY=...      # Shared with S3
```
