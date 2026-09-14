# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ragen Worker is a **Temporal worker** that processes document parsing, embedding, and website scraping tasks for the Ragen AI platform. It consumes jobs from a Temporal task queue, orchestrating file downloads from S3, document parsing, text chunking, **document summary generation**, **hybrid embedding generation** (dense + BM25 sparse), thumbnail creation, and vector storage in Qdrant (with Meilisearch as legacy fallback).

See the repo's ADRs (root `docs/adrs/`) for the retrieval-quality decisions this worker implements:
- [ADR-14](../../docs/adrs/14-hybrid-search-dense-sparse.md) — hybrid dense + BM25 sparse vectors with RRF fusion
- [ADR-16](../../docs/adrs/16-document-summaries-at-ingest.md) — ingest-time document summaries as synthetic chunks + `UserFile.metadata.summary`

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start worker in watch mode (tsx) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Build then run compiled worker |
| `npm run test` | Run the Vitest suite |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run lint` | Run ESLint |
| `temporal server start-dev` | Start local Temporal dev server |

Run a single test file: `npx vitest run path/to/test.ts`

The suite runs on Vitest, not Jest — see [ADR-48](../../docs/adrs/48-worker-and-api-tests-run-on-vitest.md).
It keeps Jest's injected globals (`describe`/`it`/`expect`) via `globals: true`,
so the difference in a test file is `vi.*` instead of `jest.*`. Two things that
Jest allowed and Vitest does not: a `vi.mock` factory cannot close over a
plain `const` (use `vi.hoisted`), and a mocked constructor must be a `function`
or `class`, never an arrow.

The Presidio integration suite has its own config and still needs the
containers: `npm run test:presidio-integration`.

## Architecture

### Temporal Workflow System

The worker connects to a Temporal server and listens on the `ragen-tasks` queue. It has two main workflows:

- **`runFileEmbeddings`** (`src/workflows/parse-and-embed.ts`) - Main pipeline: download file from S3 → detect type → parse document → split into chunks → generate summary → prepend synthetic summary chunk → hybrid-embed (dense + sparse) → store in Qdrant → merge `UserFile.metadata.summary`
- **`scrapeWebsite`** (`src/workflows/scrape-website.ts`) - Scrape website via FireCrawl → create document → generate embeddings → store in Qdrant

**runFileEmbeddings flow:**

```mermaid
flowchart LR
    A[S3 download] --> B[parse<br/>loader per type]
    B --> C[splitText<br/>chunk]
    C --> D[generateDocumentSummary<br/>best-effort]
    D --> E["prepend chunk_type: summary"]
    E --> F[prepareMetadata]
    F --> G["addDocumentsToVectorStore<br/>hybrid: dense + sparse"]
    G --> H[mergeFileMetadata<br/>jsonb || merge]
```

The summary step is best-effort: feature flag off, empty input, LLM errors, and Temporal-level failures all degrade to "no summary" without affecting ingest success. `mergeFileMetadata` runs **outside** the embedding try-catch so a DB error cannot falsely mark embedding as FAILED.

Workflows support cancellation via the `cancelEmbedding` signal and state queries via `embeddingState`.

### Activities (`src/activities/`)

Activities are the executable units within workflows. They are grouped by domain:
- `ai-usage/` - Embedding usage reporting to the Ragen app
- `api-keys/` - API key retrieval and management
- `aws/` - S3 file download/upload
- `db/` - PostgreSQL operations. Includes `mergeFileMetadata` (ADR-16) — JSONB `||` merge on `UserFile.metadata` so summary keys are added without clobbering existing keys like Google Drive import fields
- `documents/` - Document record creation and text generation. Includes `generateDocumentSummary` (ADR-16) — best-effort 1-2 paragraph summary via `SUMMARY_MODEL`, feature-flagged via `FEATURE_FLAG_DOC_SUMMARIES`, catches LLM errors internally and returns `""`
- `embeddings/` - Embedding preparation and metadata
- `files/` - File validation (binary detection, MIME type checking)
- `loaders/` - Document parsing (PDF, EPUB, DOCX, SRT, text, CSV, XLSX, image, website via FireCrawl)
- `meilisearch/` - Vector storage (delegates to `services/qdrant.ts` which writes hybrid dense + sparse vectors — see ADR-14)
- `notifications/` - Pusher real-time notifications
- `splitters/` - Text chunking with type-specific settings
- `thumbnails/` - PDF thumbnail generation (Sharp/resvg) and S3 upload

### Services (`src/services/`)

Core infrastructure layer:
- **`llm/`** - Vercel AI SDK provider setup (`provider.ts`): `getChatModel()` and `getEmbeddingModel()`. Which path they take is `LLM_GATEWAY` — `litellm` (the default) routes through the proxy, `native` resolves the model through `@ragenai/llm-gateway` and calls Azure, Bedrock, Vertex or an OpenAI-compatible endpoint directly. `native-models.ts` is the binding. Two things to know: **every getter is `async`**, including the two master-key ones that used not to be, and **`generateTextWithPdf` has two genuinely different implementations** — the proxy one hand-builds a request whose PDF rides inside an `image_url`, which only ever worked because LiteLLM rewrote it into a Bedrock Converse document block; the native one passes a real `file` content part to `generateText`. See B2b in [the retirement spec](../../docs/specs/2026-09-14-replace-litellm-with-an-in-process-gateway.md).
- **`chains/`** - LLM chains for document processing (e.g., `pdf-process-rag/` for PDF RAG pipeline, image description via vision LLM)
- **`text-splitters/`** - Custom text splitting (RecursiveCharacterTextSplitter, MarkdownTextSplitter)
- **`db/`** - PostgreSQL queries, all on Prisma since
  [ADR-40](../../docs/adrs/40-worker-uses-prisma-not-knex.md). `prisma.ts`
  builds the client from the monorepo's shared schema; `db.ts` holds the query
  functions. Four of them are raw SQL — three JSONB merges and the nightly
  cleanup — because `||`, `jsonb_set` and `FOR UPDATE` have no Prisma
  equivalent. A raw statement is invisible to the tenant-scope guard, so
  `tests/architecture/raw-sql-carries-its-org-filter.test.ts` checks their org
  filter at build time instead. Add one and it has to satisfy that test.
- **`document-loaders/`** - Custom document loader implementations (PDF via Claude native/vision, SRT, DOCX via mammoth, CSV, XLSX via SheetJS, image via vision LLM, website via FireCrawl, buffer)
- **`notifications/`** - Pusher notification service configuration
- **`qdrant.ts`** - Qdrant client for vector storage (default). Writes **hybrid named vectors** per ADR-14: each point has a `dense` vector (Cohere 1024-dim) and a `sparse` vector (BM25 term frequencies). Collections are created with `sparse_vectors: { sparse: { modifier: 'idf' } }` so Qdrant applies IDF weighting server-side at query time. Chunks with no tokenizable content (pure numbers/punctuation) store only the dense vector — Qdrant accepts partial named vectors.
- **`bm25-encoder.ts`** - Pure-TS BM25 encoder: unicode-aware tokenizer (works for mixed Polish/English), NFKC + lowercase normalization, FNV-1a 32-bit stable hashing, raw term frequencies. Now imported from `@ragenai/rag-core` — the hand-maintained per-app copies were collapsed into one shared package by [ADR-26](../../docs/adrs/26-absorb-ragen-worker-into-monorepo.md). Do not add a local copy back: indexing and querying must hash terms identically.
- **`meilisearch.ts`** - Meilisearch client for vector storage (legacy fallback, dense-only)
- **`redis.ts`** - Redis singleton for caching organization settings (uses hashed keys)
- **`aws.ts`** - S3 client configuration
- **`langfuse-trace.ts`** - OTel span wrapper for LLM call grouping (Langfuse tracing itself is handled by LiteLLM proxy)
- **`logger.ts`** - Pino logger with OpenTelemetry bridge
- **`otel-logger.ts`** - OpenTelemetry log emitter

**Embedding input limits** — batch size and per-text truncation come from
`@ragenai/rag-core`'s `embedding-contract.ts` (`prepareEmbeddingBatches`), not
from local constants. `qdrant.ts` and `meilisearch.ts` each had their own copy
and had already drifted: qdrant truncated oversized chunks, meilisearch did
not, so the same document could be embedded from different text depending on
the backend. Do not reintroduce a local `EMBED_BATCH_SIZE` or
`MAX_EMBEDDING_TEXT_CHARS`.

### Observability (`src/instrument.ts`)

OpenTelemetry instrumentation with OTLP exporters for traces, metrics, and logs. LLM call tracing is handled by LiteLLM proxy → Langfuse (not by the worker directly). Pino structured logging with OTel bridge.

### Key Types (`src/types/`)

- `UserFile.ts` - Enums for `ParsingStatus`, `EmbeddingStatus`, and `FileType` (PDF, EPUB, DOCX, SRT, TEXT, MARKDOWN, URL, IMAGE, CSV, XLSX)
- `UserDocument.ts` - Document type definitions
- `Document.ts` - Simple `{ pageContent, metadata }` document type used throughout the pipeline

### Utilities (`src/utils/`)

- `env.ts` - Environment variable helpers
- `get-file-extension.ts` - File extension detection
- `get-open-api-keys.ts` - OpenAI API key resolution
- `hash-api-keys.ts` - API key hashing for Redis
- `splitters.ts` - Splitter configuration utilities
- `supported-mime-types.ts` - MIME type allowlist

## Temporal-Specific Constraints

- **Activities must return plain objects** - methods/functions are lost during serialization
- **Use string names for workflows in production** - passing workflow functions works in dev but breaks in prod due to different build artifacts
- **After renaming an activity**, Temporal Cloud may still reference the old name; create a new workflow name instead
- **Only one worker instance** should run with a given build at a time

## Deployment

- **Docker**: Multi-stage Dockerfile using Node 24-slim. Runs as non-root `worker` user.
- **Railway**: configured in the dashboard, not in this repository — see [ADR-47](../../docs/adrs/47-railway-configuration-lives-in-the-dashboard.md). The `railway.toml` that used to sit here was never read, and the "max 3 retries" it claimed was not what production ran. **A start command changes in the Dockerfile `CMD`.**

## Tech Stack

- **Temporal** v1.13.0 for workflow orchestration
- **Vercel AI SDK** (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`) for LLM chat completions, embeddings, and Claude native PDF processing, all routed through **LiteLLM proxy** (shared with apps/web)
- **SheetJS** (`xlsx`) for CSV/Excel file parsing
- **Prisma** + PostgreSQL for persistence, generated from the root
  `prisma/schema.prisma` via its own `workerClient` generator
  ([ADR-40](../../docs/adrs/40-worker-uses-prisma-not-knex.md)). The generated
  client is in `apps/worker/generated/` — outside `src/` deliberately, because
  `tsc --build` copies only what it compiles and the client is `.js`/`.wasm`.
  Knex is gone.
- **Qdrant** (`@qdrant/js-client-rest`) for vector storage (default)
- **Meilisearch** (`meilisearch`) for vector storage (legacy)
- **Redis** (ioredis) for caching
- **AWS S3** for document storage
- **Sharp** + **@resvg/resvg-js** for image processing and thumbnail generation
- **Langfuse** for LLM observability (tracing handled by LiteLLM proxy, worker uses OTel spans for grouping)
- **Zod** for environment variable validation (`src/config/env.ts`)
- **Pino** + **OpenTelemetry** for logging and observability
- **Pusher** for real-time notifications

## Code Style

- ESLint flat config with TypeScript; `no-console` rule enforced in `src/`
- Prettier with single quotes
- Conventional commits enforced via commitlint + husky
- Pre-commit hooks run eslint and prettier on staged files via lint-staged
- Semantic release for automated versioning on `main`

## Environment

Requires Node >= 24. Copy `.env.example` for local setup. Key env vars:
- **Infrastructure**: `TEMPORAL_SERVER_ADDRESS`, `DATABASE_URL`, `REDIS_URL`, `QDRANT_URL`, `QDRANT_API_KEY`, `MEILISEARCH_URL` (legacy), `PUSHER_*`, `FIRECRAWL_API_KEY`
- **LLM**: `LLM_GATEWAY` (`litellm` default, or `native`) picks the path. On the proxy path, `LITELLM_PROXY_URL` and `LITELLM_MASTER_KEY` (shared with apps/web, default `http://localhost:4000`); the master key is required in deployed environments, **unless** `LLM_GATEWAY=native`, where nothing authenticates to a proxy. On the native path, the provider credentials in `infra/llm-gateway/README.md` and optionally `LLM_ROUTES_PATH`.
- **Document parsing**: `DOCUMENT_PARSER` (`docling` default, or `legacy`), `DOCLING_URL`, `DOCLING_STRICT`. Docling parses locally, which is why it is the default — the legacy PDF loader sends the document to an external model. On a Docling failure the workflow falls back to the legacy loaders; `DOCLING_STRICT=1` makes it fail the ingest instead, which is what a confidential deployment wants, because the fallback would otherwise ship the document off-site exactly when local parsing is unavailable. SRT and EPUB always use their legacy loader; PPTX only works via Docling.
- **PDF processing (legacy path only)**: `PDF_PROCESSOR` (`claude` default or `vision`), `PDF_MODEL` (defaults to `claude-haiku-4-5`) — uses LiteLLM Anthropic pass-through for usage tracking.

  > **`claude-haiku-4-5` is not served by anything.** It is commented out in `infra/litellm/config.yaml` and absent from `infra/llm-gateway/routes.yaml`, so this path fails on either value of `LLM_GATEWAY` unless a deployment sets `PDF_MODEL` to a live model. It only bites when Docling fails (or `DOCUMENT_PARSER=legacy`), which is why it has gone unnoticed. `availableModels.mini`/`.nano` in `services/chains/pdf-process-rag/config.ts` (`gpt-5.4-mini`, `gpt-5.4-nano`, used by `load-image.ts`) have the same problem. Found while doing B2b; picking replacements is a model decision, not a refactor, so it is deliberately not fixed there.
- **Embeddings**: `EMBEDDINGS_MODEL` (default `bge-multilingual-gemma2`, 3584-dim) — must match apps/web's value and `VECTOR_SIZE`
- **Summaries (ADR-16)**: `SUMMARY_MODEL` (default `gemini-2.5-flash` — faster than gpt-5.4-nano for the short-output summary task in practice, and strong Polish support; **do not upgrade to a larger model without explicit approval**, summaries run per-document and cost matters). `FEATURE_FLAG_DOC_SUMMARIES` (default on; set to `0` or `false` to disable summary generation entirely)
- **Observability**: `OTEL_EXPORTER_OTLP_ENDPOINT`. Langfuse tracing is handled by the LiteLLM proxy — set `LANGFUSE_*` env vars on the LiteLLM container, not the worker

Full schema in `src/config/env.ts`.
