# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ragen Worker is a **Temporal worker** that processes document parsing, embedding, and website scraping tasks for the Ragen AI platform. It consumes jobs from a Temporal task queue, orchestrating file downloads from S3, document parsing, text chunking, **document summary generation**, **hybrid embedding generation** (dense + BM25 sparse), thumbnail creation, and vector storage in Qdrant (with Meilisearch as legacy fallback).

See ragen-app's ADRs for the retrieval-quality decisions this worker implements:
- [ADR-14](../../docs/adrs/14-hybrid-search-dense-sparse.md) — hybrid dense + BM25 sparse vectors with RRF fusion
- [ADR-16](../../docs/adrs/16-document-summaries-at-ingest.md) — ingest-time document summaries as synthetic chunks + `UserFile.metadata.summary`

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start worker in watch mode (tsx) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Build then run compiled worker |
| `npm run test` | Run Jest test suite |
| `npm run test:watch` | Run Jest in watch mode |
| `npm run lint` | Run ESLint |
| `temporal server start-dev` | Start local Temporal dev server |

Run a single test file: `npx jest --config ./jest.config.ts path/to/test.ts`

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
- **`llm/`** - Vercel AI SDK provider setup (`provider.ts`): `getChatModel()` and `getEmbeddingModel()` — all LLM calls routed through LiteLLM proxy (OpenAI-compatible API) which handles provider routing to Azure OpenAI, AWS Bedrock, and Google Vertex AI
- **`chains/`** - LLM chains for document processing (e.g., `pdf-process-rag/` for PDF RAG pipeline, image description via vision LLM)
- **`text-splitters/`** - Custom text splitting (RecursiveCharacterTextSplitter, MarkdownTextSplitter)
- **`db/`** - Knex-based PostgreSQL queries
- **`document-loaders/`** - Custom document loader implementations (PDF via Claude native/vision, SRT, DOCX via mammoth, CSV, XLSX via SheetJS, image via vision LLM, website via FireCrawl, buffer)
- **`notifications/`** - Pusher notification service configuration
- **`qdrant.ts`** - Qdrant client for vector storage (default). Writes **hybrid named vectors** per ADR-14: each point has a `dense` vector (Cohere 1024-dim) and a `sparse` vector (BM25 term frequencies). Collections are created with `sparse_vectors: { sparse: { modifier: 'idf' } }` so Qdrant applies IDF weighting server-side at query time. Chunks with no tokenizable content (pure numbers/punctuation) store only the dense vector — Qdrant accepts partial named vectors.
- **`bm25-encoder.ts`** - Pure-TS BM25 encoder: unicode-aware tokenizer (works for mixed Polish/English), NFKC + lowercase normalization, FNV-1a 32-bit stable hashing, raw term frequencies. Currently mirrored from `../../src/libs/vector-store/bm25-encoder.ts`; [ADR-26](../../docs/adrs/26-absorb-ragen-worker-into-monorepo.md) replaces this mirror with a shared `packages/rag-core`.
- **`meilisearch.ts`** - Meilisearch client for vector storage (legacy fallback, dense-only)
- **`redis.ts`** - Redis singleton for caching organization settings (uses hashed keys)
- **`aws.ts`** - S3 client configuration
- **`langfuse-trace.ts`** - OTel span wrapper for LLM call grouping (Langfuse tracing itself is handled by LiteLLM proxy)
- **`logger.ts`** - Pino logger with OpenTelemetry bridge
- **`otel-logger.ts`** - OpenTelemetry log emitter

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

- **Docker**: Multi-stage Dockerfile using Node 22-slim. Runs as non-root `worker` user.
- **Railway**: Configured via `railway.toml` with `ON_FAILURE` restart policy (max 3 retries).

## Tech Stack

- **Temporal** v1.13.0 for workflow orchestration
- **Vercel AI SDK** (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`) for LLM chat completions, embeddings, and Claude native PDF processing, all routed through **LiteLLM proxy** (shared with ragen-app)
- **SheetJS** (`xlsx`) for CSV/Excel file parsing
- **Knex** + PostgreSQL for persistence
- **Qdrant** (`@qdrant/js-client-rest`) for vector storage (default)
- **Meilisearch** (`meilisearch`) for vector storage (legacy)
- **Redis** (ioredis) for caching
- **AWS S3** for document storage
- **Sharp** + **@resvg/resvg-js** for image processing and thumbnail generation
- **Langfuse** for LLM observability (tracing handled by LiteLLM proxy, worker uses OTel spans for grouping)
- **Zod** for environment variable validation (`src/validateEnvVars.ts`)
- **Pino** + **OpenTelemetry** for logging and observability
- **Pusher** for real-time notifications

## Code Style

- ESLint flat config with TypeScript; `no-console` rule enforced in `src/`
- Prettier with single quotes
- Conventional commits enforced via commitlint + husky
- Pre-commit hooks run eslint and prettier on staged files via lint-staged
- Semantic release for automated versioning on `main`

## Environment

Requires Node >= 20. Copy `.env.example` for local setup. Key env vars:
- **Infrastructure**: `TEMPORAL_SERVER_ADDRESS`, `DATABASE_URL`, `REDIS_URL`, `QDRANT_URL`, `QDRANT_API_KEY`, `MEILISEARCH_URL` (legacy), `PUSHER_*`, `FIRECRAWL_API_KEY`
- **LLM**: `LITELLM_PROXY_URL`, `LITELLM_MASTER_KEY` — all chat + embeddings go through the LiteLLM proxy (shared with ragen-app, default `http://localhost:4000`)
- **Document parsing**: `DOCUMENT_PARSER` (`docling` default, or `legacy`), `DOCLING_URL`, `DOCLING_STRICT`. Docling parses locally, which is why it is the default — the legacy PDF loader sends the document to an external model. On a Docling failure the workflow falls back to the legacy loaders; `DOCLING_STRICT=1` makes it fail the ingest instead, which is what a confidential deployment wants, because the fallback would otherwise ship the document off-site exactly when local parsing is unavailable. SRT and EPUB always use their legacy loader; PPTX only works via Docling.
- **PDF processing (legacy path only)**: `PDF_PROCESSOR` (`claude` default or `vision`), `PDF_MODEL` (defaults to `claude-haiku-4-5`) — uses LiteLLM Anthropic pass-through for usage tracking
- **Embeddings**: `EMBEDDINGS_MODEL` (default `cohere-embed-multilingual-v3`)
- **Summaries (ADR-16)**: `SUMMARY_MODEL` (default `gemini-2.5-flash` — faster than gpt-5.4-nano for the short-output summary task in practice, and strong Polish support; **do not upgrade to a larger model without explicit approval**, summaries run per-document and cost matters). `FEATURE_FLAG_DOC_SUMMARIES` (default on; set to `0` or `false` to disable summary generation entirely)
- **Observability**: `OTEL_EXPORTER_OTLP_ENDPOINT`. Langfuse tracing is handled by the LiteLLM proxy — set `LANGFUSE_*` env vars on the LiteLLM container, not the worker

Full schema in `src/validateEnvVars.ts`.
