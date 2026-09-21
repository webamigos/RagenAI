# AI Models Configuration

Ragen uses AI models in six distinct areas. This document describes each, how to
configure it, and the caveats that bite.

**`infra/llm-gateway/routes.yaml` is the source of truth for which models exist.**
A model id with no entry there is not served, whatever else names it. The
gateway also answers only for providers this deployment holds credentials for,
so a route alone is not enough. Verify both at once, with one real call per
configured model:

```bash
npm run gateway:preflight -- --probe
```

## Overview

| Area | Routed via | Env var | Default |
|---|---|---|---|
| **Embedding** | the route table → Scaleway | `EMBEDDINGS_MODEL` | `bge-multilingual-gemma2` |
| **Reranking** | Scaleway `/v1/rerank` (direct) | `RERANK_PROVIDER`, `RERANK_MODEL` | Scaleway + `qwen3-embedding-8b` |
| **Rephrasing** | the route table | `REPHRASE_MODEL` | `gemini-2.5-flash` |
| **Answer generation** | the route table | `DEFAULT_MODEL`, per-org override | `gemini-3-flash-preview` |
| **Document analysis** (`apps/worker`) | the route table | `SUMMARY_MODEL` | `gemini-2.5-flash` |
| **Moderation** | OpenAI direct | `OPENAI_MODERATION_KEY` | fixed endpoint |

Everything except moderation and reranking resolves through the route table
(ADR-49). Moderation uses OpenAI's dedicated Moderation API, which is not a chat
model and has no route; reranking has its own endpoint
(`RERANK_COHERE_BASE_URL` for the Cohere variant) because the rerank shape is
not OpenAI's.

## 1. Embedding

Generates vectors for document chunks at ingest and for queries at retrieval.

- `EMBEDDINGS_MODEL` — default `bge-multilingual-gemma2` (Scaleway). Shared by app, api and worker; all three must agree.
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
  Rerank v3.5 via `RERANK_COHERE_BASE_URL`
- `RERANK_MODEL` — default `qwen3-embedding-8b` on Scaleway,
  `cohere-rerank-v3-5` on the Cohere path
- `SCW_API_BASE` — Scaleway endpoint; the client appends `/rerank`

Opting back into Cohere needs AWS credentials **and** `RERANK_COHERE_BASE_URL`
pointed at something that speaks the rerank shape.

Code: `src/libs/reranker/` (`index.ts` picks the provider).

## 3. Rephrasing

Turns a multi-turn exchange into a standalone question before retrieval, and —
in the same call — produces the multi-query variants (ADR-15).

- `REPHRASE_MODEL` — default `gemini-2.5-flash`
- `REPHRASE_TEMPERATURE` — default `0.5`

**Do not upgrade the rephrase model without explicit approval** — it runs on
every question and cost matters.

Code: `src/app/api/threads/services/initializeBasicRag.ts`.

## 4. Answer generation

The final user-facing answer, generated over the retrieved context.

- `DEFAULT_MODEL_PROVIDER=litellm` (the pricing namespace, not a gateway),
  `DEFAULT_MODEL` — the fallback when an
  organization has no preference. With neither set, the compiled-in fallback is
  `defaultOrganizationSettings.model`.
- Per-organization selection happens in the app UI, constrained by
  `OrganizationSettings.allowedModels` (empty = no restriction)

`gpt-5.4` is provisioned and is **not** the default — a route existing is not
the same as a model being chosen, and the two are easy to confuse when reading
`routes.yaml`.

Code: `src/app/lib/services/llm.ts`,
`src/app/lib/actions/checkAvailableProviders.ts`.

## 5. Document analysis in the worker

`SUMMARY_MODEL` names one model for **four** worker activities, not just the
summary its name suggests:

| Activity | What it does |
|---|---|
| `generate-document-summary` | a 1–2 paragraph summary at ingest ([ADR-16](adrs/16-document-summaries-at-ingest.md)), so retrieval has something document-level to match against rather than chunks alone |
| `score-document-for-rag` | scores how well a document suits retrieval |
| `optimize-document-suggestions` | proposes edits that would make it retrieve better |
| `evaluate-suggestion-dimensions` | grades those suggestions |

Changing the variable moves all four at once — which is the point (they are the
same kind of call on the same kind of input) and is worth knowing before
tuning it for one of them.

- `SUMMARY_MODEL` — default `gemini-2.5-flash`, set in
  `apps/worker/src/consts.ts`

**Why not a smaller model.** `gemini-2.5-flash` beat `gpt-5.4-nano` here on the
two things this call actually needs: it is faster for short outputs, and its
Polish is stronger. A summary is written once per document and read on every
retrieval against it, so the quality is worth more than the token price — the
opposite of the rephrase call two sections above, which runs on every question.

This one runs in `apps/worker`, not `apps/web`, which is why changing it means
redeploying the worker.

## 6. Moderation

Checks user messages for harmful content before processing. **Not routed through
the gateway** — it calls OpenAI's Moderation API directly, which is a different
endpoint shape from chat completions.

- `OPENAI_MODERATION_KEY` — falls back to `OPENAI_API_KEY`; an org-level key
  takes precedence over both
- The model is not configurable — the Moderation API is a fixed endpoint
- It is **free**, and there is no alternative provider

This is the one reason an `OPENAI_API_KEY` may be needed by a deployment whose
chat models are served by somebody else entirely.

Code: `src/app/lib/services/llm.ts` → `createModerationInstance()`, called from
`src/libs/chains/basic-rag/chain.ts`.

## Restricting which models an organization may use

The route table says which models *exist*. When `allowedModels` is non-empty an
organization is offered the intersection of the two — a model has to be in the
route table *and* in the allowlist. An empty allowlist restricts nothing, and
the route table alone decides.

`OrganizationSettings.allowedModels` (`String[]`) holds the restriction. It
defaults to `[]`, and **empty means no restriction** rather than "nothing
allowed" — the back-compatible reading, since every organization predates the
column.

- The filter is `getAvailableModelsForOrganization()` in
  `apps/web/src/app/lib/actions/checkAvailableProviders.ts`.
- Platform-wide defaults live in the `Settings` table under
  `default_allowed_models`, and are copied onto a new organization by
  `applyDefaultLimitsToOrg()`.
- Reads and writes go through
  `apps/web/src/features/organizations/services/organization-settings.ts`:
  `getAllowedModels()`, `saveAllowedModels()`, `getDefaultAllowedModels()`,
  `saveDefaultAllowedModels()`.
- The admin UI is `apps/admin/src/app/(dashboard)/models/` — platform-wide
  scope, so it belongs in `apps/admin` rather than `apps/web` (ADR-35).

## Environment summary

```env
DEFAULT_MODEL_PROVIDER=litellm
DEFAULT_MODEL=gemini-3-flash-preview

REPHRASE_MODEL=gemini-2.5-flash
REPHRASE_TEMPERATURE=0.5

SUMMARY_MODEL=gemini-2.5-flash   # apps/worker, ADR-16

EMBEDDINGS_MODEL=bge-multilingual-gemma2
# VECTOR_SIZE=3584            # must match EMBEDDINGS_MODEL

# RERANK_PROVIDER=scaleway    # unset behaves the same
# RERANK_MODEL=qwen3-embedding-8b

OPENAI_MODERATION_KEY=sk-...  # optional, falls back to OPENAI_API_KEY
```

See `.env.example` for the full list with inline notes.
