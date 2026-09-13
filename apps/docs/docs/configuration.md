---
sidebar_position: 3
---

# Configuration

Every environment variable Ragen reads, grouped by decision rather than
alphabetically. If you're asking "what must I set to boot" or "what do I need
for feature X," find the section below — not a variable starting with the
right letter.

This page is curated, not a dump of `.env.example`. If a variable only tunes a
Docker Compose container's internal credentials, it isn't listed here — see
[Self-hosting](/docs/self-hosting#what-each-service-is-for) for the services
themselves.

Two things worth knowing before the tables below:

- **Most services validate their environment at boot and exit on a problem,
  reporting everything wrong at once.** `apps/web` is the deliberate
  exception: it never exits on a bad environment, because it has to stay up
  long enough to serve the first-run setup page that tells you which variable
  to fix.
- **A variable read by more than one app lives in a shared `@ragenai/env`
  fragment**, not duplicated across each app's own schema (see
  [ADR-37](https://github.com/webamigos/RagenAI/blob/main/docs/adrs/37-typed-env-contract-not-a-config-file.md)).
  If you're adding a new one, check there first.

## 1. Required to boot

| Variable | Default | If missing |
|---|---|---|
| `DATABASE_URL` | none | `apps/api` and `apps/worker` exit at boot. `apps/web` shows the setup page instead of the app. |
| `LITELLM_PROXY_URL` | none | Every model call goes through this gateway — an unset proxy URL isn't a degraded mode, it's no LLM at all. `apps/api`/`apps/worker` refuse to boot; `apps/web` throws the first time a chat call is made. |
| `LITELLM_MASTER_KEY` | none | Fine to leave unset on a local install. Required the moment `TARGET_ENV` is a deployed value (`staging`, `production`, etc.) — enforced separately in `apps/web`, `apps/api`, and `apps/worker`. |
| `BETTER_AUTH_SECRET` | none | Optional in the schema, but read with a non-null assertion when Better Auth signs a session or an emailed link — unset means a runtime crash the first time auth code runs, not a clean boot failure. Required on any real deployment. |
| `SECRET_KEY` | none | Encrypts organization API keys at rest. Same shape as `BETTER_AUTH_SECRET`: optional in the schema, but crashes the first time an org API key is saved or read if it's missing. Distinct from `ENCRYPTION_MASTER_KEY` below — this one is for API keys, not thread content. |
| `DEFAULT_MODEL_PROVIDER` + `DEFAULT_MODEL` | No usable fallback for chat completions if either is missing or `DEFAULT_MODEL_PROVIDER` isn't exactly `litellm` | Throws the first time a chat completion is created. (Per-organization settings have their own fallback — `gemini-3-flash-preview` — but the shared chat-completion factory does not.) |
| `TARGET_ENV` | `local` on `apps/web`; **required, no default,** on `apps/api`/`apps/worker` | Unset on `apps/web` reads as `local`, which silently skips every deployment-only check (including the `LITELLM_MASTER_KEY` rule above) — a real risk on a misconfigured deployment. Unset on `apps/api`/`apps/worker` is a hard boot failure. |

## 2. Backing services

### Postgres

| Variable | Default | If missing |
|---|---|---|
| `DATABASE_URL` | none | See above. |
| `DATABASE_DIRECT_URL` | none | Optional everywhere. Used for Prisma's direct, non-pooled connection where one is needed; omitting it just means there isn't a separate direct URL. |

### Qdrant

| Variable | Default | If missing |
|---|---|---|
| `QDRANT_URL` | `http://localhost:6333` | Fine locally. On a deployed `apps/worker`, this is required outright — a deployed worker that fell back silently used to write vectors into its own container's Qdrant and report success while they were unreachable from everywhere else, so the fallback is no longer trusted on a deployment. |
| `QDRANT_API_KEY` | none | Optional everywhere; nothing in the schemas enforces it even on a deployment, so treat "required in production" as a recommendation, not an enforced rule. |

### Redis — optional

| Variable | Default | If missing |
|---|---|---|
| `REDIS_URL` | none | **Required for `apps/worker`** (used to cache organization settings). **Optional for `apps/web`** — without it, the settings cache falls back to computing values directly, and the public chatbot widget's rate limiter fails open (rate limiting is silently disabled, not enforced with a fallback limit). Note this is not related to `apps/api`'s own rate limiting, which is in-memory and doesn't use Redis at all. |

### Temporal

| Variable | Default | If missing |
|---|---|---|
| `TEMPORAL_SERVER_ADDRESS` | none | Required by `apps/worker`; document ingestion jobs never start without it. Optional on `apps/web`/`apps/api`. |
| `TEMPORAL_NAMESPACE` | `local` | Falls back silently. |
| `TEMPORAL_CERT` / `TEMPORAL_KEY` | none | Only needed for Temporal Cloud — irrelevant to a self-hosted Temporal server. |

### LiteLLM

Covered under [Required to boot](#1-required-to-boot) for `LITELLM_PROXY_URL` and `LITELLM_MASTER_KEY`. There's nothing else a self-hoster sets on the app side — everything past that (model catalogue, provider keys) is configured on the LiteLLM proxy itself.

## 3. Models and retrieval

| Variable | Default | If missing |
|---|---|---|
| `DEFAULT_MODEL_PROVIDER` | none — must be exactly `litellm` for the chat-completion factory | See [Required to boot](#1-required-to-boot). Other provider names from `.env.example`'s list (`openai`, `google`, `anthropic`, etc.) apply elsewhere in the model layer, not to this specific factory. |
| `DEFAULT_MODEL` | No fallback in the chat-completion factory; `gemini-3-flash-preview` at the per-organization settings layer | See [Required to boot](#1-required-to-boot). |
| `EMBEDDINGS_MODEL` | `bge-multilingual-gemma2` | Falls back to the default. Must produce vectors of the same dimension on every app that reads and writes them — see `VECTOR_SIZE` below. |
| `VECTOR_SIZE` | `3584` (matching the default embeddings model) | Falls back to `3584`. If you change `EMBEDDINGS_MODEL` without updating this to match, Qdrant rejects every upsert — not caught at boot, only when ingestion actually runs. Re-index existing documents whenever you change the embedding model. |
| `FEATURE_FLAG_RERANKING` | off | Reranking never runs. A per-organization setting can turn it off even when this flag is on, but can't turn it on when the flag is off. |
| `RERANK_PROVIDER` | `scaleway` unless set to exactly `cohere` | Any other value, including a typo, silently resolves to Scaleway. |
| `RERANK_MODEL` | `qwen3-embedding-8b` for Scaleway, `cohere-rerank-v3-5` for the Cohere/Bedrock path | Falls back to the default for whichever provider is selected. |
| `SCW_API_BASE` / `SCW_API_KEY` | none | Required the moment reranking (or Scaleway-hosted models/embeddings) actually runs. `apps/worker` requires both unconditionally at boot, since it also uses them outside of reranking. |

## 4. Feature flags

Off unless set to `1`:

| Variable | Effect |
|---|---|
| `FEATURE_FLAG_RERANKING` | Re-score retrieved chunks before answering. See [above](#3-models-and-retrieval) for provider credentials. |
| `FEATURE_FLAG_PII_MASKING` | Detect and mask personal data via Presidio before it reaches a model. **This one has already caused a real incident**: a worker started without it skipped PII masking entirely at ingest, with nothing in the logs beyond a line noting the flag was off — see the 2026-09-03 entry in [`docs/rag-roadmap-status.md`](https://github.com/webamigos/RagenAI/blob/main/docs/rag-roadmap-status.md). When it's on, masking is a hard dependency: a masking failure fails the request closed rather than passing text through unmasked. |
| `FEATURE_FLAG_BUILT_IN_TOOLS` | Lets the assistant use built-in tools (Google Drive document generation). Excluded from the tool list until enabled. |
| `MODERATION_ENABLED` | Runs the OpenAI Moderation API over user messages. |
| `JAILBREAK_DETECTION_ENABLED` | Runs a prompt-injection classifier on each turn. `JAILBREAK_DETECTION_THRESHOLD` (default `0.7`) tunes its sensitivity. |

On by default, set to `0` or `false` to disable:

| Variable | Effect |
|---|---|
| `FEATURE_FLAG_DOC_SUMMARIES` | Generates a summary chunk per document at ingest. Not mentioned in `.env.example` at all — this is the one place to learn it exists. |

Multi-query expansion has no environment flag: it's a per-organization setting, on by default, alongside per-organization toggles for reranking and moderation.

## 5. Storage

| Variable | Default | If missing |
|---|---|---|
| `STORAGE_PROVIDER` | `local` | Writes to `STORAGE_LOCAL_PATH` on disk. This has been the default since [ADR-27](https://github.com/webamigos/RagenAI/blob/main/docs/adrs/27-storage-abstraction-local-by-default.md) — a deployment that predates it and relied on an implicit `s3` default should set `STORAGE_PROVIDER=s3` explicitly now. |
| `STORAGE_LOCAL_PATH` | `./data/storage` | Used only when `STORAGE_PROVIDER=local`. Mount a volume here in production — a restart otherwise loses every uploaded document, and a multi-replica deployment ends up with replicas that can't see each other's files. |
| `S3_ENDPOINT_URL`, `S3_BUCKET_NAME`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | none | Required together when `STORAGE_PROVIDER=s3` — `apps/worker` refuses to boot without all of them. Works with any S3-compatible store (AWS, Cloudflare R2, Scaleway Object Storage, MinIO, Ceph) by pointing `S3_ENDPOINT_URL` at it. These are deliberately **not** `AWS_`-prefixed, so they don't collide with the separate `AWS_*` variables used for Bedrock models and KMS encryption below — a deployment can use non-AWS S3 storage and real AWS Bedrock/KMS at the same time. |
| `S3_FORCE_PATH_STYLE` | unset (virtual-hosted-style addressing) | Set for stores that need path-style addressing — Scaleway (dotted bucket names) and MinIO/Ceph. |

## 6. Encryption and keys

| Variable | Default | If missing |
|---|---|---|
| `ENCRYPTION_PROVIDER` | Auto-detected from whichever provider's credentials are present, in the order Scaleway → KMS → local | If no credentials for any provider are present and no explicit value is given, the first attempt to encrypt or decrypt throws — not at boot, only when it's actually needed. |
| `ENCRYPTION_MASTER_KEY` | none | Required only for the `local` provider. `apps/worker` also validates the key's *shape* at boot, not just its presence, closing a real gap where a malformed key used to boot fine and only throw hours later, mid-ingest. |
| `SCW_KEY_MANAGER_KEY_ID` / `SCW_API_KEY` | none | Required together for the `scaleway` provider. `SCW_API_KEY` is shared with the Scaleway LLM/reranker path above — it isn't encryption-specific. |
| `AWS_KMS_KEY_ID` | none | Required for the `kms` provider. |
| `ALLOW_UNENCRYPTED` | off | On a deployment, encryption is required unless this is explicitly set to `1` — doing so is logged as a critical security event. Without it and without a working provider, `apps/web` shows a blocking "encryption required" screen instead of the app, and `apps/api` exits at boot. |

The three-provider scheme above (`scaleway` / `kms` / `local`, auto-detected) is
the current implementation in `packages/crypto`. [ADR-02](https://github.com/webamigos/RagenAI/blob/main/docs/adrs/02-per-org-kms-keys.md)
and [ADR-06](https://github.com/webamigos/RagenAI/blob/main/docs/adrs/06-thread-message-encryption.md)
predate it and describe an older, single-`AWS_KMS_KEY_ID`-only design — read
them for history, not for what to configure today.

## 7. Observability

| Variable | Default | If missing |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | none | **The single switch for all of it** ([ADR-22](https://github.com/webamigos/RagenAI/blob/main/docs/adrs/22-observability-opentelemetry.md)). Unset, spans are still created but never exported — not even to the console — and tracing costs effectively nothing. Give it a full URL with a scheme (`http://localhost:4318`, not just `localhost:4318`); a scheme-less value fails to parse. |
| `OTEL_SERVICE_NAME` | A per-service default computed internally | Falls back to that default when unset. |
| `NEXT_PUBLIC_OTEL_SERVICE_NAME` / `NEXT_PUBLIC_OTEL_COLLECTOR_URL` | none | Browser-side equivalents, used for client-side tracing (page loads, interactions, Web Vitals). Separate from the server-side variables because the browser needs a URL it can actually reach, not a container-internal hostname. |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_HOST` | none | A **separate pipeline from OpenTelemetry** — LLM call tracing goes through the LiteLLM proxy's own Langfuse callbacks. Set these on the LiteLLM container's environment, not on `apps/web`/`apps/api`/`apps/worker`. |

The local collector stack (OpenTelemetry Collector + Jaeger UI) is opt-in —
`docker compose --profile observability up -d` — not started by a plain
`docker compose up`.

## A note on `.env.example`

`.env.example` at the repository root is the full, commented list every value
ships with a sample for. This page is the curated version: what to set, in
what order of decision, and what actually happens if you don't. Where the two
disagree on a default or a claimed requirement, this page follows the code
(`packages/env` and each app's own schema) — `.env.example`'s comments are a
starting point, not the source of truth.
