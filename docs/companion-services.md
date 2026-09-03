# Companion services

Split out of `README.md` so the README can introduce the product rather than
document it. Ragen is several services. This is what each one is, what it needs, and how to run the set locally.

This monorepo is part of a multi-service ecosystem. All repos live under the same parent directory.

### Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  apps/web   │────▸│ apps/worker  │────▸│     Qdrant       │
│  (Next.js)  │     │  (Temporal)  │     │  (vector store)  │
└──────┬──────┘     └──────────────┘     └──────────────────┘
       │
       ├───────────▸┌──────────────────┐
       │            │ ragen-token-vault│
       │            │   (Fastify)      │
       │            └──────────────────┘
       │                    ▲
       └───────────▸┌───────┴──────────┐
                    │    ragen-mcp     │
                    │ (FastMCP + Hono) │
                    └──────────────────┘
```

### apps/worker

Temporal worker that processes document parsing, embedding generation, thumbnail creation, and website scraping. Lives in this monorepo as an npm workspace (ADR-26); it used to be the standalone `ragen-worker` repository, which is now archived.

```bash
npm run worker:dev   # Start worker in watch mode
```

It reads its own `apps/worker/.env.local` — see `apps/worker/.env.example`.

**Requires**: Temporal server (started via `docker compose up` at the repo root), PostgreSQL and Qdrant. Storage credentials are only needed with `STORAGE_PROVIDER=s3`; the default local provider needs none.

**Key env vars**: `TEMPORAL_SERVER_ADDRESS` (default `localhost:7233`), `DATABASE_URL`, `QDRANT_URL`, `LITELLM_PROXY_URL`, `LITELLM_MASTER_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME`.

**Workflows**:
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
- `RAGEN_TOKEN_VAULT_SERVICE_SECRET` — shared HMAC secret (must match apps/web and ragen-mcp)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — for Google OAuth flows

### ragen-mcp

TypeScript monorepo for multi-tenant MCP (Model Context Protocol) servers. Exposes third-party APIs (Google Calendar/Drive/Analytics/Ads, ClickUp, HubSpot) as MCP tools.

```bash
cd ../ragen-mcp
npm install
npm run build
cp services/google/.env.example services/google/.env.local   # Fill in env vars
npm run dev:google               # Google MCP on HTTP :8001, MCP :9001
```

**Services & ports**:

| Service | HTTP Port | MCP Port | Tools |
|---------|-----------|----------|-------|
| Google | 8001 | 9001 | Calendar, Drive, Analytics, Ads, Gmail |
| ClickUp | 8002 | 9002 | Tasks, Lists, Folders, Docs, Time tracking |
| HubSpot | 8003 | 9003 | CRM objects, Properties, Owners |

**Key env vars** (per service): `RAGEN_TOKEN_VAULT_URL`, `RAGEN_TOKEN_VAULT_SERVICE_SECRET`, service-specific OAuth credentials.

### Ragen Admin

Internal admin dashboard for platform management. Lives inside this monorepo as a separate Next.js app at `apps/admin/`.

```bash
cd apps/admin
npm run dev              # http://localhost:3200
```

**Pages**: Organizations, Users, Subscriptions, Invitations, AI Usage, Disk Usage, Activity Log, Models (per-org model allowlists), Limits (default org limits).

**Auth**: Uses the same Better Auth instance as apps/web — only app-level admins (`User.role = 'admin'`) can access.

### LiteLLM (Unified LLM Gateway)

All LLM calls (chat completions + embeddings) are routed through a LiteLLM proxy that provides a single OpenAI-compatible API across providers (Azure OpenAI, AWS Bedrock, Google Vertex AI).

LiteLLM is started automatically via `docker compose up` on port **4000**.

```bash
# UI for model management
open http://localhost:4000/ui    # Login: admin / sk-litellm-dev-key
```

**Config**: `infra/litellm/config.yaml` — defines model names, provider routing, and Langfuse callbacks. Baked into Docker image for Railway deployment.

**Key env vars** (set on the LiteLLM container, not apps/web):
- `AZURE_API_KEY`, `AZURE_API_BASE`, `AZURE_API_VERSION` — Azure OpenAI
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION_NAME` — AWS Bedrock
- `VERTEX_CREDENTIALS`, `VERTEX_PROJECT`, `VERTEX_LOCATION` — Google Vertex AI
- `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` — LLM tracing

**apps/web env vars**: `LITELLM_PROXY_URL=http://localhost:4000`, `LITELLM_MASTER_KEY=sk-litellm-dev-key`, `DEFAULT_MODEL_PROVIDER=litellm`, `DEFAULT_MODEL=gemini-3-flash-preview` (matches `.env.example`). Always verify model names against `infra/litellm/config.yaml` — that file is the source of truth and model lineups rotate.

### Docling (Document Parser)

IBM Docling provides high-quality document parsing with layout understanding, table extraction, and heading hierarchy. It replaces the per-format legacy loaders (Claude native PDF, Mammoth DOCX, SheetJS XLSX) with a single unified pipeline that outputs Markdown.

Docling is started automatically via `npm run ragen:up:full` on port **5001** (not included in `ragen:up:app`).

```bash
# UI for testing document conversion
open http://localhost:5001/ui
```

**Deployment config**: Docling's `Dockerfile`, `entrypoint.sh`, `port-forward.py`, and `railway.toml` live in `infra/docling/` (Docling is strictly a worker dependency).

**Supported formats**: PDF, DOCX, PPTX, XLSX, CSV, Images, Markdown, plain text. Formats not supported by Docling (SRT, EPUB) fall back to legacy loaders automatically.

**Worker env vars**:
- `DOCUMENT_PARSER=docling` — enable Docling (default: `legacy`, uses existing per-format loaders)
- `DOCLING_URL=http://localhost:5001` — Docling service URL

**CPU-only mode**: The Docker image uses CPU-only inference. Digital PDFs work well; scanned/image-heavy PDFs are slower but functional. OCR is available but slower than GPU.

### Ragen API (`apps/api`)

Public API service built with NestJS. Since [ADR-21](adrs/21-monorepo-and-api-decoupling.md) it lives **in this repo** as the `@webamigos/ragen-api` workspace — not in a separate checkout. The standalone `ragen-api` repo is archived as the historical record.

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

> **Gotcha:** `apps/api` keeps its **own copies** of the RAG engine, vector store, connectors and the tenant-scope guard. A fix in `apps/web/src/` usually needs the same edit in `apps/api/src/`, and the root `tsc -p .` does not cover `apps/api` — run `npm run api:build`.

### Running Everything Locally

```bash
# 1. Start infrastructure (from the repo root) — pick one:
npm run ragen:up:full            # Full stack: Postgres, Qdrant, Temporal, LiteLLM, Docling, Redis
npm run ragen:up:app             # App-only:  Postgres, Qdrant, LiteLLM (no document processing)

# 2. Start apps/web
npm run dev                      # http://localhost:3000

# 3. Start worker (separate terminal — only needed with ragen:up:full)
npm run worker:dev

# 4. Start token vault (separate terminal, needed for connectors)
cd ../ragen-token-vault && npm run dev    # http://localhost:3100

# 5. Start MCP servers (separate terminal, needed for connectors)
cd ../ragen-mcp && npm run dev:google     # http://localhost:8001

# 6. Start admin (separate terminal, needed for platform admin)
cd apps/admin && npm run dev              # http://localhost:3200

# 7. Start API (separate terminal, needed for public API)
npm run api:dev                           # http://localhost:3001
```

**Minimum for chat only** (no document ingestion): Steps 1 (`ragen:up:app`) + 2.
**Minimum with document processing**: Steps 1 (`ragen:up:full`) + 2 + 3.
**For public API**: Also need steps 4 (token vault) + 7 (apps/api).

| Service | Port | When needed |
|---------|------|-------------|
| apps/web | 3000 | Always |
| apps/worker | — | Document processing (requires `ragen:up:full`) |
| LiteLLM | 4000 | Always (auto-started via docker compose) |
| Docling | 5001 | Document parsing (`ragen:up:full`, UI at `/ui`) |
| Temporal UI | 8080 | Debugging workflows (`ragen:up:full`) |
| ragen-token-vault | 3100 | External connectors + API key validation |
| ragen-mcp | 8001-8003 | External connectors |
| Ragen Admin | 3200 | Platform administration |
| Ragen API | 3001 | Public API (chat endpoint, API key auth) |
