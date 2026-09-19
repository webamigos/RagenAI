# Companion services

Split out of `README.md` so the README can introduce the product rather than
document it. Ragen is several services. This is what each one is, what it needs, and how to run the set locally.

This monorepo is part of a multi-service ecosystem. All repos live under the same parent directory.

### Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  apps/web   │────▸│ apps/worker  │────▸│     Qdrant       │
│  (Next.js)  │     │   (BullMQ)   │     │  (vector store)  │
└──────┬──────┘     └──────────────┘     └──────────────────┘
       │
       ├───────────▸┌──────────────────┐
       │            │ ragen-token-vault│
       │            │   (Fastify)      │
       │            └──────────────────┘
       │                    ▲
       └───────────▸┌───────┴──────────┐
                    │    ragen-connectors     │
                    │ (FastMCP + Hono) │
                    └──────────────────┘
```

### apps/worker

The job worker: document parsing, embedding generation, thumbnail creation and website scraping. It consumes BullMQ queues on Redis ([ADR-44](adrs/44-bullmq-is-the-worker-runtime.md)); Temporal is an adapter behind the same seam, selected with `WORKER_RUNTIME=temporal` and no longer part of the compose file. Lives in this monorepo as an npm workspace (ADR-26); it used to be the standalone `ragen-worker` repository, which is now archived.

```bash
npm run worker:dev   # Start worker in watch mode
```

It reads its own `apps/worker/.env.local` — see `apps/worker/.env.example`.

**Requires**: Redis, PostgreSQL and Qdrant (all started via `docker compose up` at the repo root). Storage credentials are only needed with `STORAGE_PROVIDER=s3`; the default local provider needs none.

**Key env vars**: `REDIS_URL`, `DATABASE_URL`, `QDRANT_URL`, `WORKER_CONCURRENCY` (default 20), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`. Under `WORKER_RUNTIME=temporal`, `TEMPORAL_SERVER_ADDRESS` takes `REDIS_URL`'s place as the mandatory one.

**Jobs** (eight in all; these are the two that matter most):

- `runFileEmbeddings` — fetch from storage → parse → chunk → embed → store in Qdrant
- `scrapeWebsite` — Scrape URL via FireCrawl → create document → embed → store

### ragen-token-vault

Centralized token vault — stores OAuth tokens and API keys with AES-256-GCM encryption. All external connector tokens (Google, ClickUp, HubSpot, etc.) are stored here, not in apps/web.

```bash
cd ../ragen-token-vault
npm install
docker compose up -d                  # Start local Postgres for vault
cp .env.example .env.local            # Fill in env vars
npx prisma generate && npx prisma migrate dev
npm run dev                           # Runs on http://localhost:3100
```

**Key env vars**:

- `DATABASE_URL` — PostgreSQL for token storage
- `ENCRYPTION_KEY` — 64-char hex (generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `RAGEN_TOKEN_VAULT_SERVICE_SECRET` — shared HMAC secret (must match apps/web and ragen-connectors)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — for Google OAuth flows

### ragen-connectors

TypeScript monorepo for multi-tenant MCP (Model Context Protocol) servers. Exposes third-party APIs (Google Calendar/Drive/Analytics/Ads, ClickUp, HubSpot) as MCP tools.

```bash
cd ../ragen-connectors
npm install
npm run build
cp services/google/.env.example services/google/.env.local   # Fill in env vars
npm run dev:google               # Google MCP on HTTP :8001, MCP :9001
```

**Services & ports**:

| Service | HTTP Port | MCP Port | Tools                                      |
| ------- | --------- | -------- | ------------------------------------------ |
| Google  | 8001      | 9001     | Calendar, Drive, Analytics, Ads, Gmail     |
| ClickUp | 8002      | 9002     | Tasks, Lists, Folders, Docs, Time tracking |
| HubSpot | 8003      | 9003     | CRM objects, Properties, Owners            |

**Key env vars** (per service): `RAGEN_TOKEN_VAULT_URL`, `RAGEN_TOKEN_VAULT_SERVICE_SECRET`, service-specific OAuth credentials.

### Ragen Admin

Internal admin dashboard for platform management. Lives inside this monorepo as a separate Next.js app at `apps/admin/`.

```bash
cd apps/admin
npm run dev              # http://localhost:3200
```

**Pages**: Organizations, Users, Subscriptions, Invitations, AI Usage, Disk Usage, Activity Log, Models (per-org model allowlists), Limits (default org limits).

**Auth**: Uses the same Better Auth instance as apps/web — only app-level admins (`User.role = 'admin'`) can access.

### Model gateway (in-process)

There is no proxy container. Ragen turns a model id into a provider call itself,
in `packages/llm-gateway` (ADR-49), so chat and embeddings go straight to Azure
OpenAI, AWS Bedrock, Google Vertex, Anthropic, OpenAI or any OpenAI-compatible
endpoint.

**Config**: `infra/llm-gateway/routes.yaml` names the upstream for each model id
the application asks for; `LLM_ROUTES_PATH` points at your own file instead. It
carries no credentials — those come per provider from the environment, and they
have to be present in the web, api and worker processes rather than in one
container.

**Key env vars** (on the app processes, per provider you actually serve):

- `AZURE_API_KEY`, `AZURE_API_BASE`, `AZURE_API_VERSION` — Azure OpenAI
- `AWS_BEDROCK_REGION` plus the AWS default credential chain — AWS Bedrock
- `VERTEX_CREDENTIALS`, `VERTEX_PROJECT`, `VERTEX_LOCATION` — Google Vertex AI
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — those providers directly
- `LLM_<CONNECTION>_BASE_URL` / `_API_KEY` — an OpenAI-compatible upstream
  (Portkey, vLLM, Ollama, or a LiteLLM you run yourself)

Check before deploying, with one real call per configured model:

```bash
npm run gateway:preflight -- --probe
```

Attaching an external gateway: [`attaching-a-gateway.md`](attaching-a-gateway.md).

### Docling (Document Parser)

IBM Docling provides high-quality document parsing with layout understanding, table extraction, and heading hierarchy. It replaces the per-format legacy loaders (Claude native PDF, Mammoth DOCX, SheetJS XLSX) with a single unified pipeline that outputs Markdown.

Docling is started automatically via `npm run ragen:up:full` on port **5001** (not included in `ragen:up:app`).

```bash
# UI for testing document conversion
open http://localhost:5001/ui
```

**Deployment config**: Docling's `Dockerfile`, `entrypoint.sh` and `port-forward.py` live in `infra/docling/` (Docling is strictly a worker dependency). Its Railway settings are in the dashboard — see [ADR-47](adrs/47-railway-configuration-lives-in-the-dashboard.md).

**Supported formats**: PDF, DOCX, PPTX, XLSX, CSV, Images, Markdown, plain text. Formats not supported by Docling (SRT, EPUB) fall back to legacy loaders automatically.

**Worker env vars**:

- `DOCUMENT_PARSER` — `docling` (the default, see `apps/worker/src/consts.ts`) or `legacy` for the per-format loaders
- `DOCLING_URL=http://localhost:5001` — Docling service URL

**CPU-only mode**: The Docker image uses CPU-only inference. Digital PDFs work well; scanned/image-heavy PDFs are slower but functional. OCR is available but slower than GPU.

### Ragen API (`apps/api`)

Public API service built with NestJS. Since [ADR-21](adrs/21-monorepo-and-api-decoupling.md) it lives **in this repo** as the `@ragenai/api` workspace — not in a separate checkout. The standalone `ragen-api` repo is archived as the historical record.

```bash
npm run api:dev      # http://localhost:3001 (watch mode)
npm run api:build
npm run api:test
npm run api:lint
```

**Stack**: NestJS 11 + TypeScript + Prisma (`@prisma/adapter-pg`). Generates its own client from the **same** `prisma/schema.prisma` via a second `generator` block, so one `prisma generate` at the repo root covers both apps.

**Key features**:

- API key validation via ragen-token-vault (timing-safe comparison)
- Owns the ported RAG engine, vector store and connectors; serves `internal/*` routes to apps/web over a session-auth bridge (`SESSION_AUTH_SECRET`)
- `POST /v1/chat` with SSE streaming
- Rate limiting (relaxed automatically when `TARGET_ENV` is `ci` or `test`)
- OpenTelemetry instrumentation

**Requires**: apps/web (port 3000) + ragen-token-vault (port 3100).

**Environment**: reads `apps/api/.env.local` and `.env`, then fills the gaps
from the repository root's `.env.local` and `.env` — the same precedence
`apps/web` and `apps/admin` get from `scripts/load-root-env.mjs`, implemented in
`apps/api/src/config/load-local-env.ts` because it has to run before
`parseApiEnv()` refuses to boot. So the root `.env.local` from AGENTS.md is
enough to start the API against the local Postgres and Qdrant; an
`apps/api/.env` is only needed for values that differ from the root.

> **Gotcha:** `apps/api` keeps its **own copies** of the RAG engine, vector store, connectors and the tenant-scope guard. A fix in `apps/web/src/` usually needs the same edit in `apps/api/src/`, and the root `tsc -p .` does not cover `apps/api` — run `npm run api:build`.

### Ragen MCP Server (`apps/mcp`)

The reverse direction from `ragen-connectors` above: instead of Ragen calling
other services' MCP tools, this exposes Ragen's own chat as an MCP tool
external clients (Claude Desktop, Cursor) can call. See
[ADR-36](adrs/36-mcp-server-exposes-chat-via-apps-api.md) and
[`apps/docs/docs/api-reference/mcp-server.md`](../apps/docs/docs/api-reference/mcp-server.md).

```bash
cd apps/mcp && npm run dev   # MCP (Streamable HTTP) + health, both on :3300
```

**Stack**: `fastmcp`, no database access — a thin adapter with two tools:
`ragen_chat` forwards to `apps/api`'s `POST /v1/chat`, `ragen_list_assistants`
forwards to `GET /v1/assistants` — both using the caller's own Ragen API key.

**Requires**: apps/api (port 3001) running and reachable.

### Compose project names, container names and optional observability

**Container names are Compose's, not ours** — `ragen-app-postgres-1`, not
`ragen-postgres`. Use `docker compose ps` and `docker compose logs <service>`
from the repository root rather than guessing a name.

The Compose project name defaults to the *basename* of the directory the file
sits in, so two checkouts both called `ragen` share the same volumes — one
`docker compose down -v` in the wrong window then wipes the other one's
database. Set `COMPOSE_PROJECT_NAME` in `.env` per checkout.

**Optional local observability**: `docker compose --profile observability up -d`
starts the collector, and the app only exports to it once
`OTEL_EXPORTER_OTLP_ENDPOINT` is set — without that variable `apps/web`'s
instrumentation is a no-op. See
[ADR-22](adrs/22-observability-opentelemetry.md).

### Running Everything Locally

```bash
# 1. Start infrastructure (from the repo root) — pick one:
npm run ragen:up:full            # Full stack: Postgres, Qdrant, Redis, Docling
#                                  (PII masking adds Presidio: --profile pii)
npm run ragen:up:app             # App-only:  Postgres, Qdrant (no document processing)

# 2. Start apps/web
npm run dev                      # http://localhost:3000

# 3. Start worker (separate terminal — only needed with ragen:up:full)
npm run worker:dev

# 4. Start token vault (separate terminal, needed for connectors)
cd ../ragen-token-vault && npm run dev    # http://localhost:3100

# 5. Start MCP servers (separate terminal, needed for connectors)
cd ../ragen-connectors && npm run dev:google     # http://localhost:8001

# 6. Start admin (separate terminal, needed for platform admin)
cd apps/admin && npm run dev              # http://localhost:3200

# 7. Start API (separate terminal, needed for public API)
npm run api:dev                           # http://localhost:3001

# 8. Start the MCP server (separate terminal, needed to expose chat via MCP)
cd apps/mcp && npm run dev                # :3300
```

**Minimum for chat only** (no document ingestion): Steps 1 (`ragen:up:app`) + 2.
**Minimum with document processing**: Steps 1 (`ragen:up:full`) + 2 + 3.
**For public API**: Also need steps 4 (token vault) + 7 (apps/api).
**For the MCP server**: Also need steps 4, 7, and 8 (it calls apps/api, which needs the token vault).

| Service                       | Port      | When needed                                     |
| ----------------------------- | --------- | ----------------------------------------------- |
| apps/web                      | 3000      | Always                                          |
| apps/worker                   | —         | Document processing (requires `ragen:up:full`)  |
| Docling                       | 5001      | Document parsing (`ragen:up:full`, UI at `/ui`) |
| Queue dashboard               | 8090      | Inspecting jobs (the worker serves it, when `WORKER_ADMIN_USER`/`_PASSWORD` are set) |
| ragen-token-vault             | 3100      | External connectors + API key validation        |
| ragen-connectors              | 8001-8003 | External connectors                             |
| Ragen Admin                   | 3200      | Platform administration                         |
| Ragen API                     | 3001      | Public API (chat endpoint, API key auth)        |
| Ragen MCP Server (`apps/mcp`) | 3300      | Exposing chat to external MCP clients           |
| Ragen Docs (`apps/docs`)      | 3400      | The documentation site                          |
| Postgres                      | **55432** | Always (published port; 5432 inside the network) |
| Redis                         | **56379** | Always (published port; 6379 inside the network) |
| Qdrant                        | 6333      | Always                                          |

Every published port is overridable — `POSTGRES_PORT`, `REDIS_PORT` and so on —
and only the *published* mapping moved: inside the Compose network each service
still answers on its standard port. Temporal is not in the Compose file at all
(ADR-44), and the queue dashboard is the worker's own (`WORKER_ADMIN_PORT`,
8090).

App dev ports are web 3000, api 3001, vault 3100, admin 3200, mcp 3300 and docs
3400. Three of those services read a bare `PORT`, so setting one in the root
`.env.local` moves all three at once; use `RAGEN_API_PORT` and `RAGEN_MCP_PORT`
instead.
