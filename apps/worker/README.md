# Ragen Worker

Temporal worker for the Ragen AI platform. Processes document parsing, text chunking, **document summary generation**, **hybrid embedding generation** (dense + BM25 sparse), thumbnail creation, and website scraping tasks.

Implements two retrieval-quality decisions documented in the repo's ADRs:
- [ADR-14](https://github.com/webamigos/ragenai/blob/main/docs/adrs/14-hybrid-search-dense-sparse.md) — hybrid dense + BM25 sparse vectors with RRF fusion
- [ADR-16](https://github.com/webamigos/ragenai/blob/main/docs/adrs/16-document-summaries-at-ingest.md) — ingest-time document summaries written as synthetic chunks + `UserFile.metadata.summary`

## Quick Start

**Dev mode:**

```bash
npm run dev
```

**Production mode:**

```bash
npm run build
npm run start
```

**Docker:**

```bash
docker build -t ragen-worker .
docker run ragen-worker
```

The project is deployed on [Railway](https://railway.app). Its settings — restart policy, root directory, Dockerfile path — live in the Railway dashboard, not in this repository; see [ADR-47](../../docs/adrs/47-railway-configuration-lives-in-the-dashboard.md). The start command is this image's `CMD`.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start worker in watch mode (tsx) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Build then run compiled worker |
| `npm run test` | Run the Vitest suite |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run lint` | Run ESLint |

Run a single test file: `npx vitest run path/to/test.ts`. The suite moved off
Jest in [ADR-48](../../docs/adrs/48-worker-and-api-tests-run-on-vitest.md).

## Architecture

### Pipelines and the engine that runs them

The worker connects to a Temporal server and listens on the `ragen-tasks` queue.

The work itself lives in `src/handlers/` and knows nothing about Temporal. Each
handler takes a payload and a `JobContext` from `@ragenai/jobs`; `src/workflows/`
holds one three-line wrapper per handler that runs it on this engine. That split
is what lets the same pipelines run on BullMQ later without being rewritten —
change the wrapper, not the pipeline.

There are eight, of which two are the ingest paths:

- **`runFileEmbeddings`** (`src/handlers/parse-and-embed.ts`) - Main pipeline: S3 download → parse → chunk → generate summary → prepend summary chunk → hybrid embed (dense + sparse) → store in Qdrant → merge `UserFile.metadata.summary`
- **`scrapeWebsite`** (`src/handlers/scrape-website.ts`) - Scrape website via FireCrawl → create document → generate embeddings → store in Qdrant

The other six — `generateDocument`, `optimizeDocument`, `scoreDocument`,
`reindexDocumentVersion`, `cleanupDemoThreads`, `pruneAnalyticsRetrievals` —
follow the same shape. The last two are scheduled rather than produced.

**`runFileEmbeddings` flow:**

```mermaid
flowchart LR
    A[S3 download] --> B[parse<br/>loader per type]
    B --> C[splitText<br/>chunk]
    C --> D["generateDocumentSummary<br/>ADR-16 · best-effort"]
    D --> E["prepend chunk_type: summary"]
    E --> F[prepareMetadata]
    F --> G["addDocumentsToVectorStore<br/>hybrid: dense + sparse<br/>ADR-14"]
    G --> H["mergeFileMetadata<br/>jsonb merge"]
```

The summary step is best-effort — feature-flag off, empty input, LLM errors, and Temporal-level failures all degrade to "no summary" without failing the workflow. `mergeFileMetadata` runs outside the embedding try-catch so a DB error cannot falsely mark embedding as FAILED.

**Cancellation is a database fact, not an engine instruction.** Cancelling
writes `CANCELLED` to the file row; the ingest handlers read that row at their
own checkpoints (`ctx.checkCancelled({ fileId, orgId })`) and stop at one. It is
cooperative — a checkpoint sits before each expensive step, never inside one, so
an in-flight parse finishes rather than being torn down. On Temporal the read is
an activity, because a workflow sandbox has no I/O; if it fails twice it answers
"not cancelled" and the next checkpoint asks again, so a database blip cannot
turn a healthy ingest into a failed one.

The `cancelEmbedding` signal and the `embeddingState` query that used to carry
this are gone. A row can be read after the engine has forgotten the run, which a
signal cannot, and it lets the UI change the moment the user clicks rather than
at the next checkpoint.

### Activities (`src/activities/`)

Activities are the executable units within workflows, grouped by domain:

- `ai-usage/` - Embedding usage reporting
- `api-keys/` - API key retrieval and management
- `aws/` - S3 file download/upload
- `db/` - PostgreSQL operations. Includes `mergeFileMetadata` (ADR-16) for JSONB `||` merges that preserve existing metadata keys (e.g. Google Drive import fields)
- `documents/` - Document record creation + `generateDocumentSummary` (ADR-16, best-effort summary via `SUMMARY_MODEL`)
- `embeddings/` - Embedding preparation and metadata
- `files/` - File type detection (binary check, MIME type)
- `loaders/` - Document parsing (PDF, EPUB, DOCX, SRT, text, CSV, XLSX, image, website via FireCrawl)
- `meilisearch/` - Vector storage (Qdrant by default with hybrid dense+sparse per ADR-14, Meilisearch for legacy orgs)
- `notifications/` - Pusher real-time notifications
- `splitters/` - Text chunking with type-specific settings
- `thumbnails/` - Thumbnail generation (PDF, image, text preview) and S3 upload

### Services (`src/services/`)

Core infrastructure layer:

- **`llm/`** - Vercel AI SDK provider setup: `getChatModel()`, `getChatModelForOrg()`, `getEmbeddingModel()` with optional OpenRouter support
- **`chains/`** - LLM chains (e.g., PDF RAG processing)
- **`text-splitters/`** - Custom text splitting (RecursiveCharacterTextSplitter, MarkdownTextSplitter)
- **`db/`** - PostgreSQL queries, on Prisma since [ADR-40](../../docs/adrs/40-worker-uses-prisma-not-knex.md). Includes `isIngestCancelled`, the read behind every cancellation checkpoint
- **`document-loaders/`** - Custom document loader implementations (PDF via Claude native/vision, SRT, CSV, XLSX via SheetJS, image via vision LLM, website via FireCrawl, buffer)
- **`notifications/`** - Pusher notification service
- **`qdrant.ts`** - Qdrant client for vector storage (default). Writes hybrid named vectors per ADR-14: `dense` (Cohere 1024-dim) + `sparse` (BM25 term frequencies with Qdrant's server-side `idf` modifier)
- **`bm25-encoder.ts`** - Pure-TS BM25 sparse vector encoder. The single source of truth now lives in `@ragenai/rag-core` (`packages/rag-core/src/bm25-encoder.ts`), shared with apps/web and apps/api
- **`meilisearch.ts`** - Meilisearch client for vector storage (legacy, dense-only)
- **`redis.ts`** - Redis singleton for caching organization settings
- **`aws.ts`** - S3 client configuration
- **`langfuse-trace.ts`** - Langfuse tracing integration
- **`logger.ts`** - Pino logger with OpenTelemetry bridge
- **`otel-logger.ts`** - OpenTelemetry log emitter

### Observability

- **OpenTelemetry** (`src/instrument.ts`) - Traces, metrics, and logs export via OTLP
- **Langfuse** - LLM call tracing and monitoring
- **Pino** - Structured logging with OTel bridge

## Working with Temporal

### Important Constraints

- **Activities must return plain objects** - methods/functions are lost during serialization
- **Use string names for workflows in production** - passing workflow functions works in dev but breaks in prod due to different build artifacts
- **After renaming an activity**, Temporal Cloud may still reference the old name; create a new workflow name instead
- **Only one worker instance** should run with a given build at a time

### Starting jobs from other services

`apps/web` and `apps/api` do not hold a Temporal client. They go through the
`JobRuntime` seam in `@ragenai/jobs`, which is what makes the engine swappable:

```ts
import { jobs } from '@/libs/jobs';

// Enqueue. The run id is the caller's, because it is written to
// UserFile.workflowId before the job starts and a cancel has to find it again.
await jobs().start('runFileEmbeddings', runId, payload);

// Poll (the document-generation status route). `unknown` is a real state:
// both engines forget completed runs, and that answers 404, not "failed".
const run = await jobs().getRun(runId);

// Stop a job the worker has not picked up yet — and only that. A running job
// is cancelled by writing CANCELLED to its row; see the section above.
await jobs().requestCancel(runId);
```

Inside this app, name workflows with **strings**, never an imported function —
the two builds produce different artifacts, so a function reference works in dev
and breaks in production.

## Running Locally

### Prerequisites

- Node.js >= 24
- Copy `.env.example` for local setup
- Temporal dev server or Temporal Cloud credentials

### Using Temporal Dev Server (recommended)

Install and start the [Temporal CLI dev server](https://learn.temporal.io/getting_started/typescript/dev_environment/#set-up-a-local-temporal-service-for-development-with-temporal-cli):

```bash
temporal server start-dev
```

Then start the worker:

```bash
npm run dev
```

### Using Temporal Cloud

Provide the following env vars:

```
TEMPORAL_SERVER_ADDRESS=
TEMPORAL_NAMESPACE=
TEMPORAL_CERT=
TEMPORAL_KEY=
```

## Docker

The project uses a multi-stage Dockerfile (Node 24-slim) with separate stages for dependencies, build, and runtime. The final image runs as a non-root `worker` user.

```bash
docker build -t ragen-worker .
docker run ragen-worker
```

## Tech Stack

- **Temporal** for workflow orchestration
- **Vercel AI SDK** (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`) for embeddings, LLM calls, and Claude native PDF processing
- **Prisma** + PostgreSQL for persistence, from the monorepo's shared schema ([ADR-40](../../docs/adrs/40-worker-uses-prisma-not-knex.md)); Knex is gone
- **Qdrant** (`@qdrant/js-client-rest`) for vector storage (default)
- **Meilisearch** for vector storage (legacy)
- **Redis** (ioredis) for caching
- **AWS S3** for document storage
- **SheetJS** (`xlsx`) for CSV/Excel file parsing
- **Sharp** + **resvg-js** for image/thumbnail processing
- **Langfuse** for LLM observability, via OTel spans emitted by this app
- **OpenTelemetry** for traces, metrics, and logs
- **Pino** for structured logging
- **Pusher** for real-time notifications
- **Zod** for environment variable validation

## Environment Variables

Key env vars:
- **Infrastructure**: `TEMPORAL_SERVER_ADDRESS`, `DATABASE_URL`, `REDIS_URL`, `QDRANT_URL`, `QDRANT_API_KEY`, `MEILISEARCH_URL` (legacy), `AWS_*` credentials, `PUSHER_*`, `FIRECRAWL_API_KEY`
- **LLM**: the provider credentials for whatever `infra/llm-gateway/routes.yaml` routes to (Azure, Bedrock, Vertex, OpenRouter, or an OpenAI-compatible endpoint), and optionally `LLM_ROUTES_PATH`. The app calls providers itself — there is no proxy and no `LLM_GATEWAY` flag ([ADR-49](../../docs/adrs/49-the-application-calls-model-providers-itself.md)). Check credentials with `npm run gateway:preflight -- --probe` from the repo root.
- **PDF (legacy parser path)**: `PDF_PROCESSOR` (`claude` default or `vision`), `PDF_MODEL` (defaults to `claude-haiku-4-5`)
- **Summaries (ADR-16)**: `SUMMARY_MODEL` (default `gemini-2.5-flash`), `FEATURE_FLAG_DOC_SUMMARIES` (default on — set `0` or `false` to disable summary generation)

Optional: `LANGFUSE_*`, `OTEL_EXPORTER_OTLP_ENDPOINT`. LLM tracing is
app-level now that the proxy is gone — see [ADR-22](../../docs/adrs/22-observability-opentelemetry.md).

Full schema in `src/config/env.ts`.
