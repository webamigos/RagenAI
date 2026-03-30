# Ragen AI

RAG (Retrieval Augmented Generation) AI chat application with multi-provider LLM support, document knowledge bases, and a public API.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 18 + TypeScript ~5.7
- **Styling**: Tailwind CSS 4
- **Database**: PostgreSQL (Prisma 7) + Redis (Upstash)
- **Search**: Meilisearch (vector/hybrid search)
- **LLM Providers**: OpenAI, Anthropic, Google, AWS Bedrock, Ollama, OpenRouter (with provider routing & ZDR), Fireworks, Azure OpenAI
- **Auth**: Better Auth with Prisma adapter
- **Async Jobs**: Temporal.io (separate [ragen-worker](https://github.com/WebAmigos/ragen-worker) repo)
- **Payments**: Stripe
- **Observability**: OpenTelemetry + Pino logging
- **i18n**: English & Polish via next-intl

## Local Development

**Prerequisites**: Node.js 22.x, Docker

```bash
docker compose up          # Start Postgres (5432), Redis (6379), Meilisearch (7700)
npm install                # Install dependencies
npm run generate:types     # Generate Prisma client
npm run dev                # Start Next.js dev server (Turbopack)
```

Set `.env.local` with at minimum:

```bash
DATABASE_URL="postgresql://postgres:pass123@localhost:5432/ragen"
DATABASE_DIRECT_URL="postgresql://postgres:pass123@localhost:5432/ragen"
```

## Commands

```bash
npm run dev              # Start dev server
npm run build            # Production build (runs prisma generate first)
npm run lint             # ESLint
npm run test             # Vitest (unit tests, watch mode)
npx vitest run           # Vitest (single run)
npm run test:e2e         # Playwright E2E tests
npm run test:e2e:ui      # Playwright in UI mode
npm run generate:types   # Regenerate Prisma client types
npm run db:seed          # Seed database
```

## Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── [locale]/                 # Locale-prefixed routes (en, pl)
│   │   ├── (panel)/              # Authenticated app (threads, settings, documents)
│   │   ├── (auth)/               # Sign-in, sign-up, forgot password
│   │   └── public/               # Public assistant chat widgets
│   ├── api/
│   │   ├── v1/                   # Public REST API
│   │   │   └── __logic__/        # API guards, context, DTOs, filters
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
│   ├── vector-store/             # Meilisearch & Supabase vector store clients
│   ├── document-loaders/         # PDF, EPUB, Markdown, SRT, URL parsing
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

REST API at `/api/v1/` authenticated via `x-api-key` header. Keys are validated against the database with bcrypt hash comparison. The app supports API-only mode (`IS_API_MODE=1`) which rewrites `/v1` → `/api/v1` for deployment at `api.ragen.io`.

### Auth

Better Auth with Prisma adapter + `admin` and `organization` plugins (with `createAccessControl`). On user creation, a hook auto-creates an organization, internal organization, and default project. Dual org system: Better Auth `Organization` for membership + Ragen `InternalOrganization` for app data (projects, API keys, subscriptions).

Two role hierarchies:
- **App-level** (`User.role`): `'admin'` (superadmin) vs `'user'` — platform-wide access
- **Org-level** (`Member.role`): `'owner'`, `'admin'`, `'member'` — per-organization permissions

Centralized in `src/lib/auth-access-control.ts` (client-safe checks) and `src/lib/auth-guards.ts` (server-side guards).

### Settings

Settings pages live under `src/app/[locale]/(panel)/settings/` with a dedicated layout rendering an internal left-side navigation. The main app sidebar remains unchanged when viewing settings.

**Permission-based navigation:**

| Permission | Pages | Visible to |
|---|---|---|
| User | General, Account, Connectors | All authenticated users |
| Org Admin | Organization, Assistant settings, Subscription, Teams | Organization owner/admin |
| App Admin | API Keys, Users, AI Usage, Disk Usage | Platform administrators |

App admins can access all settings pages. Theme switching (Light/Dark/System) is available in Settings > General via `next-themes`.

### Knowledge Base

The Knowledge Base supports nested folders, per-user file ownership, and sharing with users/teams.

- **Nested folders**: `DocumentFolder` model with self-referential tree (materialized path pattern)
- **File ownership**: `UserFile.ownerId` — legacy files (null owner) are visible to all org members
- **Sharing**: `DocumentPermission` model grants file/folder access to specific users or teams (`view`/`full` levels)
- **Three views**: "All Files" (org-wide), "My Files" (personal), "Shared with me" (explicitly shared)
- **RAG access control**: Meilisearch documents have `metadata.accessible_by` array for query-time filtering
- **Inline upload**: Documents-list page supports drag & drop + upload button with folder context

### Document Processing

Upload → S3 → Temporal worker → Parse → Generate embeddings → Store in Meilisearch. Each organization gets its own Meilisearch index. Embeddings use Cohere `cohere.embed-multilingual-v3` via AWS Bedrock (1024 dimensions).

**Google Drive folder import**: Users can import entire Drive folders into project knowledge bases. Files are fetched via the ragen-mcp Google service, uploaded to S3, and processed through the same embedding pipeline. Sync tracking (`GoogleDriveSync` model) records which folders have been imported.

### State Management

- **Redux Toolkit** (`src/store/`): Client UI state (sidebar, assistant, threads, voice)
- **React Context**: Assistant settings, files, onboarding, thread search
- **Server state**: Prisma queries in server components and server actions

## Companion Services

ragen-app is part of a multi-service ecosystem. All repos live under the same parent directory.

### Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  ragen-app  │────▸│ ragen-worker │────▸│   Meilisearch    │
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

### ragen-worker

Temporal worker that processes document parsing, embedding generation, thumbnail creation, and website scraping.

```bash
cd ../ragen-worker
npm install
npm run dev          # Start worker in watch mode
```

**Requires**: Temporal server (started via `docker compose up` in ragen-app), PostgreSQL, Meilisearch, S3 credentials.

**Key env vars**: `TEMPORAL_SERVER_ADDRESS` (default `localhost:7233`), `DATABASE_URL`, `MEILISEARCH_URL`, `LITELLM_PROXY_URL`, `LITELLM_MASTER_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME`.

**Workflows**:
- `runFileEmbeddings` — S3 download → parse → chunk → embed → store in Meilisearch
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

**Config**: `litellm/config.yaml` — defines model names, provider routing, and Langfuse callbacks. Baked into Docker image for Railway deployment.

**Key env vars** (set on the LiteLLM container, not ragen-app):
- `AZURE_API_KEY`, `AZURE_API_BASE`, `AZURE_API_VERSION` — Azure OpenAI
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION_NAME` — AWS Bedrock
- `VERTEX_CREDENTIALS`, `VERTEX_PROJECT`, `VERTEX_LOCATION` — Google Vertex AI
- `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` — LLM tracing

**ragen-app env vars**: `LITELLM_PROXY_URL=http://localhost:4000`, `LITELLM_MASTER_KEY=sk-litellm-dev-key`, `DEFAULT_MODEL_PROVIDER=litellm`, `DEFAULT_MODEL=gpt-4o`.

### Ragen API

Standalone public API service built with NestJS. Currently a boilerplate — will be developed to replace the API routes in ragen-app (`/api/v1/`).

```bash
cd ../ragen-api
npm install
npm run start:dev        # http://localhost:3300 (watch mode)
```

**Stack**: NestJS + TypeScript. Will share the same PostgreSQL database as ragen-app.

### Running Everything Locally

```bash
# 1. Start infrastructure (from ragen-app)
docker compose up -d             # Postgres, Meilisearch, Temporal, LiteLLM, Redis

# 2. Start ragen-app
npm run dev                      # http://localhost:3000

# 3. Start worker (separate terminal)
cd ../ragen-worker && npm run dev

# 4. Start token vault (separate terminal, needed for connectors)
cd ../ragen-token-vault && npm run dev    # http://localhost:3100

# 5. Start MCP servers (separate terminal, needed for connectors)
cd ../ragen-mcp && npm run dev:google     # http://localhost:8001

# 6. Start admin (separate terminal, needed for platform admin)
cd apps/admin && npm run dev              # http://localhost:3200
```

**Minimum for basic usage**: Steps 1-3 (infrastructure + app + worker).

| Service | Port | When needed |
|---------|------|-------------|
| ragen-app | 3000 | Always |
| ragen-worker | — | Always (processes document uploads) |
| LiteLLM | 4000 | Always (auto-started via docker compose) |
| Temporal UI | 8080 | Debugging workflows |
| ragen-token-vault | 3100 | External connectors (Google, ClickUp, etc.) |
| ragen-mcp | 8001-8003 | External connectors |
| Ragen Admin | 3200 | Platform administration |
| Ragen API | 3300 | Not yet (boilerplate) |

## Path Aliases

```
@/*                    → src/*
@/temporal/*           → temporal/src/*
@ragenai/common-ui/*   → src/libs/common-ui/*
@ragenai/tui/*         → src/libs/tui/*
@ragenai/prisma-client → src/libs/db
```

## Working with Temporal

Temporal manages async workflows (document processing, file uploads, etc.). The worker runs in a separate repo: [ragen-worker](https://github.com/WebAmigos/ragen-worker).

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
