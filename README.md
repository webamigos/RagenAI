# Ragen AI

RAG (Retrieval Augmented Generation) AI chat application with multi-provider LLM support, document knowledge bases, and a public API.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 18 + TypeScript ~5.7
- **Styling**: Tailwind CSS 4
- **Database**: PostgreSQL (Prisma 7) + Redis (Upstash)
- **Search**: Meilisearch (vector/hybrid search)
- **LLM Providers**: OpenAI, Anthropic, Google, AWS Bedrock, Ollama, OpenRouter, Fireworks, Azure OpenAI
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
DATABASE_URL="postgresql://postgres:pass123@localhost:5432/smartrag"
DATABASE_DIRECT_URL="postgresql://postgres:pass123@localhost:5432/smartrag"
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

### Document Processing

Upload → S3 → Temporal worker → Parse → Generate embeddings → Store in Meilisearch. Each organization gets its own Meilisearch index. Embeddings use OpenAI `text-embedding-3-small` (1536 dimensions).

### State Management

- **Redux Toolkit** (`src/store/`): Client UI state (sidebar, assistant, threads, voice)
- **React Context**: Assistant settings, files, onboarding, thread search
- **Server state**: Prisma queries in server components and server actions

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

## Token Vault (ragen-auth)

OAuth tokens and API keys for external connectors (Google, ClickUp, HubSpot, Fireflies) are stored in [ragen-auth](https://github.com/WebAmigos/ragen-auth) — a centralized token vault with AES-256-GCM encryption.

### How ragen-app uses ragen-auth

**Authentication**: All requests use HMAC-SHA256 with a shared secret (`RAGEN_AUTH_SERVICE_SECRET`). Include `X-Service-Name: ragen-app` for audit trail.

```
Authorization: HMAC-SHA256 ts={unix_timestamp},sig={hex_signature}
X-Service-Name: ragen-app
```

Signature: `HMAC(secret, "{timestamp}\n{method}\n{path}\n{body_sha256}")`

**Integration points:**

| Current (ragen-app) | New (via ragen-auth) | Endpoint |
|---|---|---|
| `McpOAuthToken` Prisma model | `PUT /v1/tokens/:customerId/:provider` | Store token after OAuth callback |
| `PrismaOAuthClientProvider` | `GET /v1/tokens/:customerId/:provider` | Fetch decrypted tokens for MCP tool calls |
| Connector disconnect | `DELETE /v1/tokens/:customerId/:provider` | Remove tokens on disconnect |
| Connector status check | `GET /v1/tokens/:customerId/:provider/status` | Check if token exists and is valid |
| List user connectors | `GET /v1/tokens/:customerId` | List all connected providers (metadata only) |

**Migration path:**

1. Create `RagenAuthClient` — HTTP client wrapping ragen-auth API with HMAC signing
2. Replace `PrismaOAuthClientProvider` with `RagenAuthOAuthClientProvider` (same interface, HTTP calls instead of Prisma)
3. Update `createMcpToolsFromConnectors()` in `assistant-stream.ts` to fetch tokens from ragen-auth
4. Migrate existing `McpOAuthToken` records to ragen-auth via migration script
5. Remove `McpOAuthToken` model from Prisma schema

**Environment variables:**

```bash
RAGEN_AUTH_URL="https://ragen-auth.up.railway.app"  # ragen-auth service URL
RAGEN_AUTH_SERVICE_SECRET="..."                       # Shared HMAC secret (must match ragen-auth)
```

**Customer ID format**: `{orgId}:{userId}` — consistent with existing MCP connector `customer_id` field.

## Key Conventions

- **ESM**: `"type": "module"` — all `.js` files are ESM, CommonJS uses `.cjs`
- Server components by default; client components use `'use client'`
- All API routes use `export const dynamic = 'force-dynamic'`
- Prisma schema: `uuid` for IDs, `cuid` for `public_id` fields
- Database timestamps: `Timestamptz` (timezone-aware), default Europe/Warsaw
- i18n: Use `Link`, `redirect`, `usePathname`, `useRouter` from `@/i18n/routing`
- Pre-commit hooks: lint-staged runs `eslint --fix` + `prettier --write`
- Commit messages: conventional commits (commitlint enforced via Husky)
