# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
docker compose up        # Start local Postgres, Redis, Meilisearch, Temporal, LiteLLM
npm run dev              # Start Next.js dev server
npm run build            # Production build (runs prisma generate first)
npm run lint             # ESLint
npm run test             # Vitest (unit tests, watch mode)
npx vitest run           # Vitest (single run, no watch)
npx vitest run path/to/file  # Run a single test file
npm run test:e2e         # Playwright E2E tests
npm run test:e2e:ui      # Playwright in UI mode
npm run generate:types   # Regenerate Prisma client types (run after schema changes)
npm run db:seed          # Seed database (uses .env.local)
```

## Local Development

Requires Node.js 22.x. Start services with `docker compose up` (Postgres on 5432, Meilisearch on 7700, Temporal on 7233, Temporal UI on 8080, LiteLLM on 4000, optional Redis on 6379). Set `.env.local` with at minimum:

```
DATABASE_URL="postgresql://postgres:pass123@localhost:5432/smartrag"
DATABASE_DIRECT_URL="postgresql://postgres:pass123@localhost:5432/smartrag"
LITELLM_PROXY_URL=http://localhost:4000
LITELLM_MASTER_KEY=sk-litellm-dev-key
DEFAULT_MODEL_PROVIDER=litellm
DEFAULT_MODEL=gpt-4o
```

## Architecture

**Stack**: Next.js 15 (App Router) + React 18 + TypeScript ~5.7 + Tailwind CSS 4 + PostgreSQL (Prisma 7) + Redis (optional, for rate limiting only) + Meilisearch (vector/hybrid search) + Temporal.io (async workflow orchestration) + LiteLLM (unified LLM proxy)

**What it does**: RAG (Retrieval Augmented Generation) AI chat application with unified LLM gateway (LiteLLM), document knowledge bases, and a public API.

### Routing & Layouts

Routes are locale-prefixed (`/en/...`, `/pl/...`) via `next-intl`. All UI routes live under `src/app/[locale]/`:

- `(panel)/` — Authenticated app: threads, assistants, settings, documents, projects
- `(auth)/` — Sign-in, sign-up, forgot password, etc.
- `public/` — Public-facing assistant chat widgets

Middleware (`src/middleware.ts`) handles i18n routing and session cookie checks. Actual auth verification happens in server components/layouts, not middleware.

### Feature Modules (`src/features/`)

Domain logic is organized into feature modules following a CQRS (Command Query Responsibility Segregation) pattern:

```
features/{feature}/
├── contracts/          # Types, DTOs, schemas, enums
├── constants/          # Feature-specific constants
├── services/
│   ├── queries/        # Read operations — named get*Query()
│   └── commands/       # Write operations — named *Command()
└── utils/              # Feature-specific utilities
```

**Current feature modules**: `assistants`, `connectors`, `documents`, `messages`, `onboarding`, `organizations`, `projects`, `subscriptions`, `threads`, `users`

**Conventions**:
- Queries return data directly; commands return results or `OperationResult<T>`
- Import types from `@/features/{feature}/contracts/` (not from `@/app/contracts/` or `@/app/lib/types/`)
- Import business logic from `@/features/{feature}/services/` (not from `@/app/lib/services/`)
- Organization settings kept as single cohesive file (`organization-settings.ts`) due to shared DB query infrastructure
- Server actions in `src/app/actions/index.ts` delegate to feature commands/queries

### API

REST API at `src/app/api/v1/` with route handlers. Key subdirectories:
- `__logic__/` — Cross-cutting concerns: `guards/`, `context/`, `dtos/`, `types/`, `filters/`, plus `queries/` and `commands/` for API-specific data operations
- `threads/`, `assistants/`, `documents/`, `auth/`, `healthcheck/`, `query/`

API authentication uses `x-api-key` header → `apiKeyGuard()` (async) → validates key against database (bcrypt hash comparison) → returns `ApiContext` with `orgId`, `userId`, `projectId`. API keys store a `hashed_value` column for verification; keys without a stored hash are rejected.

The app can run in API-only mode (`IS_API_MODE=1`) which rewrites `/v1` → `/api/v1`.

### Auth

Better Auth (`src/lib/auth.ts`) with Prisma adapter + `admin` and `organization` plugins. On user creation, a hook auto-creates an organization, internal organization, and default project. Dual org system: Better Auth `Organization` for membership management + Ragen `InternalOrganization` for app-specific data (projects, API keys, subscriptions).

### Role-Based Access Control

Two distinct role hierarchies exist — **never confuse them**:

| Level | Field | Values | Purpose |
|-------|-------|--------|---------|
| **App-level** | `User.role` | `'admin'` (superadmin), `'user'` | Platform-wide admin access (disk usage, AI usage dashboards) |
| **Org-level** | `Member.role` | `'owner'`, `'admin'`, `'member'` | Per-organization permissions (manage members, edit profile) |

**Key files**:
- `src/lib/auth-access-control.ts` — **Client-safe**. Role constants (`APP_ADMIN_ROLE`, `APP_USER_ROLE`), types (`AppRole`, `OrgRole`), pure check functions (`isAppAdmin()`, `isOrgAdmin()`, `hasOrgRole()`), and Better Auth `createAccessControl` + `orgRoles` definitions
- `src/lib/auth-guards.ts` — **Server-only**. Async guards (`requireAppAdmin()`, `requireOrgAdmin()`, `requireOrgOwner()`), cached session/member lookups (`getSession()`, `getActiveMember()`)

**Conventions**:
- Use `isAppAdmin(user)` not `user.role === 'admin'`
- Use `isOrgAdmin(member.role)` not `['admin', 'owner'].includes(member.role)`
- Import pure checks from `@/lib/auth-access-control` (works in client and server)
- Import async guards from `@/lib/auth-guards` (server-only)
- Do NOT duplicate `getActiveMember` logic in action files — import it from `auth-guards`

### State Management

- **Redux Toolkit** (`src/store/`): Client UI state — sidebar, assistant config, threads list, voice mode. Typed hooks in `src/store/hooks.ts`.
- **React Context**: `AssistantSettingsContext`, `FilesContext`, `OnboardingContext`, `SearchThreadsContext`
- **Server state**: Prisma queries in server components and server actions (`src/app/actions/index.ts`)

### Prisma (v7)

Uses the PostgreSQL adapter pattern (`@prisma/adapter-pg`). Key files:
- Config: `prisma.config.ts` (excluded from tsconfig — processed by Prisma CLI directly)
- Schema: `prisma/schema.prisma`
- Client singleton: `src/libs/db/index.ts` (aliased as `@ragenai/prisma-client`)
- Generated client output: `src/generated/prisma/` (gitignored, regenerated via `npm run generate:types`)

Import `PrismaClient` from `@/generated/prisma/client`. Enums and types also come from there. In client components, webpack auto-redirects this import to `@/generated/prisma/browser` (browser-safe, no Node.js imports).

### Libraries (`src/libs/`)

- `llm/` — Chat completion & embeddings factories, all routed through LiteLLM proxy via `@ai-sdk/openai` with `.chat()` (OpenAI-compatible `/chat/completions` endpoint)
- `litellm/` — LiteLLM proxy client: dynamic model fetching from `/v1/models`, health checks, caching
- `chains/` — RAG chains
- `vector-store/` — Vector store clients (Meilisearch, Supabase) implementing `VectorStoreClient` interface
- `document-loaders/` — PDF, EPUB, Markdown, SRT, URL parsing
- `db/` — Prisma client singleton (aliased as `@ragenai/prisma-client`)
- `temporal/` — Temporal.io client for async document processing workflows
- `payments/` — Stripe integration
- `mcp/` — MCP (Model Context Protocol) client for connecting to external tool servers via `@ai-sdk/mcp`
- `ragen-vault/` — HTTP client for the Ragen Token Vault (HMAC-SHA256 signed requests, lazy-initialized singleton)
- `sse/` — Server-Sent Events for streaming
- `tui/` — Tailwind UI component library (aliased as `@ragenai/tui`)
- `common-ui/` — Shared UI utilities (aliased as `@ragenai/common-ui`)

### Document Processing Pipeline

Upload → S3 → Temporal worker (separate `ragen-worker` repo) → Parse → Generate embeddings → Store in Meilisearch. Status tracked via `ParsingStatus`/`EmbeddingStatus` enums in Prisma.

### Vector Store (Meilisearch)

Meilisearch provides hybrid search (keyword + vector) for RAG document retrieval. Key files:
- Client: `src/libs/vector-store/meilisearch-client.ts` — implements `VectorStoreClient` interface
- Interface: `src/libs/vector-store/types.ts` — `similaritySearch()`, `addDocuments()`
- Organization index: each org gets its own Meilisearch index (named by org ID)
- Embeddings: `userProvided` embedder with Cohere `cohere-embed-multilingual-v3` via LiteLLM proxy (1024 dimensions)
- Filtering: Qdrant-style filter objects are converted to Meilisearch filter strings internally
- Meilisearch requires the `vectorStore` experimental feature enabled via API (`PATCH /experimental-features`)
- Env vars: `MEILISEARCH_URL` (default `http://localhost:7700`), `MEILISEARCH_MASTER_KEY`

### MCP Integrations (External Tools)

Users can connect external services via Settings > Connectors. These are powered by MCP (Model Context Protocol) servers that provide tools to the AI during chat sessions.

**How it works:**
- Each connector stores an `mcp_server_url` and `customer_id` (format: `{orgId}:{userId}:{provider_lowercase}`) in the `McpConnector` Prisma model
- OAuth tokens and API keys are stored in **Ragen Token Vault** (centralized token vault), not in ragen-app's database
- During chat, `assistant-stream.ts` loads enabled connectors, `createMcpToolsFromConnectors()` fetches tokens from Ragen Token Vault, creates MCP clients via `@ai-sdk/mcp`, and passes the tools to `streamText()`
- AI SDK v6 uses `stopWhen: stepCountIs(N)` (not `maxSteps`) for multi-step tool use
- MCP clients are closed after streaming completes (or on error)
- System prompt includes per-provider guidance for tool usage (sorting, filtering, date handling) in `mcpContext`

**Token storage (Ragen Token Vault):**
- `src/libs/ragen-vault/client.ts` — `RagenAuthClient` with HMAC-SHA256 signing (lazy-initialized singleton via `ragenAuthClient`)
- `src/libs/ragen-vault/oauth-provider.ts` — `RagenAuthOAuthClientProvider` implements `OAuthClientProvider` from `@ai-sdk/mcp`, stores/retrieves tokens via Ragen Token Vault HTTP API
- Provider names in Ragen Token Vault use UPPERCASE (matches `McpConnectorProvider` Prisma enum)
- Three auth types: `external_mcp` (ClickUp, HubSpot — full OAuth via MCP server), `api_key_bearer` (Fireflies — user-provided API key), custom OAuth (Google — flow handled by Ragen Token Vault + ragen-mcp)

**Key files:**
- `src/features/connectors/` — CQRS feature module (contracts, queries, commands)
- `src/libs/mcp/client.ts` — Creates MCP clients from connector records, fetches tokens from Ragen Token Vault, returns tools + cleanup function
- `src/libs/ragen-vault/` — HTTP client + OAuth provider for Ragen Token Vault
- `src/libs/chains/basic-rag/chain.ts` and `conversation-chain/chain.ts` — Pass MCP tools to `streamText()` with `stopWhen: stepCountIs(10)`
- `src/app/[locale]/(panel)/settings/connectors/` — UI for connecting/disconnecting providers (OAuth popup flow)
- `src/app/api/connectors/external/` — OAuth connect + callback routes using `RagenAuthOAuthClientProvider`
- `src/app/api/threads/services/assistant-stream.ts` — Builds `mcpContext` with per-provider instructions appended to system prompt

**MCP Providers:**

| Provider | MCP Server | Tools |
|----------|-----------|-------|
| Google Calendar | `ragen-mcp` (own) | list_calendars, list_calendar_events, get_calendar_event, check_free_busy |
| Google Analytics | `ragen-mcp` (own) | get_traffic_report, get_conversion_data, get_top_pages, get_audience_insights |
| Google Ads | `ragen-mcp` (own) | list_campaigns, get_campaign_performance, get_cost_summary |
| Google Drive | `ragen-mcp` (own) | search_drive_files, read_drive_file, get_drive_file_info, list_drive_folder_files |
| HubSpot | Claude AI MCP | get_crm_objects, search_crm_objects, get/search_properties, get_user_details, search_owners |
| ClickUp | Claude AI MCP | search, create/get/update_task, create/get/update_list, create/get/update_folder, docs, comments, time tracking |
| Gmail | Claude AI MCP | search_messages, read_message, read_thread, create_draft, list_labels, get_profile |
| Slack | Slack MCP (`mcp.slack.com`) | search messages/files/users/channels, send messages, read threads, canvas CRUD, user profiles |

**External MCP server (own):** `ragen-mcp/services/google` — FastMCP + Hono TypeScript server deployed on Railway. MCP protocol on port 9001 (`/mcp`), HTTP/OAuth on port 8001. Per-user OAuth with PKCE, tokens stored in Ragen Token Vault (centralized vault). Google Analytics tools require `property_id` (GA4) and Google Ads tools require `ads_customer_id` (Ads) which the user must provide. Calendar, Drive, and Gmail tools do not require these parameters. Env vars: `MCP_GOOGLE_SERVER_URL` (MCP endpoint, e.g. `http://localhost:9001/mcp`), `MCP_GOOGLE_AUTH_URL` (OAuth endpoint, e.g. `http://localhost:8001` — falls back to `MCP_GOOGLE_SERVER_URL` if not set).

**Google Drive folder attachment & import:**

Users with a Google Drive connector can attach entire folder contents to chat or import them into project knowledge bases:

- **Prompt form**: "From Google Drive folder" opens a two-step dialog (folder search → file selection with checkboxes). Selected files' content is fetched in parallel and attached as `ThreadDocumentUI[]`.
- **Project KB import**: "From Google Drive" button in project files list. Selects a folder, then `importDriveFolderCommand` lists all files (max 200), fetches content, creates `UserFile` records, uploads to S3, and starts Temporal embedding workflows in batches of 5.
- **Sync tracking**: `GoogleDriveSync` Prisma model tracks which folders have been imported per project (for future auto-sync via Temporal cron — Phase 3, deferred). Imported files store `driveFileId`, `driveFolderId`, `driveModifiedTime` in `UserFile.metadata` JSON.
- **Key files**: `src/app/components/GoogleDriveFolderPickerDialog.tsx` (two-step dialog), `src/features/connectors/services/commands/import-drive-folder-command.ts` (KB import), `src/features/connectors/services/queries/list-drive-folder-files-query.ts` + `search-drive-folders-query.ts` (REST queries), `src/app/actions/google-drive.ts` (server actions).
- **REST endpoint on ragen-mcp**: `GET /drive/folder/:folder_id/files?customer_id=X&page_size=50&page_token=Y` — returns `{ success, files, folder_name, count, next_page_token }`.

### Settings Pages

Settings live under `src/app/[locale]/(panel)/settings/` with a dedicated layout (`layout.tsx`) that renders an internal left-side navigation + content area. The main sidebar does **not** change when on settings pages.

**Internal navigation component**: `settings/components/SettingsNav.tsx` (client component) — defines all nav items with icons and permission-based visibility.

**Permission levels for settings nav items**:

| Permission | Nav items | Who sees them |
|---|---|---|
| `user` | General, Account, Connectors | All authenticated users |
| `orgAdmin` | Organization, Assistant settings, Subscription, Teams | Org owner/admin (via `useOrganization().isOrgAdmin`) |
| `appAdmin` | API Keys, Users, AI Usage, Disk Usage | App admins only (via `useUser().isAppAdmin`) |

App admins can access all pages regardless of permission level.

**Key pages**:
- `settings/general/` — Appearance/theme switcher (light/dark/system) using `next-themes`
- `settings/account/` — Profile edit + password change (reuses components from `user/profile/components/`)
- `settings/connectors/` — External integrations (Google Calendar, Google Analytics, Google Ads) with OAuth popup flow
- `settings/[[...rest]]/` — Redirects `/settings` → `/settings/general`
- Org-level: `organization-profile/`, `prompt-management/`, `subscription/`, `teams/`
- App-admin: `api-keys/`, `users/`, `ai-usage/`, `disk-usage/`

**Theme**: Managed by `next-themes` (ThemeProvider in `src/app/components/Providers.tsx`). Uses `attribute="class"` with `defaultTheme="system"`. Theme selector component at `settings/general/components/ThemeSelector.tsx`.

**i18n**: Translations under `settings-page` namespace in `src/app/messages/{en,pl}.json`.

### Server Actions

`src/app/actions/index.ts` provides auth-wrapped server actions that delegate to feature module queries/commands. Component-level actions are co-located with their components (e.g., `src/app/components/ApiKeys/actions.ts`). New domain logic should go in `src/features/`, not in actions files.

**Security conventions for server actions**:
- **Never trust client-supplied `orgId` or `userId`** — always derive from session via `getOrgIdFromAuthOrThrow()` or `getOrgIdFromAuth()` + `getCurrentUserId()`
- All database queries that return user data must be **scoped by `organization_id`** to prevent IDOR (Insecure Direct Object Reference)
- Use `dangerouslySetInnerHTML` only with DOMPurify sanitization (import from `dompurify`)
- Never expose API keys via `NEXT_PUBLIC_` prefix — use server-side API routes for third-party service calls
- Use `crypto.timingSafeEqual()` for secret comparisons (not `===`)

## Path Aliases

```
@/*                    → src/*
@/temporal/*           → temporal/src/*
@ragenai/common-ui/*   → src/libs/common-ui/*
@ragenai/tui/*         → src/libs/tui/*
@ragenai/prisma-client → src/libs/db
```

## Key Conventions

- **Braces required**: Always use braces for control flow statements (`if`, `else`, `for`, `while`, etc.) — no single-line bodies. Write `if (x) { return; }` not `if (x) return`. Enforced by ESLint `curly` rule
- **ESM**: `"type": "module"` in package.json — all `.js` files are ESM. CommonJS scripts use `.cjs` extension. `moduleResolution: "bundler"` — no deep internal imports (e.g., `langchain/dist/...`)
- Server components by default; client components marked with `'use client'`
- All API routes use `export const dynamic = 'force-dynamic'`
- Prisma schema uses `uuid` for IDs, `cuid` for `public_id` fields
- Database timestamps use `Timestamptz` (timezone-aware), default timezone is Europe/Warsaw
- i18n: English (`en`) and Polish (`pl`) via `next-intl`. Use `Link`, `redirect`, `usePathname`, `useRouter` from `@/i18n/routing` (not from `next/link` or `next/navigation`)
- Styling: Tailwind CSS v4 with custom theme in `src/app/[locale]/global.css` using `@theme` directive; custom colors (Ragen red `#cb1d3d`, Ragen blue `#252d53`)
- Components organized by feature under `src/app/components/`
- Custom error classes: `UnauthorizedException`, `NotFoundException`, `LimitExceededException`
- Temporal workflows: use string names, not function imports (workflow definition limitation)
- Logging: Pino (server & client) with OpenTelemetry integration; webpack replaces server logger with client logger on client builds
- Observability: OpenTelemetry for traces, metrics, and logs — server (`ragen-app`) and client (`ragen-app-client`). Configured in `src/instrumentation.ts` and `src/instrumentation-client.ts`. LLM call tracing handled by LiteLLM → Langfuse (not by ragen-app OTel pipeline). App-level Langfuse tracing (`@langfuse/tracing`) remains in `assistant-stream.ts` for thread context.
- Pre-commit hooks: lint-staged runs `eslint --fix` + `prettier --write` on staged files
- Commit messages follow conventional commits (commitlint enforced via Husky)

## LiteLLM Proxy (Unified LLM Gateway)

All LLM calls (chat completions and embeddings) are routed through a **LiteLLM proxy** server. LiteLLM provides a single OpenAI-compatible API that routes to underlying providers (Azure OpenAI, AWS Bedrock, Google Vertex AI).

**Architecture**: ragen-app → `@ai-sdk/openai` (`.chat()`) → LiteLLM proxy (`/v1/chat/completions`) → Azure/Bedrock/Vertex

**Key files**:
- `litellm/config.yaml` — Model definitions and provider routing (baked into Docker image for Railway)
- `litellm/Dockerfile` — Railway deployment image
- `src/libs/litellm/client.ts` — Fetches available models from `/v1/models`, health checks
- `src/libs/llm/chat-completion-factory.ts` — Single factory using `createOpenAI({ baseURL })` with `.chat()`
- `src/libs/llm/embeddings-factory.ts` — Embeddings via LiteLLM using `.textEmbeddingModel()`
- `src/app/lib/services/llm.ts` — Credential setup, model creation
- `src/app/lib/actions/checkAvailableProviders.ts` — Dynamically fetches model list from LiteLLM

**Configured models** (in `litellm/config.yaml`):
- Azure OpenAI: `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`
- AWS Bedrock: `claude-sonnet-4-20250514`, `claude-opus-4-20250514`, `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`
- Google Vertex AI: `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.0-flash`
- Embeddings: `cohere-embed-multilingual-v3` (Bedrock)

**Model management**: Add/remove models via LiteLLM UI (`http://localhost:4000/ui`, login: `admin` / `LITELLM_MASTER_KEY`). Changes are reflected in ragen-app automatically via `/v1/models` endpoint.

**Env vars**:
- `LITELLM_PROXY_URL` — proxy URL (default: `http://localhost:4000`)
- `LITELLM_MASTER_KEY` — API key for proxy auth (default for local dev: `sk-litellm-dev-key`)
- `DEFAULT_MODEL_PROVIDER` — must be `litellm`
- `DEFAULT_MODEL` — model name matching `litellm/config.yaml` (e.g., `gpt-4o`)
- `REPHRASE_MODEL` — cheap/fast model for question rephrasing (e.g., `gpt-4.1-nano`)
- `EMBEDDING_MODEL` — embedding model name (default: `cohere-embed-multilingual-v3`)

**Langfuse tracing**: LiteLLM automatically traces all LLM calls (chat + embeddings) to Langfuse via `success_callback` / `failure_callback` in `config.yaml`. Set `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` env vars on the LiteLLM container. App-level tracing (thread context, user messages, tags) is still handled by `@langfuse/tracing` in `assistant-stream.ts`. The OTel-based `@langfuse/otel` span processor was removed — LiteLLM replaces it.

**Railway deployment**: `litellm/Dockerfile` bakes `config.yaml` into the image. Set provider credentials (`AZURE_API_KEY`, `AWS_ACCESS_KEY_ID`, `VERTEX_CREDENTIALS`, `LANGFUSE_*`, etc.) as Railway env vars. Use Railway managed Postgres for `LITELLM_DATABASE_URL`.

## Model Defaults

- **Default chat model**: `gpt-4o` (via LiteLLM → Azure OpenAI)
- **Rephrase model**: `gpt-4.1-nano` — cheapest/fastest model for question rephrasing. Do not upgrade this without explicit approval.

## Per-Organization Model Management

- `OrganizationSettings.allowedModels` (`String[]`, default `[]`) controls which models an org can use
- Empty `[]` = no restriction (backward compatible)
- Filtered in `getAvailableModelsForOrganization()` (`src/app/lib/actions/checkAvailableProviders.ts`)
- Default allowed models stored in `Settings` table (key `default_allowed_models`) — applied to new orgs via `applyDefaultLimitsToOrg()`
- Admin UI: `apps/admin/src/app/(dashboard)/models/` (follows same pattern as Limits page)
- Key functions: `getAllowedModels()`, `saveAllowedModels()`, `getDefaultAllowedModels()`, `saveDefaultAllowedModels()` in `src/features/organizations/services/organization-settings.ts`

## Post-Task Code Review

After completing any coding task that modifies or creates files, always run `/coderabbit:review` to review the changes before reporting completion to the user.
