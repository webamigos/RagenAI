# AGENTS.md

Guidance for coding agents working in this repository. This is the canonical
file — Claude Code, Codex, Cursor and Copilot all read `AGENTS.md`, and
`CLAUDE.md` is a one-line import of it so both names resolve to the same
content. Edit this file, never the pointer.

> **Instruction budget:** keep this file under **32,768 bytes** — Codex's
> default `project_doc_max_bytes`. Content past that offset never reaches the
> agent, silently. Check with `wc -c AGENTS.md`. When it gets close, move
> long-form detail into `docs/` and leave a pointer here rather than trimming
> the hard rules. `apps/api/AGENTS.md` has the same budget and was split for
> exactly this reason.

## Commands

```bash
docker compose up        # Postgres, Redis, Qdrant, Temporal, LiteLLM
npm run dev              # Next.js dev server
npm run build            # Production build (runs prisma generate first)
npm run lint             # ESLint
npx vitest run           # Unit tests (single run). Add path to run one file.
npm run test:e2e         # Playwright E2E tests (requires ragen_e2e DB)
npm run generate:types   # Regenerate Prisma client after schema changes
npm run db:seed          # Seed database (uses .env.local)
```

**E2E setup**: E2E uses a separate `ragen_e2e` DB. One-time: `createdb ragen_e2e` → run migrations against it → create `.env.e2e.local` overriding `DATABASE_URL`/`DATABASE_DIRECT_URL`. Must `npm run build` before `npm run test:e2e`. If LiteLLM isn't on :4000, `e2e/mock-llm-server.ts` starts automatically.

## Task Router

Before starting a nontrivial task, match it against this table and read the linked doc(s) first — and check [`docs/lessons.md`](docs/lessons.md) for the relevant area, so you don't re-discover a known gotcha. Skip this for single-line/obvious fixes.

| Task | Where to look |
|---|---|
| **RAG pipeline** | |
| Retrieval quality, hybrid search, reranking | [`docs/rag-pipeline.md`](docs/rag-pipeline.md), ADRs [11](docs/adrs/11-qdrant-vector-store.md)/[12](docs/adrs/12-cohere-rerank-post-retrieval.md)/[14](docs/adrs/14-hybrid-search-dense-sparse.md), this file's "RAG Pipeline" section |
| Multi-query expansion / rephrasing | ADR [15](docs/adrs/15-multi-query-expansion.md) |
| Document summaries at ingest | ADR [16](docs/adrs/16-document-summaries-at-ingest.md) |
| Chunking strategy, PDF heading detection, section-aware context | ADRs [17](docs/adrs/17-type-specific-chunking.md)/[18](docs/adrs/18-pdf-heading-detection.md)/[19](docs/adrs/19-section-aware-context-rendering.md) |
| Measuring/evaluating RAG quality changes | ADR [20](docs/adrs/20-pause-and-measure-rag-quality.md), `evals/` |
| **Data & access control** | |
| Vector store (Qdrant/Meilisearch/Supabase), collection schema | this file's "Vector Store" section, ADRs [08](docs/adrs/08-meilisearch-vector-store.md)/[11](docs/adrs/11-qdrant-vector-store.md)/[14](docs/adrs/14-hybrid-search-dense-sparse.md) |
| Knowledge base folders, sharing, permissions, IDOR concerns | this file's "Knowledge Base" section |
| Tenant/org data scoping, cross-org data leaks | `src/libs/db/tenant-scope-guard.ts`, this file's "Prisma (v7)" and "Server Actions — Security" sections, [`docs/lessons.md`](docs/lessons.md) (`architecture`/`security` areas) |
| Prisma schema changes, migrations | this file's "Prisma (v7)" section, ADR [03](docs/adrs/03-prisma-v7-migration.md) |
| Auth, RBAC, permission checks | this file's "RBAC" section, `src/lib/auth-guards.ts`, `src/lib/auth-access-control.ts` |
| Thread message encryption, KMS keys | this file's "Thread Message Encryption" section, ADRs [02](docs/adrs/02-per-org-kms-keys.md)/[06](docs/adrs/06-thread-message-encryption.md) |
| **Integrations** | |
| MCP connectors (Slack/HubSpot/ClickUp/Google/Fireflies) | this file's "MCP Integrations" section, ADR [05](docs/adrs/05-mcp-integration-strategy.md) |
| LiteLLM / model routing / adding a model | this file's "LiteLLM Proxy" section, `litellm/config.yaml` |
| Public API, opaque API keys | ADR [13](docs/adrs/13-opaque-api-keys.md), this file's "API" section |
| Chatbot embed widget | [`docs/chatbot-integration-followups.md`](docs/chatbot-integration-followups.md) |
| **Monorepo & apps/api** | |
| Anything touching `apps/api`, the NestJS port, or what's been cut over vs. stays local | [`docs/adrs/21-monorepo-and-api-decoupling.md`](docs/adrs/21-monorepo-and-api-decoupling.md) (read the latest updates first), `apps/api/AGENTS.md` |
| **Testing & ops** | |
| Unit/component tests | this file's "Testing Requirements" section |
| E2E tests, regression sweep before a release | this file's "E2E Tests" section, [`docs/regression-checklist.md`](docs/regression-checklist.md) |
| Security incidents, PII alerting | [`docs/security-monitoring.md`](docs/security-monitoring.md) |
| LiteLLM version upgrades | [`docs/runbooks/litellm-upgrade.md`](docs/runbooks/litellm-upgrade.md) |

## Local Development

Node.js 22.x. Minimum `.env.local`:

```
DATABASE_URL="postgresql://postgres:pass123@localhost:5432/smartrag"
DATABASE_DIRECT_URL="postgresql://postgres:pass123@localhost:5432/smartrag"
QDRANT_URL=http://localhost:6333
LITELLM_PROXY_URL=http://localhost:4000
LITELLM_MASTER_KEY=sk-litellm-dev-key
DEFAULT_MODEL_PROVIDER=litellm
DEFAULT_MODEL=gemini-3-flash-preview
```

Service ports: Postgres 5432, Qdrant 6333, Temporal 7233 (UI 8080), LiteLLM 4000, optional Redis 6379.

Optional observability stack (not started by default): `docker compose --profile observability up -d` brings up an OTel Collector (OTLP gRPC 4317, HTTP 4318) and Jaeger (UI 16686). Point the app at it with `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`.

## Architecture

**Stack**: Next.js 16 (App Router) + React 19 + TypeScript ~5.7 + Tailwind 4 + Postgres (Prisma 7) + Qdrant (hybrid dense+sparse) + Temporal.io + LiteLLM proxy + Scaleway reranker. Redis is optional (rate limiting only).

**What it is**: RAG AI chat app with unified LLM gateway (LiteLLM), document knowledge bases, and a public API.

### RAG Pipeline

Four composed improvements, all on by default (ADRs 11, 12, 14, 15, 16). Visual diagrams: [`docs/rag-pipeline.md`](docs/rag-pipeline.md).

| ADR | Stage | Purpose |
|---|---|---|
| **14** Hybrid search | Retrieval | Dense (`bge-multilingual-gemma2`) + sparse (BM25) with server-side RRF |
| **15** Multi-query | Before retrieval | Expand to N-1 alternative phrasings via `REPHRASE_MODEL` (standalone question always first) |
| **16** Summaries | Ingest | Worker prepends a summary chunk (`metadata.chunk_type: 'summary'`) per document |
| **12** Rerank | After retrieval | Cross-encoder sharpens top-k (Scaleway `qwen3-embedding-8b` by default) |

**Ingest** (in `ragen-worker`): parse → chunk → summarize → prepend summary chunk → hybrid embed → upsert to Qdrant (named vectors) + best-effort merge `UserFile.metadata.summary`.

**Retrieval** (`src/libs/chains/basic-rag/`): rephrase to standalone → `expandQueries()` → parallel hybrid searches → dedupe by content → rerank → answer generation with citation prompting.

- Multi-query: `MULTI_QUERY_VARIANT_COUNT = 2` (3 total). Per-query k divided so reranker input stays bounded. Graceful single-query fallback on any error.
- Reranker: 3x over-retrieve, falls back to vector results on provider errors. `RERANK_PROVIDER` selects the backend — unset (default) uses Scaleway `/v1/rerank` with `qwen3-embedding-8b`; `cohere` opts back into Bedrock Cohere Rerank v3.5 via LiteLLM, which requires AWS credentials and re-enabling `cohere-rerank-v3-5` in `litellm/config.yaml`.
- Flags: `FEATURE_FLAG_MULTI_QUERY`, `FEATURE_FLAG_DOC_SUMMARIES` (both default on).

### Routing & Layouts

Locale-prefixed (`/en`, `/pl`) via `next-intl`. All UI under `src/app/[locale]/`:
- `(panel)/` — authenticated app (threads, assistants, settings, documents, projects)
- `(auth)/` — sign-in/up, forgot password
- `public/` — public assistant chat widgets

Middleware (`src/middleware.ts`) handles i18n + cookie checks; real auth verification happens in server components/layouts.

### Feature Modules (`src/features/`)

CQRS pattern per feature:

```
features/{feature}/
├── contracts/   # types, DTOs, schemas, enums
├── constants/
├── services/
│   ├── queries/   # read — named get*Query()
│   └── commands/  # write — named *Command()
└── utils/
```

Modules: `assistants`, `connectors`, `documents`, `messages`, `onboarding`, `organizations`, `projects`, `subscriptions`, `threads`, `users`.

**Conventions**:
- Queries return data directly; commands return results or `OperationResult<T>`
- Import types from `@/features/{feature}/contracts/` (NOT `@/app/contracts/` or `@/app/lib/types/`)
- Import logic from `@/features/{feature}/services/` (NOT `@/app/lib/services/`)
- Server actions in `src/app/actions/index.ts` delegate to feature commands/queries
- New domain logic goes in `src/features/`, not in actions files

### API

Public API served by separate **ragen-api** (NestJS). ragen-app exposes internal endpoints at `src/app/api/v1/` called by ragen-api only.

- Chat endpoint: `src/app/api/v1/chat/route.ts`. Protected by `INTERNAL_API_SECRET` shared secret via `x-internal-secret` (timing-safe). Context headers `x-org-id`, `x-user-id`, `x-project-id` set by ragen-api after API key validation. Supports SSE and JSON responses.
- API keys (ADR-13): opaque `sk-<keyId>.<secret>` format, no org context in key — ragen-api resolves from DB. Stored in ragen-token-vault; DB has only `maskedValue`.
- API-only mode: `IS_API_MODE=1` rewrites `/v1` → `/api/v1`.

### Auth

Better Auth (`src/lib/auth.ts`) with Prisma adapter + `admin` and `organization` plugins. User creation hook auto-creates Better Auth `Organization`, Ragen `InternalOrganization`, and default project. Better Auth manages membership; `InternalOrganization` holds app-specific data (projects, API keys, subscriptions).

### RBAC — Two distinct role hierarchies (never confuse)

| Level | Field | Values | Purpose |
|---|---|---|---|
| **App** | `User.role` | `'admin'`, `'user'` | Platform admin (disk/AI usage dashboards) |
| **Org** | `Member.role` | `'owner'`, `'admin'`, `'member'` | Per-org permissions |

- `src/lib/auth-access-control.ts` — **client-safe**: constants, types, pure checks (`isAppAdmin()`, `isOrgAdmin()`, `hasOrgRole()`), Better Auth access control defs
- `src/lib/auth-guards.ts` — **server-only**: async guards (`requireAppAdmin()`, `requireOrgAdmin()`, `requireOrgOwner()`), cached session/member lookups (`getSession()`, `getActiveMember()`)
- Use `isAppAdmin(user)` / `isOrgAdmin(member.role)` — never inline role comparisons. Do NOT duplicate `getActiveMember` in action files.

### State Management

- **Redux Toolkit** (`src/store/`): client UI state (sidebar, assistant config, threads list, voice). Typed hooks in `src/store/hooks.ts`.
- **React Context**: `AssistantSettingsContext`, `FilesContext`, `OnboardingContext`, `SearchThreadsContext`
- **Server state**: Prisma queries in server components and server actions

### Prisma (v7)

Uses `@prisma/adapter-pg`. Config: `prisma.config.ts` (excluded from tsconfig). Schema: `prisma/schema.prisma`. Client singleton: `src/libs/db/index.ts` (aliased `@ragenai/prisma-client`). Generated output: `src/generated/prisma/` (gitignored, `npm run generate:types`).

`prisma/schema.prisma` is the **single shared schema for the whole monorepo** — `apps/api` (NestJS) generates its own client from the same file via a second `generator apiClient` block (output `apps/api/src/generated/prisma`). One `prisma generate` at the repo root regenerates both. Do not create a separate schema for another app — add another `generator` block here instead. See `docs/adrs/21-monorepo-and-api-decoupling.md`.

Import `PrismaClient`, enums, and types from `@/generated/prisma/client`. Webpack auto-redirects this to `@/generated/prisma/browser` in client components.

**Tenant-scope guard (warn-only)**: `src/libs/db/tenant-scope-guard.ts` is a Prisma Client Extension, wired into the singleton, that logs a warning (via `logger.warn`) whenever a query on a tenant-scoped model runs without its org field (`organizationId`, or `orgId` for `DocumentCitation`) present in `where`/`data`. It covers ~20 models with a direct org column (`Thread`, `Project`, `UserFile`, `DocumentFolder`, `McpConnector`, etc. — see the file for the full list); it does **not** cover models scoped only via a relation (`Message`, `ThreadDocument`, `DocumentPermission`, `ProjectPermission`, `ThreadShare*`) since there's no column to check. It **warns, it does not throw** — a repo-wide grep found ~200 existing call sites across `ragen-app` and `apps/api`, too many to audit in one pass; flipping to hard enforcement is deliberate future work once the warning logs are clean. Mirrored independently in `apps/api/src/prisma/tenant-scope-guard.ts` (no shared package for this yet — keep both in sync by hand). See `docs/lessons/missing-org-scope-on-project-lookup.md` for the one confirmed real bug this already caught.

### Libraries (`src/libs/`)

- `llm/` — chat completion + embeddings factories through LiteLLM (`@ai-sdk/openai` `.chat()`)
- `litellm/` — proxy client: dynamic model fetching, health checks
- `chains/` — RAG chains (see `basic-rag/`)
- `vector-store/` — Qdrant (default), Meilisearch, Supabase clients implementing `VectorStoreClient`
- `reranker/` — Scaleway `/v1/rerank` (default) or Bedrock Cohere Rerank v3.5, selected by `RERANK_PROVIDER`
- `document-loaders/` — PDF, EPUB, DOCX, Markdown, SRT, CSV, XLSX, Image, URL parsing
- `db/` — Prisma singleton
- `temporal/` — Temporal.io client for async document workflows
- `payments/` — Stripe
- `mcp/` — MCP client via `@ai-sdk/mcp`
- `ragen-vault/` — Ragen Token Vault HTTP client (HMAC-SHA256 signed, lazy singleton)
- `crypto/` — KMS envelope encryption for thread messages
- `monitoring/` — OTel helpers: `withSpan()` for manual business-logic spans (mirrors ragen-api's), plus the logs-API bridge. No-op when no OTLP endpoint is configured.
- `sse/` — Server-Sent Events streaming
- `tui/` — Tailwind UI lib (aliased `@ragenai/tui`)
- `common-ui/` — shared UI utils (aliased `@ragenai/common-ui`)

### Knowledge Base (Folders, Sharing, Access Control)

Nested folders, per-user file ownership, sharing with users/teams.

**Data model**:
- `DocumentFolder`: `Int` `id` + UUID `publicId`. Self-referential via `parentId` + materialized `path` column (e.g. `/1/5/12/`). Optional `teamId`, `ownerId`.
- `UserFile`: `ownerId` (nullable for legacy org-wide) + `folderId`.
- `DocumentPermission`: grants access to files or folders for users/teams via optional FKs (`filePublicId`, `folderId`). Levels: `'view'`, `'full'`. Folder permissions cascade via `path LIKE`.

**Visibility rules**: `ownerId = null` → all org members (legacy). `ownerId = userA` → owner + org admins + explicit shares. Folder with `teamId` → team members + org admins. UI views: All Files / My Files / Shared with me.

**Vector store access filtering**: each chunk has `metadata.accessible_by: string[]` (`org:<id>`, `user:<id>`, `team:<id>`). RAG queries add this filter for non-admins; org admins bypass. Filter built in `src/app/api/threads/services/initializeBasicRag.ts`. Sync command: `sync-vector-permissions-command.ts`. Backfill script: `src/scripts/backfill-accessible-by.ts`.

**Key files**: `src/features/documents/` (contracts + commands), `src/features/documents/utils/folder-tree.ts` (`buildFolderTree()`), `src/app/actions/folders.ts` + `permissions.ts`, UI under `src/app/components/ManageKnowledge/Folders/` and `src/app/[locale]/(panel)/knowledge/documents-list/`.

**Upload with folder context**: `/api/upload` accepts optional `folderId` in FormData; files created with `folderId` + `ownerId`.

### Document Processing

Upload → S3 → Temporal worker (`ragen-worker` repo) → parse → embed → store in Qdrant. Status via `ParsingStatus`/`EmbeddingStatus` enums.

**File types** (`FileType` enum: `PDF`, `EPUB`, `DOCX`, `SRT`, `TEXT`, `MARKDOWN`, `URL`, `IMAGE`, `CSV`, `XLSX`):
- **PDF**: worker uses Claude native PDF (base64 to Claude in single call). `PDF_PROCESSOR=claude|vision`, `PDF_MODEL=claude-haiku-4-5`. Chat: attached as binary data URL.
- **DOCX**: `mammoth` (client-side in chat, worker-side for KB).
- **Image** (jpg/png/webp/gif): chat uses multimodal vision LLMs w/ lightbox; KB describes via vision LLM then embeds.
- **XLSX/XLS**: SheetJS → CSV (client for chat, worker for KB).
- **CSV/TXT/Markdown**: read as plain text (5MB CSV limit in chat).
- **SRT**: worker uses LLM to chunk into meaningful segments.
- **EPUB**: binary upload, worker text extraction.

### Thread Message Encryption

Message content encrypted at rest via **AWS KMS envelope encryption** (AES-256-GCM). Thread titles stay plaintext for search.

- Per-thread DEK via KMS `GenerateDataKey`. Encrypted DEK stored in `Thread.encryptedDek` (base64). Per-request DEK cache minimizes KMS calls.
- **Env gating**: no `AWS_KMS_KEY_ID` → encryption disabled (local dev stays plaintext). Uses existing `AWS_*` credentials.
- Key files: `src/libs/crypto/thread-encryption.ts`, `src/libs/crypto/decrypt-messages.ts`, `src/features/messages/services/commands/create-message-command.ts` (race-safe conditional update), `src/features/threads/services/commands/encrypt-threads-command.ts`, `src/app/actions/encrypt-threads.ts`.
- **Langfuse**: when encryption enabled, `input`/`output` omitted from traces (only tags, sessionId, model).
- **Search trade-off**: `searchAllQuery` skips content matching for encrypted threads — title matches only.
- **Admin migration**: `encryptAllThreadsAction()` (app admin only) — idempotent, resumable.

### Vector Store (Qdrant, Hybrid)

Default: Qdrant hybrid named vectors + server-side RRF fusion. Meilisearch and Supabase are legacy dense-only, selected via `Organization.vectorStore` (`null|'qdrant'|'meilisearch'|'supabase'`).

**Collection schema**:
```
vectors:         dense  { size: 3584, distance: Cosine }  # bge-multilingual-gemma2 (VECTOR_SIZE)
sparse_vectors:  sparse { modifier: idf }                 # Qdrant server-side BM25
```

**Query flow**: dense embed + BM25 sparse encode → Qdrant Query API with two `prefetch` branches + `fusion: 'rrf'` → top-k fused. Falls back to dense-only when query has no tokenizable content (e.g. `"42 !!"`). `PREFETCH_MULTIPLIER = 4`.

**Key files**: `src/libs/vector-store/types.ts` (`VectorStoreClient` interface), `qdrant-client.ts`, `bm25-encoder.ts` (pure-TS unicode tokenizer + FNV-1a hashing — mirror in `ragen-worker/src/services/bm25-encoder.ts`), `meilisearch-client.ts`, `supabase-client.ts`.

**Config**:
- Per-org Qdrant collection (named by org ID)
- Payload indexes: `metadata.project_id`, `file_id`, `organization_id`, `accessible_by` (keyword type). NOTE: ADR-11 mentioned `project_public_id` but that index was never created — retrieval filters use internal `project_id`.
- `metadata.chunk_type: 'summary'` marks ADR-16 summary chunks (participate in normal hybrid retrieval).
- Filter format: intermediate `{ must: [...], should: [...] }`; each client converts internally.
- Env: `QDRANT_URL` (default `http://localhost:6333`), `QDRANT_API_KEY` (optional).
- **Schema break**: hybrid collections use named vectors; pre-ADR-14 unnamed collections are incompatible — vector store was wiped before rollout.

### MCP Integrations (External Tools)

External services connected via Settings > Connectors, powered by MCP servers providing tools during chat.

**How it works**: `McpConnector` Prisma model stores `mcp_server_url` + `customer_id` (format: `{orgId}:{userId}:{provider_lowercase}`). Tokens stored in **Ragen Token Vault**, not in ragen-app DB. During chat, `assistant-stream.ts` loads enabled connectors, `createMcpToolsFromConnectors()` fetches tokens from vault, creates MCP clients via `@ai-sdk/mcp`, passes tools to `streamText()`. Clients closed after streaming. AI SDK v6 uses `stopWhen: stepCountIs(10)` (not `maxSteps`). System prompt includes per-provider guidance in `mcpContext` (sorting, filtering, date handling).

**Token storage**: `src/libs/ragen-vault/client.ts` (HMAC-SHA256 singleton), `oauth-provider.ts` (implements `OAuthClientProvider` from `@ai-sdk/mcp`). Provider names in vault use UPPERCASE (matches `McpConnectorProvider` Prisma enum). Three auth types: `external_mcp` (ClickUp, HubSpot), `api_key_bearer` (Fireflies), custom OAuth (Google via vault + ragen-mcp).

**Key files**: `src/features/connectors/`, `src/libs/mcp/client.ts`, `src/libs/ragen-vault/`, `src/libs/chains/basic-rag/chain.ts` + `conversation-chain/chain.ts`, `src/app/[locale]/(panel)/settings/connectors/`, `src/app/api/connectors/external/`, `src/app/api/threads/services/assistant-stream.ts`.

**Providers**:
- **Own** (`ragen-mcp` FastMCP + Hono on Railway, port 9001 `/mcp`, OAuth on port 8001, per-user OAuth with PKCE): Google Calendar, Google Analytics, Google Ads, Google Drive. Analytics requires `property_id`, Ads requires `ads_customer_id`. Env: `MCP_GOOGLE_SERVER_URL`, `MCP_GOOGLE_AUTH_URL`.
- **Claude AI MCP**: HubSpot, ClickUp, Gmail.
- **Slack MCP** (`mcp.slack.com`): search/send messages, threads, canvas, users.

**Google Drive folder import**: users can attach folder contents to chat or import into project KBs. Prompt form uses two-step dialog (`GoogleDriveFolderPickerDialog.tsx`). Project import via `importDriveFolderCommand` lists up to 200 files, creates `UserFile` records, uploads to S3, starts Temporal workflows in batches of 5. `GoogleDriveSync` model tracks imports per project (auto-sync deferred to Phase 3). Imported files store `driveFileId`, `driveFolderId`, `driveModifiedTime` in `UserFile.metadata`. REST endpoint on ragen-mcp: `GET /drive/folder/:folder_id/files`.

### Settings Pages

Under `src/app/[locale]/(panel)/settings/` with dedicated `layout.tsx` (internal left nav — main sidebar doesn't change). Nav in `settings/components/SettingsNav.tsx`.

| Permission | Nav items |
|---|---|
| `user` | General, Account, Connectors |
| `orgAdmin` (via `useOrganization().isOrgAdmin`) | Organization, Assistant settings, Subscription, Teams |
| `appAdmin` (via `useUser().isAppAdmin`) | API Keys, Users, AI Usage, Disk Usage |

App admins see everything. `/settings` → `/settings/general`. Theme via `next-themes` (ThemeProvider in `Providers.tsx`, `attribute="class"`, `defaultTheme="system"`). i18n namespace: `settings-page`.

### Server Actions

`src/app/actions/index.ts` — auth-wrapped actions delegating to feature module queries/commands. Component-level actions co-located with components.

**Security (critical)**:
- **Never trust client-supplied `orgId`/`userId`** — always derive from session via `getOrgIdFromAuthOrThrow()`, `getOrgIdFromAuth()`, `getCurrentUserId()`
- Scope all user-data queries by `organization_id` (IDOR prevention) — `src/libs/db/tenant-scope-guard.ts` logs a warning if you forget on a covered model, but it doesn't block the query yet; don't rely on it instead of getting the `where` clause right
- `dangerouslySetInnerHTML` only with DOMPurify
- Never expose API keys via `NEXT_PUBLIC_`
- Use `crypto.timingSafeEqual()` for secret comparisons

## Path Aliases

```
@/*                    → src/*
@/temporal/*           → temporal/src/*
@ragenai/common-ui/*   → src/libs/common-ui/*
@ragenai/tui/*         → src/libs/tui/*
@ragenai/prisma-client → src/libs/db
```

## Key Conventions

- **Braces required**: always use braces for `if`/`else`/`for`/`while` — no single-line bodies. Enforced by ESLint `curly`.
- **ESM**: `"type": "module"` — all `.js` are ESM. CommonJS scripts use `.cjs`. `moduleResolution: "bundler"` — no deep internal imports (e.g. `langchain/dist/...`).
- Server components by default; client components mark with `'use client'`.
- All API routes use `export const dynamic = 'force-dynamic'`.
- Prisma IDs: `Int` autoincrement `id` (internal) + `publicId` UUID (external/URLs). Better Auth tables keep String IDs.
- All Prisma fields use camelCase with `@map('snake_case')` for DB columns.
- Timestamps use `Timestamptz`; default TZ Europe/Warsaw.
- i18n: `en`/`pl` via `next-intl`. Use `Link`/`redirect`/`usePathname`/`useRouter` from `@/i18n/routing` (NOT `next/link` or `next/navigation`).
- Tailwind v4 with `@theme` directive in `src/app/[locale]/global.css`. Brand colors: Ragen red `#cb1d3d`, Ragen blue `#252d53`.
- Error classes: `UnauthorizedException`, `NotFoundException`, `LimitExceededException`.
- Temporal workflows: reference by string name, not function import (workflow definition limitation).
- Logging: Pino w/ OpenTelemetry; webpack swaps server → client logger on client builds.
- Observability: OTel traces/metrics/logs via `src/instrumentation.ts` + `instrumentation-client.ts`. Auto-instrumentation covers HTTP, Postgres, Prisma and outgoing `fetch`/undici (LiteLLM, Qdrant, S3, ragen-vault, ragen-mcp). **All of it is a no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set** — spans are created but never exported. LLM tracing handled by LiteLLM → Langfuse (not ragen-app OTel). App-level Langfuse tracing (`@langfuse/tracing`) stays in `assistant-stream.ts`.
- Pre-commit: lint-staged runs `eslint --fix` + `prettier --write`. Commits follow conventional commits (commitlint via Husky).

## LiteLLM Proxy (Unified LLM Gateway)

All LLM calls (chat + embeddings) route through LiteLLM (OpenAI-compatible). Flow: ragen-app → `@ai-sdk/openai` → LiteLLM proxy → Scaleway/Azure/Bedrock/Vertex.

**Key files**: `litellm/config.yaml` (source of truth for models), `litellm/Dockerfile`, `src/libs/litellm/client.ts`, `src/libs/llm/chat-completion-factory.ts`, `src/libs/llm/embeddings-factory.ts`, `src/app/lib/services/llm.ts`, `src/app/lib/actions/checkAvailableProviders.ts`.

**Model list drifts — always check `litellm/config.yaml`.** Snapshot:
Only eight entries are uncommented today — the rest (including `gpt-5.4-nano`, `gpt-5.3-chat`, `claude-opus-4-6`, `claude-haiku-4-5`, `gemini-2.5-pro`, `cohere-rerank-v3-5` and `cohere-embed-multilingual-v3`) are commented out and will 404 at the proxy until re-enabled:

- Scaleway: `gpt-oss-120b`, `mistral-small-3.2`, `bge-multilingual-gemma2` (embeddings, 3584-dim), `qwen3-embedding-8b` (reranking)
- Azure: `gpt-5.4`
- Bedrock: `claude-sonnet-4-6`
- Vertex: `gemini-3-flash-preview`, `gemini-2.5-flash`

**Manage models** via LiteLLM UI at `http://localhost:4000/ui` (login `admin` / `LITELLM_MASTER_KEY`). Changes reflect in ragen-app via `/v1/models`.

**Env**:
- `LITELLM_PROXY_URL` (default `http://localhost:4000`)
- `LITELLM_MASTER_KEY` (dev: `sk-litellm-dev-key`)
- `DEFAULT_MODEL_PROVIDER=litellm`
- `DEFAULT_MODEL` (e.g. `gpt-5.4`)
- `REPHRASE_MODEL` (default `gemini-2.5-flash`, hardcoded in `initializeBasicRag.ts`)
- `EMBEDDING_MODEL` (default `bge-multilingual-gemma2`) — must match `VECTOR_SIZE` (3584 for this model, 1024 for `cohere-embed-multilingual-v3`); a mismatch makes Qdrant reject every upsert
- `RERANK_PROVIDER` / `RERANK_MODEL` — unset means Scaleway + `qwen3-embedding-8b`
- `FEATURE_FLAG_MULTI_QUERY`

**Langfuse tracing**: LiteLLM traces all LLM calls via `success_callback`/`failure_callback` in `config.yaml` (needs `LANGFUSE_*` env vars on the LiteLLM container). `@langfuse/otel` span processor was removed.

## Model Defaults

- **Chat**: `gpt-5.4` (LiteLLM → Azure OpenAI)
- **Rephrase / multi-query expansion**: `gemini-2.5-flash` — do not upgrade without explicit approval
- **Summary** (worker, ADR-16): `gemini-2.5-flash` — faster than `gpt-5.4-nano` for short outputs, strong Polish. Set via `SUMMARY_MODEL` in `ragen-worker/src/consts.ts`.
- Always verify against `litellm/config.yaml` (older docs mentioned `gpt-4o`/`gpt-4.1-nano` which are no longer provisioned).

## Per-Org Model Management

- `OrganizationSettings.allowedModels` (`String[]`, default `[]`) — empty = no restriction (back-compat)
- Filtered in `getAvailableModelsForOrganization()` (`src/app/lib/actions/checkAvailableProviders.ts`)
- Defaults in `Settings` table key `default_allowed_models`, applied to new orgs via `applyDefaultLimitsToOrg()`
- Admin UI: `apps/admin/src/app/(dashboard)/models/`
- Key functions in `src/features/organizations/services/organization-settings.ts`: `getAllowedModels()`, `saveAllowedModels()`, `getDefaultAllowedModels()`, `saveDefaultAllowedModels()`

## Testing Requirements

All new code must include tests. Vitest + React Testing Library (`jsdom`). Tests live next to code in `__tests__/` directories.

| File type | Tests required |
|---|---|
| Utility functions | Unit tests |
| Redux slices | Unit tests for all reducers |
| Zod schemas | Unit tests valid + invalid inputs |
| React components | Integration tests (render, interaction, state) |
| New screens/pages | At minimum a Playwright smoke test |

**Vitest conventions**:
- Wrap components in `<NextIntlClientProvider messages={...} locale="en">`
- Mock server actions (`vi.mock`) — never hit real APIs
- Mock externals (Stripe, Prisma, logger) that'd fail in jsdom
- Use `vi.hoisted()` for mock functions referenced in `vi.mock()` factories
- `ResizeObserver` polyfill for cmdk/Radix components
- `@testing-library/user-event` for interactions; `waitFor` for async
- Follow existing patterns in `src/store/__tests__/`, `src/app/lib/utils/__tests__/`

### E2E Tests (Playwright)

Live in `e2e/`, run against seeded local DB with pre-authenticated test user.

- `e2e/constants.ts` — test user/org IDs, credentials
- `e2e/helpers.ts` — `ROUTES`, `LABELS`, `login()`, `buildMockSSE()`
- `e2e/seed/e2e-seed.ts` — DB seeding (runs in `global.setup.ts`)
- `e2e/auth.setup.ts` — stores authenticated session to `.auth/user.json`
- `e2e/fixtures/` — upload test files

**Naming**: `{priority}-{##}-{name}.spec.ts` where priority is `smoke-01..06` (unauth), `smoke-07+` (auth), `p0-*` (critical), `p1-*` (high), `p2-*` (medium), `p3-*` (low/admin/edge cases).

**The prefix decides when CI runs it.** A PR into `dev` runs only `smoke-*` and `p0-*` (82 of 175 tests); the full suite runs on the `dev`→`main` PR, on push to `main`, and nightly on `dev`. So a `p1`–`p3` test will not gate the PR that breaks it — put anything that must block a merge in `smoke-*` or `p0-*`. Run everything locally with `npm run test:e2e`, or just the fast tier with `npx playwright test "(smoke|p0)-"`.

**Conventions**:
- All routes use `/pl` locale prefix (Polish UI in assertions)
- Import `ROUTES`/`LABELS` from `e2e/helpers.ts`
- Mock external APIs (S3, Temporal, LLM) via `page.route()` — never hit real backends
- `buildMockSSE()` for streaming chat
- Tests run sequentially (single worker, shared DB state)
- `getByTestId()` for interactive elements; regex for Polish text
- Timeouts: 10s visibility, 15s navigation/login

### Manual Regression Checklist

`docs/regression-checklist.md` — prioritized P0–P3 scenarios across auth, chat, KB, projects, connectors, settings, API. Use before releases.

## Post-Task Workflow

After modifying or creating files:

1. **Write tests first** — unit/integration tests for all new code (see Testing Requirements above).
2. **Run tests** — `npx vitest run`.
3. **Run code review** — `/coderabbit:review` before reporting completion.
4. **Log a lesson if you hit one** — if you made a nontrivial correction or found a non-obvious gotcha, add/update an entry in [`docs/lessons.md`](docs/lessons.md) (see that file's own instructions).
