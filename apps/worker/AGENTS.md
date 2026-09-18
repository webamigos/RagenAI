# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ragen Worker processes document parsing, embedding, and website scraping tasks for the Ragen AI platform. It consumes jobs from **BullMQ queues on Redis** ([ADR-44](../../docs/adrs/44-bullmq-is-the-worker-runtime.md)) — Temporal is an adapter behind the same seam, selected with `WORKER_RUNTIME=temporal` — orchestrating file downloads from S3, document parsing, text chunking, **document summary generation**, **hybrid embedding generation** (dense + BM25 sparse), thumbnail creation, and vector storage in Qdrant (with Meilisearch as legacy fallback).

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
| `docker compose up redis` (repo root) | The queues live here — the worker will not start without one |

Run a single test file: `npx vitest run path/to/test.ts`

The suite runs on Vitest, not Jest — see [ADR-48](../../docs/adrs/48-worker-and-api-tests-run-on-vitest.md).
It keeps Jest's injected globals (`describe`/`it`/`expect`) via `globals: true`,
so the difference in a test file is `vi.*` instead of `jest.*`. Two things that
Jest allowed and Vitest does not: a `vi.mock` factory cannot close over a
plain `const` (use `vi.hoisted`), and a mocked constructor must be a `function`
or `class`, never an arrow.

The Presidio integration suite has its own config and still needs the
containers: `npm run test:presidio-integration`.

**The job-runtime integration suite** is the other one with its own config, and
it is the gate for the BullMQ port: `npm run test:jobs-integration` (or
`npm run worker:test:jobs` from the root), with a Redis up. It runs the real
handlers against real queues — every job name delivered and completed, the
retry policies the handlers declare, cancellation's two halves, schedules,
stalled-job redelivery, and the assertion that a redelivered ingest does not
duplicate a document's chunks. It uses **database 15** of `REDIS_URL`'s server
and flushes it between tests; point it elsewhere with `JOBS_TEST_REDIS_URL`.

No e2e test can replace it: `e2e.yml` starts no worker and path-ignores
`apps/worker/**`. In CI it is the `Jobs Integration` job, with a Redis service
container.

**The same suite is the Temporal parity run**:
`WORKER_RUNTIME=temporal npm run test:jobs-integration` needs no Redis and no
container — `@temporalio/testing` starts a real Temporal server from a cached
binary (`JOBS_TEST_TEMPORAL_ADDRESS` points it at your own). CI runs it nightly
as `Jobs Parity`, over both runtimes. Where the engines genuinely differ, the
difference is a field on `RuntimeTraits` in `test/jobs-integration/harness.ts` —
read that table before assuming a parity failure is a regression, and add to it
only when you have established that an engine, not the adapter, is what
disagrees. Three tests are BullMQ's alone and skip on the Temporal leg.

Both of those suites live in `test/`, which `tsconfig.json` cannot cover — its
`rootDir` is `src`, because that is what `tsc --build` emits. `tsconfig.test.json`
type-checks them, and `npm run typecheck` runs both configs. Without it a suite
outside `src/` compiles nowhere, which is how the Presidio file had carried two
type errors since it was written.

## Architecture

### Pipelines, and the engine under them

The worker consumes one BullMQ queue per job name, on `REDIS_URL`. Under `WORKER_RUNTIME=temporal` it connects to a Temporal server and listens on `ragen-tasks` instead; nothing in `src/handlers/` can tell.

**The pipelines are in `src/handlers/` and import no engine.** Each takes a
payload and a `JobContext` from `@ragenai/jobs`; `src/bullmq-runtime.ts` registers
each handler with `@ragenai/jobs-bullmq`, where `ctx.steps` runs a step in
process with the retry policy it declares. `src/workflows/` is the Temporal
half — a three-line wrapper per handler plus `temporal-context.ts`, where
`ctx.steps` *is* `proxyActivities`. Put pipeline logic in a handler and engine
concerns in the runtime: anything that reaches for `@temporalio/*` or `bullmq`
from `src/handlers/` has undone the seam both runtimes stand on.

Eight pipelines. The two ingest paths:

- **`runFileEmbeddings`** (`src/handlers/parse-and-embed.ts`) - Main pipeline: download file from S3 → detect type → parse document → split into chunks → generate summary → prepend synthetic summary chunk → hybrid-embed (dense + sparse) → store in Qdrant → merge `UserFile.metadata.summary`
- **`scrapeWebsite`** (`src/handlers/scrape-website.ts`) - Scrape website via FireCrawl → create document → generate embeddings → store in Qdrant

and six more in the same shape: `generateDocument`, `optimizeDocument`,
`scoreDocument`, `reindexDocumentVersion`, and the two scheduled ones,
`cleanupDemoThreads` and `pruneAnalyticsRetrievals`.

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

### Cancellation is a row, not a signal

`cancelEmbedding` and the `embeddingState` query are **gone**. Cancelling writes
`CANCELLED` to the file row, and the handler reads it at each checkpoint via
`ctx.checkCancelled({ fileId, orgId })` — see `src/handlers/ingest-cancellation.ts`.
Four things about it that are load-bearing, and were decided rather than fallen
into:

- **It takes the file, not the run id.** `user_files.workflow_id` has no index
  and a checkpoint runs about five times per ingest; `(id, organization_id)` is
  the unique key. Deriving the file from the run id would be a sequential scan
  per checkpoint — and is what would force the migration this design avoids.
- **Cooperative, never preemptive.** Checkpoints sit *between* steps, so an
  in-flight parse finishes instead of being torn down. A cancellation therefore
  lands at the next checkpoint, not instantly.
- **A failed read answers "not cancelled."** Under BullMQ the read is a plain
  query; on Temporal it is an activity (a workflow sandbox has no I/O) with two
  attempts. Either way a failure warns and continues: throwing would reach the
  parsing catch and record FAILED, so a database blip would destroy a healthy
  ingest. The next checkpoint asks again, and the row does not go away.
- **CANCELLED is sticky, with no exception.** Both status writers carry that
  `where` clause, so no write from a cancelled run gets over it. It briefly had
  an exception for `STARTED`, on the grounds that a new run opens by writing it
  — but a *cancelled* run writes `STARTED` too, at the top of its embedding
  phase, which reopened the window the clause exists to close. Re-indexability
  comes from the producer instead: `resetIngestStatusForNewRun` clears the
  status before a new run starts, which is knowledge only a producer has.

A missing row reads as cancelled: deleting a file mid-ingest is a stronger
statement than cancelling it.

Producers (`apps/web`, `apps/api`) hold no engine client — they go through
`JobRuntime` (`jobs().start/getRun/requestCancel`). `requestCancel` drops a job
the worker has not started yet, and *only* that; a running job stops because of
the row.

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
- **`llm/`** - Vercel AI SDK provider setup (`provider.ts`): `getChatModel()` and `getEmbeddingModel()`, resolving the model through `@ragenai/llm-gateway` and calling Azure, Bedrock, Vertex, OpenRouter or an OpenAI-compatible endpoint directly. `native-models.ts` is the binding. There is no proxy and no `LLM_GATEWAY` flag — B6 removed both ([ADR-49](../../docs/adrs/49-the-application-calls-model-providers-itself.md)); routing decisions live in the route table. One thing to know: **every getter is `async`**, including the two that used not to be.
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
- **`langfuse-trace.ts`** - OTel span wrapper for LLM call grouping. LLM tracing is app-level since the proxy went — see [ADR-22](../../docs/adrs/22-observability-opentelemetry.md)
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

OpenTelemetry instrumentation with OTLP exporters for traces, metrics, and logs. LLM call tracing is emitted by this app. Pino structured logging with OTel bridge.

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

## Runtime Constraints

Both engines serialize what crosses them, so the first rule outlives either:

- **Payloads and step results must be plain objects** — methods and class
  instances are lost, whether the transport is Redis or a Temporal task queue.

### BullMQ (the default)

> **These are the Redis backend's properties.** `BULLMQ_BACKEND=postgres` keeps
> the same queues in PostgreSQL, and at least one of the rules below does not
> hold there: a job whose worker blocks the event loop was **not** redelivered
> in testing, at settings where Redis redelivers it. That inverts the failure
> mode — stuck rather than duplicated — and it has not been characterised. Treat
> the Postgres backend as unproven for any install whose jobs block the loop,
> which is every install that parses a PDF. See
> [the lesson](../../docs/lessons/the-postgres-queue-backend-does-not-redeliver-a-stalled-job.md).

- **Redis must not evict.** Queue state *is* the data: an `allkeys-lru`
  instance deletes jobs at random under memory pressure, which is
  indistinguishable from work nobody submitted. The worker reads
  `maxmemory-policy` at boot and refuses to start against an evicting server;
  compose sets `noeviction` and `appendonly yes`.
- **A blocked event loop is a duplicate run.** A job renews its lock while it
  runs, and `sharp`, `resvg`, `pdfium` and `xlsx` block the loop hard enough to
  miss that — BullMQ then calls the job stalled and runs it **again, in
  parallel with the first**. The lock is five minutes rather than the 30-second
  default for exactly that reason, and `maxStalledCount: 1` allows one
  redelivery, not two. A ten-minute Docling parse is fine: it awaits I/O and
  the timer still fires.
- **Handlers must survive redelivery.** A crashed worker's job comes back;
  ingest survives it because it clears the file's chunks before every write —
  Qdrant point ids are random uuids, so a second write would *add* a copy — and
  the integration suite asserts exactly that.
- **Retries belong to the step, not the job.** `ctx.steps` applies each step's
  declared policy in process. BullMQ's own `attempts` retries the *whole* job,
  which would re-download, re-parse and re-chunk a document to reach the
  embedding that failed.
- **Concurrency is whole jobs** (`WORKER_CONCURRENCY`, default 20) — not
  Temporal's `maxConcurrentActivityTaskExecutions: 50`, which counted
  activities, about twenty per ingest.
- **More than one worker is fine**, and is how you add throughput. The queues
  are the coordination.
- **A finished job is readable for an hour** (failures, a day). The
  document-generation UI polls `getRun`, so shortening that turns a success
  into a 404.

### Temporal (`WORKER_RUNTIME=temporal`, adapter)

- **Use string names for workflows in production** — passing workflow functions works in dev but breaks in prod due to different build artifacts
- **After renaming an activity**, Temporal Cloud may still reference the old name; create a new workflow name instead
- **Only one worker instance** should run with a given build at a time

## Deployment

- **Docker**: Multi-stage Dockerfile using Node 24-slim. Runs as non-root `worker` user.
- **Railway**: configured in the dashboard, not in this repository — see [ADR-47](../../docs/adrs/47-railway-configuration-lives-in-the-dashboard.md). The `railway.toml` that used to sit here was never read, and the "max 3 retries" it claimed was not what production ran. **A start command changes in the Dockerfile `CMD`.**

## Tech Stack

- **BullMQ** on Redis for job orchestration, behind the `@ragenai/jobs` seam — a pipeline never imports it. **Temporal** v1.13.0 is the other implementation of the same seam, selected with `WORKER_RUNTIME=temporal` ([ADR-44](../../docs/adrs/44-bullmq-is-the-worker-runtime.md))
- **Vercel AI SDK** (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`) for LLM chat completions, embeddings, and Claude native PDF processing, routed by `packages/llm-gateway` (shared with apps/web)
- **SheetJS** (`xlsx`) for CSV/Excel file parsing
- **Prisma** + PostgreSQL for persistence, generated from the root
  `prisma/schema.prisma` via its own `workerClient` generator
  ([ADR-40](../../docs/adrs/40-worker-uses-prisma-not-knex.md)). The generated
  client is in `apps/worker/generated/` — outside `src/` deliberately, because
  `tsc --build` copies only what it compiles and the client is `.js`/`.wasm`.
  Knex is gone.
- **Qdrant** (`@qdrant/js-client-rest`) for vector storage (default)
- **Meilisearch** (`meilisearch`) for vector storage (legacy)
- **Redis** (ioredis) for the queues and for caching — the worker refuses to start without it under BullMQ
- **AWS S3** for document storage
- **Sharp** + **@resvg/resvg-js** for image processing and thumbnail generation
- **Langfuse** for LLM observability, fed by this app's own OTel spans now that the proxy is gone
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
- **Infrastructure**: `REDIS_URL`, `DATABASE_URL`, `QDRANT_URL`, `QDRANT_API_KEY`, `MEILISEARCH_URL` (legacy), `PUSHER_*`, `FIRECRAWL_API_KEY`. `WORKER_RUNTIME` picks the engine and decides which of `REDIS_URL` / `TEMPORAL_SERVER_ADDRESS` is mandatory — neither is required in general, each is required by the runtime that reads it. `WORKER_CONCURRENCY` and the `WORKER_ADMIN_*` trio (dashboard) are BullMQ's.
- **LLM**: the provider credentials listed in `infra/llm-gateway/README.md`, and optionally `LLM_ROUTES_PATH`. The app calls providers itself; `npm run gateway:preflight -- --probe` from the repo root makes one real call per configured model.
- **Document parsing**: `DOCUMENT_PARSER` (`docling` default, or `legacy`), `DOCLING_URL`, `DOCLING_STRICT`. Docling parses locally, which is why it is the default — the legacy PDF loader sends the document to an external model. On a Docling failure the workflow falls back to the legacy loaders; `DOCLING_STRICT=1` makes it fail the ingest instead, which is what a confidential deployment wants, because the fallback would otherwise ship the document off-site exactly when local parsing is unavailable. SRT and EPUB always use their legacy loader; PPTX only works via Docling.
- **PDF processing (legacy path only)**: `PDF_PROCESSOR` (`claude` default or `vision`), `PDF_MODEL` (defaults to `claude-haiku-4-5`). The model resolves through `infra/llm-gateway/routes.yaml` like every other one — the Anthropic pass-through this used to rely on was LiteLLM's, and B6 removed it with the proxy (ADR-49). Usage is recorded by the application.

  > These three models — `claude-haiku-4-5` here, and `availableModels.mini`
  > / `.nano` (`gpt-5.4-mini`, `gpt-5.4-nano`) in
  > `services/chains/pdf-process-rag/config.ts`, used by `load-image.ts` — were
  > served by no route for a while, and the path failed whenever Docling was
  > unavailable. **#1204 added all three to `infra/llm-gateway/routes.yaml`.**
  > Verify with `npm run gateway:preflight -- --probe` before assuming a model
  > name here resolves; the route table is the authority, not this list.

- **Embeddings**: `EMBEDDINGS_MODEL` (default `bge-multilingual-gemma2`, 3584-dim) — must match apps/web's value and `VECTOR_SIZE`
- **Summaries (ADR-16)**: `SUMMARY_MODEL` (default `gemini-2.5-flash` — faster than gpt-5.4-nano for the short-output summary task in practice, and strong Polish support; **do not upgrade to a larger model without explicit approval**, summaries run per-document and cost matters). `FEATURE_FLAG_DOC_SUMMARIES` (default on; set to `0` or `false` to disable summary generation entirely)
- **Observability**: `OTEL_EXPORTER_OTLP_ENDPOINT`, and `LANGFUSE_*` on the worker itself — there is no proxy container to set them on any more

Full schema in `src/config/env.ts`.
