# Ragen AI

RAG (Retrieval Augmented Generation) AI chat application with multi-provider LLM support, document knowledge bases, and a public API.

Ragen is built and maintained by **[Web Amigos](https://webamigos.pl)**, the IT
company behind the product.

## Tech Stack

- **Runtime**: Node.js 24 (Active LTS)
- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript ~5.7
- **Styling**: Tailwind CSS 4
- **Database**: PostgreSQL (Prisma 7) + Redis (optional, rate limiting only)
- **Vector Search**: Qdrant with **hybrid dense + BM25 sparse** search ([ADR-14](docs/adrs/14-hybrid-search-dense-sparse.md)), **multi-query expansion** ([ADR-15](docs/adrs/15-multi-query-expansion.md)), **ingest-time document summaries** ([ADR-16](docs/adrs/16-document-summaries-at-ingest.md)), and post-retrieval **reranking** ([ADR-12](docs/adrs/12-cohere-rerank-post-retrieval.md))
- **LLM Gateway**: LiteLLM proxy (single OpenAI-compatible API over Scaleway, OVH, Azure OpenAI, AWS Bedrock, Google Vertex AI)
- **Integrations**: MCP-ready — connects to any Model Context Protocol server, and ships its own
- **Auth**: Better Auth with Prisma adapter
- **Async Jobs**: Temporal.io worker in [`apps/worker`](apps/worker) (see [ADR-26](docs/adrs/26-absorb-ragen-worker-into-monorepo.md))
- **Payments**: Stripe
- **Observability**: OpenTelemetry + Pino logging
- **i18n**: English & Polish via next-intl

## Run the whole thing in Docker

```bash
npm run ragen:up:everything
```

Builds and starts every Ragen application — web, API, ingest worker, admin —
alongside Postgres, Qdrant, Temporal, LiteLLM, Docling and Redis. No Node
toolchain required on the host, which makes it the fastest way to evaluate a
self-hosted install. Supporting-service configuration lives in
[`infra/`](infra/README.md).

Use `npm run ragen:up:full` instead when developing: it runs the dependencies in
containers and leaves the apps to run from source with hot reload.

## Security and data privacy

Ragen is self-hosted: everything Ragen stores — documents, database, index and
encryption keys — stays on infrastructure you control, and nothing reports back
to the vendor. Whether document *content* is transmitted during processing
depends on how you configure the model backend, which the document below covers
in detail.

**[docs/security-and-privacy.md](docs/security-and-privacy.md)** answers the
questions that come up in a security review — where data lives, what leaves your
network, encryption, access control, audit logging, and whether documents are
used for training. Every claim there points at the code or the ADR behind it,
and says plainly where something is configuration-dependent or not yet built.

Two things worth knowing up front:

- **Parsing is local by default, but it falls back.** `DOCUMENT_PARSER=docling`
  parses on your own hardware; if Docling fails the worker falls back to loaders
  that send PDFs to an external model. Set `DOCLING_STRICT=1` to fail instead.
- **Encryption at rest is opt-in.** With no key provider configured Ragen starts
  normally and stores message content unencrypted — convenient locally, wrong in
  production.

## Local Development

**Prerequisites**: Node.js 24.x (Active LTS), Docker

```bash
# Full stack (includes document processing pipeline)
npm run ragen:up:full      # Postgres, Qdrant, Temporal, LiteLLM, Docling, Redis

# App-only (no document ingestion — can still query existing knowledge bases)
npm run ragen:up:app       # Postgres, Qdrant, LiteLLM

npm install                # Install dependencies
npm run generate:types     # Generate Prisma client
npm run web:dev            # Start Next.js dev server (Turbopack)
```

Set `.env.local` with at minimum:

```bash
DATABASE_URL="postgresql://postgres:pass123@localhost:5432/ragen"
```

`DATABASE_DIRECT_URL` is optional. The Prisma schema does not declare a
`directUrl`, and the few maintenance scripts that read it fall back to
`DATABASE_URL`. Set it only when pooled and direct connections genuinely differ,
as with a connection pooler in front of Postgres.

## Commands

```bash
npm run web:dev          # Start dev server
npm run web:build        # Production build
npm run web:lint         # ESLint
npm run web:test         # Vitest (single run)
npm run packages:test    # Workspace package tests
npm run web:e2e          # Playwright E2E tests
npm run test:e2e:ui --workspace=@webamigos/ragen-web   # Playwright in UI mode
npm run generate:types   # Regenerate Prisma client types
npm run db:seed          # Seed database
npm run ragen:up:full        # Docker: backing services (Postgres, Qdrant, Temporal, LiteLLM, Docling, Redis)
npm run ragen:up:app         # Docker: minimal backing services (no document processing)
npm run ragen:up:everything  # Docker: the whole platform, apps included
npm run ragen:down           # Stop everything
```

## Project Structure

This is an npm-workspaces monorepo (`apps/*` + `packages/*`):

```
.
├── apps/
│   ├── web/                      # The Next.js app (ADR-29 moved it off the root)
│   ├── api/                      # NestJS public API
│   ├── admin/                    # Platform admin panel
│   └── worker/                   # Temporal document-ingest worker
├── packages/
│   ├── db/                       # Prisma client singleton
│   ├── rag-core/                 # Vector contract shared by app, api & worker:
│   │                             #   BM25 encoder, VECTOR_SIZE, vector names,
│   │                             #   default embedding model (ADR-26)
│   ├── storage/                  # File storage: local filesystem by default,
│   │                             #   any S3-compatible store opt-in (ADR-27)
│   └── observability/            # OTel logger + span helper (ADR-28)
└── prisma/schema.prisma          # One schema, a generator block per app
```

`packages/rag-core` exists because the worker writes the vectors the app queries.
If the two sides disagree on the tokenizer, the hash, or the dimensionality,
nothing throws — search just gets quietly worse. Keep it as one source of truth
rather than copying it back into an app.

## Integrations: MCP-ready

Ragen speaks the [Model Context Protocol](https://modelcontextprotocol.io), on
both sides of the connection.

**As a client**, it connects to any MCP server and exposes that server's tools to
the assistant during a conversation — the model can then read and act on your
systems mid-chat rather than being limited to what was indexed ahead of time.
Connectors are enabled per organisation under Settings → Connectors, and cover
four auth styles: OAuth with PKCE, plain API keys, bearer tokens, and a custom
header scheme for self-hosted endpoints such as WooCommerce.

**As a server**, Ragen ships `ragen-mcp`, its own MCP server providing the Google
Workspace surface (Calendar, Drive, Analytics, Ads) with per-user OAuth.

Connectors available today cover Google Workspace, Gmail, Slack, HubSpot,
ClickUp, Fireflies and WooCommerce. The client side is generic, so adding another
MCP server means a provider definition and an enum value — not new tool
plumbing.

> OAuth tokens are held in a separate **Ragen Token Vault** service, authenticated
> with HMAC-SHA256 — never in the application database. See
> [`docs/mcp-integrations.md`](docs/mcp-integrations.md) and
> [ADR-05](docs/adrs/05-mcp-integration-strategy.md).

## File storage

Documents are stored on the **local filesystem by default** (`./data/storage`,
overridable with `STORAGE_LOCAL_PATH`), so a fresh clone runs with no cloud
account. Object storage is opt-in:

```bash
STORAGE_PROVIDER=s3
AWS_ENDPOINT_URL=...        # omit for real AWS S3
AWS_S3_BUCKET_NAME=...
AWS_DEFAULT_REGION=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_FORCE_PATH_STYLE=1   # if your provider needs path-style addressing
```

`s3` means any S3-compatible store — AWS S3, Cloudflare R2 (`AWS_DEFAULT_REGION=auto`),
Scaleway Object Storage, MinIO, Ceph, LocalStack.

> **Use `s3` for any deployment with more than one replica.** With `local`, the
> worker writes documents to its own container's disk and the app cannot read
> them, and a restart loses anything not on a mounted volume. Ragen logs a
> warning at startup when `local` is combined with `TARGET_ENV=production` or
> `staging`. Single-node self-hosted installs on a mounted volume are fine.

See [ADR-27](docs/adrs/27-storage-abstraction-local-by-default.md).

Inside `apps/web/src/`:

```
apps/web/src/
├── app/                          # Next.js App Router
│   ├── [locale]/                 # Locale-prefixed routes (en, pl)
│   │   ├── (panel)/              # Authenticated app (threads, settings, documents)
│   │   ├── (auth)/               # Sign-in, sign-up, forgot password
│   │   └── public/               # Public assistant chat widgets
│   ├── api/
│   │   ├── v1/                   # Internal API endpoints (called by apps/api)
│   │   │   └── chat/             # RAG chat endpoint (SSE + JSON)
│   │   ├── threads/              # Internal thread streaming endpoints
│   │   └── ...
│   ├── actions/                  # Server actions
│   └── components/               # UI components organized by feature
│
├── features/                     # Domain feature modules (CQRS pattern)
│   ├── assistants/               # Assistant mode types
│   ├── connectors/               # External connectors (Google Drive, etc.)
│   ├── documents/                # Document & file management
│   ├── messages/                 # Chat messages
│   ├── onboarding/               # User onboarding flow
│   ├── organizations/            # Organizations, settings, API keys
│   ├── projects/                 # Projects & instructions
│   ├── subscriptions/            # Subscription management
│   ├── threads/                  # Chat threads & SSE events
│   └── users/                    # User metadata
│
├── libs/                         # Shared libraries
│   ├── llm/                      # Multi-provider chat completion & embeddings
│   ├── chains/                   # RAG chains (basic-rag, conversation, PDF processing)
│   ├── vector-store/             # Qdrant, Meilisearch & Supabase vector store clients
│   ├── reranker/                 # Scaleway rerank (default) or Bedrock Cohere (post-retrieval)
│   ├── document-loaders/         # PDF, EPUB, DOCX, Markdown, SRT, CSV, XLSX, Image, URL parsing
│   ├── db/                       # Prisma client singleton (@ragenai/prisma-client)
│   ├── temporal/                 # Temporal.io client
│   ├── payments/                 # Stripe integration
│   ├── mcp/                      # MCP client for external tool servers
│   ├── ragen-vault/              # HTTP client for Ragen Token Vault
│   ├── sse/                      # Server-Sent Events for streaming
│   ├── tui/                      # Tailwind UI component library (@ragenai/tui)
│   └── common-ui/                # Shared UI utilities (@ragenai/common-ui)
│
├── store/                        # Redux Toolkit (client UI state)
├── generated/prisma/             # Generated Prisma client (gitignored)
└── i18n/                         # Internationalization config
```

### Feature Modules

Each feature module in `src/features/` follows a CQRS (Command Query Responsibility Segregation) pattern:

```
features/{feature}/
├── contracts/          # Types, DTOs, schemas
├── constants/          # Feature-specific constants
├── services/
│   ├── queries/        # Read operations (get*Query)
│   └── commands/       # Write operations (*Command)
└── utils/              # Feature-specific utilities
```

- **Queries** return data directly
- **Commands** perform mutations and return results or `OperationResult<T>`
- All server-side functions use `'use server'` directive where needed

## Architecture

### Routing

Routes are locale-prefixed (`/en/...`, `/pl/...`) via `next-intl`. Middleware handles i18n routing and session cookie checks. Auth verification happens in server components/layouts.

### API

The public API is served by **`apps/api`** (NestJS, port 3001) — a workspace in this monorepo since [ADR-21](docs/adrs/21-monorepo-and-api-decoupling.md); the standalone `ragen-api` repo is archived. It owns the notifications, messages, projects, connectors, documents and threads domains directly, and ragen-app's Server Actions call its session-authenticated `internal/*` routes. ragen-app still exposes internal endpoints at `/api/v1/` protected by a shared secret (`INTERNAL_API_SECRET`) and context headers (`x-org-id`, `x-user-id`, `x-project-id`).

API keys use an opaque format (`sk-<keyId>.<secret>`) with no embedded context (see [ADR-13](docs/adrs/13-opaque-api-keys.md)). Keys are stored in ragen-token-vault; the database only holds `maskedValue`, `isActive`, and `lastUsedAt`.

### Auth

Better Auth with Prisma adapter + `admin` and `organization` plugins (with `createAccessControl`). On user creation, a hook auto-creates an organization, internal organization, and default project. Dual org system: Better Auth `Organization` for membership + Ragen `InternalOrganization` for app data (projects, API keys, subscriptions).

Two role hierarchies:
- **App-level** (`User.role`): `'admin'` (superadmin) vs `'user'` — platform-wide access
- **Org-level** (`Member.role`): `'owner'`, `'admin'`, `'member'` — per-organization permissions

Centralized in `src/lib/auth-access-control.ts` (client-safe checks) and `src/lib/auth-guards.ts` (server-side guards).

### Settings & Admin Navigation

The app has two distinct admin surfaces, intentionally split across separate routes and navigation trees.

**`/settings/*` — user-level preferences.** Three pages today: General, Account, Connectors. All authenticated users see them. The left-side nav is driven by a declarative registry at `src/features/settings/registry.ts`. Each entry describes one page (`id`, `path`, `labelKey`, `icon` id, `order`, `visibility` rules). The layout resolves the caller's roles on the server side, filters the registry via the pure `filterSettingsPages()` helper in `src/features/settings/filter.ts`, and passes only the visible pages to the client-side `SettingsNav` component.

**`/organization/*` — org-admin and app-admin tools.** The org layout gates the whole subtree to org admins (and app admins) and renders `OrganizationNav`. Pages include Organization (members), Assistant settings, RAG settings, Subscription, Teams, API Keys, Security, AI Usage, Disk Usage, Audit Logs, Chatbots. These pages are **not** part of `settingsRegistry` — they belong to a different navigation tree with different access rules and layout.

The sidebar user-menu dropdown exposes three shortcuts into the admin tools (AI Usage, Disk Usage, Audit Logs) so org admins don't have to open the Organization section to reach them.

**Adding a user-level settings page:** create the page under `src/app/[locale]/(panel)/settings/<id>/page.tsx`, add the translation key under `settings-page.nav` in `src/app/messages/{en,pl}.json`, then append one entry to `settingsRegistry`. The registry handles role gating, sort order, and active-link highlighting automatically.

**Adding an org-admin page:** create it under `src/app/[locale]/(panel)/organization/<id>/page.tsx` and add a corresponding entry to the `navItems` array in `OrganizationNav`. The `/organization` layout handles access control for you.

Icons in `settingsRegistry` are identified by a stable string (`'cog' | 'user' | 'puzzle'`) and resolved to heroicon components inside `SettingsNav`. Component references can't be serialized across the RSC boundary, so passing them from the server layout would crash at render — add new icon ids to the client-side `ICONS` map when extending the registry.

Theme switching (Light/Dark/System) is available in Settings > General via `next-themes`.

### Knowledge Base

The Knowledge Base supports nested folders, per-user file ownership, and sharing with users/teams.

- **Nested folders**: `DocumentFolder` model with self-referential tree (materialized path pattern)
- **File ownership**: `UserFile.ownerId` — legacy files (null owner) are visible to all org members
- **Sharing**: `DocumentPermission` model grants file/folder access to specific users or teams (`view`/`full` levels)
- **Three views**: "All Files" (org-wide), "My Files" (personal), "Shared with me" (explicitly shared)
- **RAG access control**: Vector store documents have `metadata.accessible_by` array for query-time filtering
- **Inline upload**: Documents-list page supports drag & drop + upload button with folder context

### Document Processing

Upload → storage (local filesystem by default, S3 when `STORAGE_PROVIDER=s3`) → Temporal worker → Parse → Summarize → Chunk → Embed (hybrid dense+sparse) → Store in Qdrant. Each organization gets its own Qdrant collection. Dense embeddings use `bge-multilingual-gemma2` via LiteLLM/Scaleway (3584 dimensions — `VECTOR_SIZE` must match the embedding model or Qdrant rejects every upsert); sparse vectors are BM25 term frequencies with Qdrant's server-side `idf` modifier handling BM25 scoring at query time. Post-retrieval reranking sharpens the top-k — Scaleway `qwen3-embedding-8b` by default, or Bedrock Cohere Rerank v3.5 via `RERANK_PROVIDER=cohere`.

**Two parsing engines** (controlled by `DOCUMENT_PARSER` env var on the worker):
- `docling` (default): IBM Docling via REST API — unified parser producing high-quality Markdown for all supported formats (PDF, DOCX, PPTX, XLSX, CSV, Images), running on your own infrastructure. Falls back to legacy loaders for unsupported formats (SRT, EPUB) or on Docling failure, unless `DOCLING_STRICT=1`. PPTX is only supported via Docling.
- `legacy`: per-format loaders — Claude native PDF, Mammoth DOCX, SheetJS XLSX, etc. Note the PDF path sends the document to an external model.

**Google Drive folder import**: Users can import entire Drive folders into project knowledge bases. Files are fetched via the ragen-mcp Google service, written to the configured storage provider, and processed through the same embedding pipeline. Sync tracking (`GoogleDriveSync` model) records which folders have been imported.

### RAG Pipeline

Retrieval quality is the result of four composed improvements. **Multi-query expansion** ([ADR-15](docs/adrs/15-multi-query-expansion.md)) and **document summaries** ([ADR-16](docs/adrs/16-document-summaries-at-ingest.md)) are behind env flags that default to on (see flag list below) and can be disabled at runtime. **Hybrid dense+sparse retrieval** ([ADR-14](docs/adrs/14-hybrid-search-dense-sparse.md)) has no flag — it's the Qdrant schema new collections are created with, so disabling it means a code rollback, not a config change. **Reranking** ([ADR-12](docs/adrs/12-cohere-rerank-post-retrieval.md)) defaults to Scaleway `qwen3-embedding-8b`; `RERANK_PROVIDER=cohere` switches to Bedrock Cohere Rerank v3.5, which is gated on AWS credentials. Either way a provider error falls back to the raw vector order rather than failing the answer. See ADRs 11, 12, 14, 15, 16 for the full decision history.

**Ingest** (happens in `apps/worker`):

```mermaid
flowchart LR
    A[File upload] --> B[Parse<br/>PDF/DOCX/EPUB/…]
    B --> C[Chunk<br/>type-specific splitter]
    C --> D["Generate summary<br/>ADR-16 · SUMMARY_MODEL"]
    D --> E["Prepend summary as chunk<br/>chunk_type: summary"]
    E --> F["Hybrid embed<br/>dense (bge-multilingual-gemma2) + sparse (BM25)<br/>ADR-14"]
    F --> G["Upsert to Qdrant<br/>named vectors"]
    F --> H["Merge UserFile.metadata.summary<br/>jsonb merge, best-effort"]
```

**Retrieval** (ragen-app `src/libs/chains/basic-rag/`):

```mermaid
flowchart TD
    Q[User question] --> R[Rephrase → standalone question]
    R --> X["expandQueries<br/>ADR-15 · +2 alternative phrasings"]
    X --> P["[standalone, variant1, variant2]"]
    P --> S1[Hybrid search · q1]
    P --> S2[Hybrid search · q2]
    P --> S3[Hybrid search · q3]
    S1 --> D1["Qdrant RRF fusion<br/>dense + sparse per query<br/>ADR-14"]
    S2 --> D1
    S3 --> D1
    D1 --> U[Dedupe by content]
    U --> RR["Rerank (qwen3-embedding-8b)<br/>ADR-12"]
    RR --> G["Answer generation<br/>with citation prompting<br/>ADR-16"]
```

**How they compose**:

| ADR | Stage | Problem solved |
|-----|-------|----------------|
| [ADR-14](docs/adrs/14-hybrid-search-dense-sparse.md) Hybrid search | Retrieval | Exact-term and morphological matches dense alone misses |
| [ADR-15](docs/adrs/15-multi-query-expansion.md) Multi-query | Before retrieval | Vocabulary mismatch between user phrasing and document phrasing |
| [ADR-16](docs/adrs/16-document-summaries-at-ingest.md) Summaries | Ingest | Per-document topic anchors that no flat chunk contains |
| [ADR-12](docs/adrs/12-cohere-rerank-post-retrieval.md) Rerank | After retrieval | Cross-encoder sharpens the final top-k |

ADR-14/15/16 widen the candidate pool at different stages; ADR-12 sharpens what comes out.

**Feature flags** (defaults on):
- `FEATURE_FLAG_MULTI_QUERY` (ragen-app) — disable to fall back to single-query retrieval (ADR-15)
- `FEATURE_FLAG_DOC_SUMMARIES` (worker) — disable to skip summary generation at ingest (ADR-16)
- Hybrid search (ADR-14) and the citation-quality prompt rule have **no runtime flag** — they are the default path and require a code rollback to disable.

### Event Bus

`src/libs/events/` provides a lightweight typed pub/sub for decoupling lifecycle side-effects from core auth/org logic.

**Core** (`bus.ts`): `createEventBus<TEvents>()` returns an async `emit()` + synchronous `on()` with `Unsubscribe`. `emit()` fans out to all registered handlers via `Promise.allSettled` — one subscriber's failure cannot affect siblings or the caller. The failure reporter itself is wrapped in a try/catch as an extra safety net. A process-wide singleton lives in `index.ts`.

**Events** (`types.ts`): `RagenEvents` is the typed event map. Payloads carry identifiers only — subscribers re-fetch heavier data if needed. Current events: `user.emailVerified`.

**Subscribers** (`subscribers/`): one file per side-effect. Each exports a `register*Subscriber()` function that calls `eventBus.on(...)` and returns `Unsubscribe`. Current subscribers:

- `welcome-email.ts` — sends the Resend welcome email.
- `newsletter-signup.ts` — adds the user to a Resend segment (self-disables when `RESEND_DEFAULT_SEGMENT_ID` is not set).

`subscribers/index.ts` aggregates them in `registerAllSubscribers()` (idempotent — a module-level guard prevents double-registration under HMR/test). Registration runs at server startup from `instrumentation.ts register()`, Node-only — Edge bundles never pull in subscriber deps.

**Privacy**: subscriber logs route emails through `maskEmail()` (`mask-email.ts`) so full addresses never hit stdout. `a***@example.com` preserves enough context for debugging.

**Adding a new side-effect on an existing event:** create `subscribers/<name>.ts`, export `registerXSubscriber()`, add the call to `registerAllSubscribers()`. No changes to the emitter code.

**Adding a new event:** add the id → payload shape to `RagenEvents`, call `eventBus.emit(...)` at the site, then create any subscribers that should react.

**Limitations**: the bus is in-process and non-persistent. Events lost on crash or missed by other instances in a multi-instance deploy. For durability use Temporal or a DB write.

### MCP Connectors

Each external integration (Google Calendar/Drive/Analytics/Ads, Gmail, HubSpot, ClickUp, Slack, Fireflies, WooCommerce) is declared as a self-contained manifest under `src/features/connectors/providers/<name>.ts`. A manifest bundles everything that provider needs to exist: display metadata, auth type (`oauth | api_key_bearer | api_key_custom_header | external_mcp`), MCP server URL, scopes, OAuth client credentials (read from env), and the provider-specific system-prompt fragment that the chat adds when the connector is enabled.

`src/features/connectors/providers/registry.ts` aggregates the manifests into `PROVIDER_REGISTRY: Record<McpConnectorProvider, ProviderDefinition>` — the `Record` shape gives a compile-time guarantee that every value in the Prisma `McpConnectorProvider` enum has a manifest. Add an enum value without a manifest and TypeScript fails the build. The same file exposes `PROVIDER_LIST` (server-side, full manifests), `getProvider(id)`, `toPublicProviderDto(def)` and `PUBLIC_PROVIDER_LIST`.

**Client-safe DTO.** `toPublicProviderDto()` strips everything a browser must not see — OAuth client secret/id, function-valued `systemPromptFragment`, and server-only auth config (`useUserScope`, `headerName`, `mcpServerUrlPath`). Settings > Connectors consumes `PUBLIC_PROVIDER_LIST` so the full manifest never crosses the RSC boundary. Regression tests in `providers/__tests__/registry.test.ts` iterate every registered provider and fail the build if any sensitive field leaks through the DTO.

**System prompt builder.** `buildMcpContext(providerIds, timeZone, now)` in `providers/system-prompt.ts` walks the registry and concatenates the fragment for every enabled provider. Static strings are inlined; function-valued fragments (e.g. Google Calendar, which needs the caller's `timeZone`) are invoked with the context before inclusion.

**Adding a new MCP provider:** add the enum value to `prisma/schema.prisma` (regenerate the client), create `src/features/connectors/providers/<id>.ts` with the `ProviderDefinition`, and register it in `PROVIDER_REGISTRY`. The `Record<McpConnectorProvider, …>` type forces you to do all three — missing any one breaks `tsc`. No touch-ups needed across scattered files.

Old import paths (`CONNECTOR_PROVIDERS`, `getProviderDefinition` from `src/features/connectors/constants/providers.ts`; `buildMcpContext` from `src/libs/mcp/provider-instructions.ts`) remain as thin re-exports so existing callers keep working.

### State Management

- **Redux Toolkit** (`src/store/`): Client UI state (sidebar, assistant, threads, voice)
- **React Context**: Assistant settings, files, onboarding, thread search
- **Server state**: Prisma queries in server components and server actions

## Companion Services

ragen-app is part of a multi-service ecosystem. All repos live under the same parent directory.

### Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  ragen-app  │────▸│ apps/worker  │────▸│     Qdrant       │
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

**Requires**: Temporal server (started via `docker compose up` in ragen-app), PostgreSQL and Qdrant. Storage credentials are only needed with `STORAGE_PROVIDER=s3`; the default local provider needs none.

**Key env vars**: `TEMPORAL_SERVER_ADDRESS` (default `localhost:7233`), `DATABASE_URL`, `QDRANT_URL`, `LITELLM_PROXY_URL`, `LITELLM_MASTER_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME`.

**Workflows**:
- `runFileEmbeddings` — fetch from storage → parse → chunk → embed → store in Qdrant
- `scrapeWebsite` — Scrape URL via FireCrawl → create document → embed → store

### ragen-token-vault

Centralized token vault — stores OAuth tokens and API keys with AES-256-GCM encryption. All external connector tokens (Google, ClickUp, HubSpot, etc.) are stored here, not in ragen-app.

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
- `RAGEN_TOKEN_VAULT_SERVICE_SECRET` — shared HMAC secret (must match ragen-app and ragen-mcp)
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

Internal admin dashboard for platform management. Lives inside ragen-app as a separate Next.js app at `apps/admin/`.

```bash
cd apps/admin
npm run dev              # http://localhost:3200
```

**Pages**: Organizations, Users, Subscriptions, Invitations, AI Usage, Disk Usage, Activity Log, Models (per-org model allowlists), Limits (default org limits).

**Auth**: Uses the same Better Auth instance as ragen-app — only app-level admins (`User.role = 'admin'`) can access.

### LiteLLM (Unified LLM Gateway)

All LLM calls (chat completions + embeddings) are routed through a LiteLLM proxy that provides a single OpenAI-compatible API across providers (Azure OpenAI, AWS Bedrock, Google Vertex AI).

LiteLLM is started automatically via `docker compose up` on port **4000**.

```bash
# UI for model management
open http://localhost:4000/ui    # Login: admin / sk-litellm-dev-key
```

**Config**: `infra/litellm/config.yaml` — defines model names, provider routing, and Langfuse callbacks. Baked into Docker image for Railway deployment.

**Key env vars** (set on the LiteLLM container, not ragen-app):
- `AZURE_API_KEY`, `AZURE_API_BASE`, `AZURE_API_VERSION` — Azure OpenAI
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION_NAME` — AWS Bedrock
- `VERTEX_CREDENTIALS`, `VERTEX_PROJECT`, `VERTEX_LOCATION` — Google Vertex AI
- `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` — LLM tracing

**ragen-app env vars**: `LITELLM_PROXY_URL=http://localhost:4000`, `LITELLM_MASTER_KEY=sk-litellm-dev-key`, `DEFAULT_MODEL_PROVIDER=litellm`, `DEFAULT_MODEL=gemini-3-flash-preview` (matches `.env.example`). Always verify model names against `infra/litellm/config.yaml` — that file is the source of truth and model lineups rotate.

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

Public API service built with NestJS. Since [ADR-21](docs/adrs/21-monorepo-and-api-decoupling.md) it lives **in this repo** as the `@webamigos/ragen-api` workspace — not in a separate checkout. The standalone `ragen-api` repo is archived as the historical record.

```bash
npm run api:dev      # http://localhost:3001 (watch mode)
npm run api:build
npm run api:test
npm run api:lint
```

**Stack**: NestJS 11 + TypeScript + Prisma (`@prisma/adapter-pg`). Generates its own client from the **same** `prisma/schema.prisma` via a second `generator` block, so one `prisma generate` at the repo root covers both apps.

**Key features**:
- API key validation via ragen-token-vault (timing-safe comparison)
- Owns the ported RAG engine, vector store and connectors; serves `internal/*` routes to ragen-app over a session-auth bridge (`SESSION_AUTH_SECRET`)
- `POST /v1/chat` with SSE streaming
- Rate limiting (relaxed automatically when `TARGET_ENV` is `ci` or `test`)
- OpenTelemetry instrumentation

**Requires**: ragen-app (port 3000) + ragen-token-vault (port 3100).

> **Gotcha:** `apps/api` keeps its **own copies** of the RAG engine, vector store, connectors and the tenant-scope guard. A fix in `src/` usually needs the same edit in `apps/api/src/`, and the root `tsc -p .` does not cover `apps/api` — run `npm run api:build`.

### Running Everything Locally

```bash
# 1. Start infrastructure (from ragen-app) — pick one:
npm run ragen:up:full            # Full stack: Postgres, Qdrant, Temporal, LiteLLM, Docling, Redis
npm run ragen:up:app             # App-only:  Postgres, Qdrant, LiteLLM (no document processing)

# 2. Start ragen-app
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
| ragen-app | 3000 | Always |
| apps/worker | — | Document processing (requires `ragen:up:full`) |
| LiteLLM | 4000 | Always (auto-started via docker compose) |
| Docling | 5001 | Document parsing (`ragen:up:full`, UI at `/ui`) |
| Temporal UI | 8080 | Debugging workflows (`ragen:up:full`) |
| ragen-token-vault | 3100 | External connectors + API key validation |
| ragen-mcp | 8001-8003 | External connectors |
| Ragen Admin | 3200 | Platform administration |
| Ragen API | 3001 | Public API (chat endpoint, API key auth) |

## Path Aliases

```
@/*                    → src/*
@/temporal/*           → temporal/src/*
@ragenai/common-ui/*   → src/libs/common-ui/*
@ragenai/tui/*         → src/libs/tui/*
@ragenai/prisma-client → src/libs/db
```

## Working with Temporal

Temporal manages async workflows (document processing, file uploads, etc.). The worker lives in [`apps/worker`](apps/worker).

**Important**: Always use string names for workflows, not function imports:

```ts
// Correct
const handle = await client.workflow.start('estimateAgeWorkflow', {
  taskQueue: TASK_QUEUE_NAME,
  workflowId: personWorkflowId,
  args: [{ name: 'Janina' }],
});

// Wrong - do not import workflow functions directly
import { estimateAgeWorkflow } from '@/temporal/src/workflows';
```

## Token Vault (ragen-token-vault)

OAuth tokens and API keys for external connectors are stored in [ragen-token-vault](https://github.com/WebAmigos/ragen-token-vault) — a centralized token vault with AES-256-GCM encryption. All token operations go through `RagenAuthClient` (`src/libs/ragen-vault/client.ts`) using HMAC-SHA256 service-to-service auth.

### Auth flows

Three auth types are supported for connectors. All store tokens in ragen-token-vault.

```mermaid
flowchart TD
    subgraph "External MCP OAuth (ClickUp, HubSpot)"
        A1[User clicks Connect] --> A2[ragen-app creates connector PENDING]
        A2 --> A3["GET /api/connectors/external/connect"]
        A3 --> A4["RagenAuthOAuthClientProvider<br/>saves client info + code verifier<br/>to ragen-token-vault"]
        A4 --> A5[Returns authorization URL]
        A5 --> A6[Browser popup → OAuth provider]
        A6 --> A7[User authorizes]
        A7 --> A8["GET /api/connectors/external/callback"]
        A8 --> A9["mcpAuth() exchanges code → tokens"]
        A9 --> A10["RagenAuthOAuthClientProvider<br/>saves tokens to ragen-token-vault"]
        A10 --> A11[Connector marked CONNECTED]
    end

    subgraph "API Key Bearer (Fireflies)"
        B1[User enters API key] --> B2["registerApiKeyBearerCommand()"]
        B2 --> B3["ragenAuthClient.storeToken()<br/>stores encrypted API key"]
        B3 --> B4[Connector marked CONNECTED]
    end

    subgraph "Custom OAuth (Google Calendar, Drive, Analytics, Ads)"
        C1[User clicks Connect] --> C2["Browser → ragen-mcp /auth/google"]
        C2 --> C3["ragen-mcp → ragen-token-vault<br/>GET /v1/oauth/google/authorize"]
        C3 --> C4[ragen-token-vault generates PKCE + redirects to Google]
        C4 --> C5[User authorizes]
        C5 --> C6["Google → ragen-token-vault /v1/oauth/google/callback"]
        C6 --> C7["ragen-token-vault exchanges code → tokens<br/>encrypts + stores"]
        C7 --> C8[Redirect back to ragen-app]
        C8 --> C9[Connector marked CONNECTED]
    end
```

```mermaid
flowchart LR
    subgraph "During Chat — Token Usage"
        D1[User sends message] --> D2["Load enabled connectors"]
        D2 --> D3{"Auth type?"}
        D3 -->|api_key_bearer| D4["ragenAuthClient.getToken()"]
        D4 --> D5["Authorization: Bearer {key}"]
        D3 -->|external_mcp| D6["RagenAuthOAuthClientProvider.tokens()"]
        D6 --> D7["Auto-refresh if expired"]
        D7 --> D8["Authorization: Bearer {access_token}"]
        D3 -->|custom oauth| D9["x-customer-id header"]
        D5 --> D10[MCP server]
        D8 --> D10
        D9 --> D10
        D10 --> D11[AI gets tools]
    end
```

### Key files

| File | Purpose |
|---|---|
| `src/libs/ragen-vault/client.ts` | `RagenAuthClient` — HMAC-signed HTTP client for Ragen Token Vault API |
| `src/libs/ragen-vault/oauth-provider.ts` | `RagenAuthOAuthClientProvider` — implements `OAuthClientProvider` from `@ai-sdk/mcp` |
| `src/libs/mcp/client.ts` | `createMcpToolsFromConnectors()` — fetches tokens from Ragen Token Vault during chat |
| `src/features/connectors/services/commands/` | Connect/disconnect commands using `ragenAuthClient` |
| `src/app/api/connectors/external/` | OAuth connect + callback routes |

### Conventions

- **Provider names** are UPPERCASE in ragen-token-vault (matches `McpConnectorProvider` Prisma enum: `CLICKUP`, `HUBSPOT`, `FIREFLIES`, `GOOGLE_CALENDAR`, etc.)
- **Customer ID format**: `{orgId}:{userId}:{provider_lowercase}` (e.g. `abc123:user456:clickup`)
- **Environment variables**: `RAGEN_TOKEN_VAULT_URL` and `RAGEN_TOKEN_VAULT_SERVICE_SECRET` (shared secret must match ragen-token-vault config)

## OpenRouter Provider Routing & Zero Data Retention

OpenRouter requests can be routed through specific cloud providers (Vertex AI, Bedrock, Azure) with data collection controls via environment variables:

All defaults are **secure-by-default** (EU region, ZDR, no data collection). Override via env vars if needed:

| Env Variable | Default | Description |
|---|---|---|
| `OPENROUTER_BASE_URL` | `https://eu.openrouter.ai/api` | Base URL — EU region by default |
| `OPENROUTER_PROVIDER_ORDER` | `google-vertex,amazon-bedrock` | Comma-separated provider slugs tried in order |
| `OPENROUTER_DATA_COLLECTION` | `deny` | Prevents providers from training on requests |
| `OPENROUTER_ZDR` | `true` | Zero Data Retention — only use ZDR endpoints |
| `OPENROUTER_PROVIDER_ONLY` | _(none)_ | Restrict to only these providers |
| `OPENROUTER_PROVIDER_IGNORE` | _(none)_ | Exclude specific providers |

**Zero Data Retention (ZDR)**: When `OPENROUTER_ZDR=true`, requests are only routed to providers that guarantee customer data never reaches the model provider's own infrastructure and is never retained. This is critical for RAG applications handling customer documents.

**EU Region Routing** (default): All OpenRouter traffic routes through `https://eu.openrouter.ai/api` by default — data stays within EU infrastructure. Only models supporting EU in-region routing are available. Set `OPENROUTER_BASE_URL=https://openrouter.ai/api` to switch to global routing. EU routing requires enterprise or pay-as-you-go plan.

**No configuration needed** — secure defaults are applied automatically. To switch to global (non-EU) routing:
```bash
OPENROUTER_BASE_URL=https://openrouter.ai/api
```

These preferences are automatically applied to all OpenRouter requests (both env-level and org-level credentials).

## Per-Organization Model Management

App admins can control which models each organization can use via the ragen-admin Models page (`/models`).

- **Empty list = no restriction** (backward compatible — all models available)
- **Default allowed models**: Set defaults that apply to newly created organizations
- **Per-org overrides**: Restrict specific organizations to a subset of models

The `allowedModels` field is stored on `OrganizationSettings` and filtered in `getAvailableModelsForOrganization()`.

## Key Conventions

- **ESM**: `"type": "module"` — all `.js` files are ESM, CommonJS uses `.cjs`
- Server components by default; client components use `'use client'`
- All API routes use `export const dynamic = 'force-dynamic'`
- Prisma schema: `uuid` for IDs, `cuid` for `public_id` fields
- Database timestamps: `Timestamptz` (timezone-aware), default Europe/Warsaw
- i18n: Use `Link`, `redirect`, `usePathname`, `useRouter` from `@/i18n/routing`
- Pre-commit hooks: lint-staged runs `eslint --fix` + `prettier --write`
- Commit messages: conventional commits (commitlint enforced via Husky)
