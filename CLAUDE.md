# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
docker compose up        # Start local Postgres, Redis, Qdrant, Temporal, LiteLLM
npm run dev              # Start Next.js dev server
npm run build            # Production build (runs prisma generate first)
npm run lint             # ESLint
npm run test             # Vitest (unit tests, watch mode)
npx vitest run           # Vitest (single run, no watch)
npx vitest run path/to/file  # Run a single test file
npm run test:e2e         # Playwright E2E tests (requires separate DB, see below)
npm run test:e2e:ui      # Playwright in UI mode
npm run generate:types   # Regenerate Prisma client types (run after schema changes)
npm run db:seed          # Seed database (uses .env.local)
```

### Running E2E Tests Locally

E2E tests use a **separate database** to avoid corrupting your dev data.

**One-time setup:**

```bash
# 1. Create the e2e database
createdb ragen_e2e

# 2. Run migrations on it
DATABASE_URL="postgresql://postgres:pass123@localhost:5432/ragen_e2e" npx prisma migrate deploy

# 3. Create .env.e2e.local (overrides only what you need, .env.local provides the rest)
cat > .env.e2e.local << 'EOF'
DATABASE_URL="postgresql://postgres:pass123@localhost:5432/ragen_e2e"
DATABASE_DIRECT_URL="postgresql://postgres:pass123@localhost:5432/ragen_e2e"
EOF
```

**Running tests:**

```bash
# Build the app first (required — e2e runs against the production build)
npm run build

# Run e2e tests (picks up .env.e2e.local automatically via playwright.config.ts)
npm run test:e2e
```

After schema changes, re-run step 2 to apply new migrations to the e2e database. The `.env.e2e.local` file is gitignored.

**Mock LLM server:** If LiteLLM is not running on port 4000, the e2e global setup automatically starts a mock LLM server (`e2e/mock-llm-server.ts`) that returns canned responses. This allows chat thread tests to work without a real LLM. If you have LiteLLM running via `docker compose up`, the mock is skipped.

## Local Development

Requires Node.js 22.x. Start services with `docker compose up` (Postgres on 5432, Qdrant on 6333, Temporal on 7233, Temporal UI on 8080, LiteLLM on 4000, optional Redis on 6379, optional Meilisearch via `docker compose --profile meilisearch up`). Set `.env.local` with at minimum:

```
DATABASE_URL="postgresql://postgres:pass123@localhost:5432/smartrag"
DATABASE_DIRECT_URL="postgresql://postgres:pass123@localhost:5432/smartrag"
QDRANT_URL=http://localhost:6333
LITELLM_PROXY_URL=http://localhost:4000
LITELLM_MASTER_KEY=sk-litellm-dev-key
DEFAULT_MODEL_PROVIDER=litellm
DEFAULT_MODEL=gpt-5.4
```

## Architecture

**Stack**: Next.js 16 (App Router) + React 19 + TypeScript ~5.7 + Tailwind CSS 4 + PostgreSQL (Prisma 7) + Redis (optional, for rate limiting only) + Qdrant (hybrid dense+sparse vector search, default) + Temporal.io (async workflow orchestration) + LiteLLM (unified LLM proxy) + Cohere Rerank via Bedrock (post-retrieval reranking)

**What it does**: RAG (Retrieval Augmented Generation) AI chat application with unified LLM gateway (LiteLLM), document knowledge bases, and a public API.

### RAG Pipeline (retrieval quality stack)

Four composed improvements, all active by default. See ADRs 11, 12, 14, 15, 16 for the full decision history.

**Ingest flow** (in `ragen-worker`):

```mermaid
flowchart LR
    A[File upload] --> B[Parse<br/>PDF/DOCX/EPUB/…]
    B --> C[Chunk<br/>type-specific splitter]
    C --> D[Generate summary<br/>ADR-16]
    D --> E[Prepend summary chunk<br/>chunk_type: summary]
    E --> F[Hybrid embed<br/>Cohere dense + BM25 sparse<br/>ADR-14]
    F --> G[Upsert to Qdrant<br/>named vectors]
    F --> H[Merge UserFile.metadata.summary<br/>jsonb merge, best-effort]
```

**Retrieval flow** (in `ragen-app`, `src/libs/chains/basic-rag/`):

```mermaid
flowchart TD
    Q[User question] --> R[Rephrase → standalone question]
    R --> X[expandQueries<br/>ADR-15<br/>+2 alternative phrasings via LLM]
    X --> P["[standalone, variant1, variant2]"]
    P --> S1[Hybrid search<br/>q=standalone]
    P --> S2[Hybrid search<br/>q=variant1]
    P --> S3[Hybrid search<br/>q=variant2]
    S1 --> D1[Qdrant RRF fusion<br/>dense + sparse per query<br/>ADR-14]
    S2 --> D1
    S3 --> D1
    D1 --> U[Dedupe by content]
    U --> RR[Cohere Rerank v3.5<br/>ADR-12]
    RR --> G[Answer generation<br/>with citation prompting<br/>ADR-16]
```

**How the four improvements compose**:

| ADR | Pipeline stage | Problem it solves |
|-----|---------------|-------------------|
| **ADR-12** Cohere Rerank | After retrieval | Sharpens top-k by cross-encoder precision |
| **ADR-14** Hybrid search | At retrieval | Exact-term + morphological matches that dense alone misses |
| **ADR-15** Multi-query | Before retrieval | Vocabulary mismatch between user phrasing and document phrasing |
| **ADR-16** Summaries | At ingest | Per-document topic anchors that no flat chunk contains |

ADR-14/15/16 widen the candidate pool; ADR-12 sharpens it. All four are gated behind env flags that default to on.

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

The public API is served by **ragen-api** (separate NestJS service). ragen-app exposes internal API endpoints at `src/app/api/v1/` that are called by ragen-api, not by external clients directly.

**Internal endpoints** (called by ragen-api):
- `src/app/api/v1/chat/route.ts` — RAG chat endpoint. Protected by shared secret (`INTERNAL_API_SECRET` env var, verified via `x-internal-secret` header with timing-safe comparison). Context (`x-org-id`, `x-user-id`, `x-project-id`) is set by ragen-api after API key validation. Supports both streaming (SSE) and non-streaming (JSON) responses.

**API key format** (ADR-13): Opaque keys in `sk-<keyId>.<secret>` format. No organizational context is embedded in the key — context is resolved from the database by ragen-api at request time. Keys are stored in ragen-token-vault; only `maskedValue` is in the database.

**API key management**: Managed via settings UI (`src/app/[locale]/(panel)/settings/api-keys/`). Org admins can create, delete, and toggle (activate/deactivate) keys. The `ApiKey` model stores `maskedValue` for display, `isActive` for toggling, and `lastUsedAt` for usage tracking.

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
- `vector-store/` — Vector store clients (Qdrant, Meilisearch, Supabase) implementing `VectorStoreClient` interface
- `reranker/` — Cohere Rerank v3.5 via AWS Bedrock for post-retrieval document reranking
- `document-loaders/` — PDF, EPUB, DOCX, Markdown, SRT, CSV, XLSX, Image, URL parsing
- `db/` — Prisma client singleton (aliased as `@ragenai/prisma-client`)
- `temporal/` — Temporal.io client for async document processing workflows
- `payments/` — Stripe integration
- `mcp/` — MCP (Model Context Protocol) client for connecting to external tool servers via `@ai-sdk/mcp`
- `ragen-vault/` — HTTP client for the Ragen Token Vault (HMAC-SHA256 signed requests, lazy-initialized singleton)
- `sse/` — Server-Sent Events for streaming
- `tui/` — Tailwind UI component library (aliased as `@ragenai/tui`)
- `common-ui/` — Shared UI utilities (aliased as `@ragenai/common-ui`)

### Knowledge Base (Folders, Sharing & Access Control)

The Knowledge Base supports **nested folders**, **per-user file ownership**, and **sharing with users/teams**.

**Data model:**
- `DocumentFolder`: `Int` autoincrement `id` + `publicId` UUID (like Project/ApiKey pattern). Self-referential tree via `parentId` + materialized `path` column (e.g., `/1/5/12/`). Optional `teamId` and `ownerId`.
- `UserFile`: Has `ownerId` (nullable for legacy org-wide files) and `folderId` (Int FK to DocumentFolder).
- `DocumentPermission`: Grants access to files or folders for specific users or teams. Uses optional FK columns (`filePublicId` → UserFile, `folderId` → DocumentFolder) instead of polymorphic resourceId. Permission levels: `'view'` or `'full'`.

**Access model:**
| Scenario | Visible to |
|----------|-----------|
| File with `ownerId = null` | All org members (legacy/org-wide) |
| File with `ownerId = userA` | Owner + org admins + explicit shares |
| File in folder with `teamId` | Team members + org admins |
| `DocumentPermission` for user/team | That user/team members |
| Folder permission | Cascades to children via `path LIKE` |

**UI views:**
- "All Files" — org-wide + owned + team-accessible files, with folder tree navigation
- "My Files" — files/folders owned by current user
- "Shared with me" — only files with explicit `DocumentPermission` for user/teams

**Vector store access filtering:**
- Each document chunk has `metadata.accessible_by: string[]` with principals like `"org:<orgId>"`, `"user:<userId>"`, `"team:<teamId>"`
- RAG queries add `metadata.accessible_by` filter for non-admin users
- Org admins bypass access filtering (see all org documents)
- Filter built in `src/app/api/threads/services/initializeBasicRag.ts`

**Key files:**
- Schema: `prisma/schema.prisma` (DocumentFolder, DocumentPermission, UserFile.ownerId)
- Types: `src/features/documents/contracts/document.types.ts`, `permission.types.ts`
- Folder commands: `src/features/documents/services/commands/` (create/delete/update/move-folder, move-file-to-folder)
- Permission commands: `share-resource-command.ts`, `revoke-share-command.ts`
- Access queries: `get-user-files-query.ts` (supports viewMode: all/my-files/shared-with-me), `get-all-org-files-query.ts`
- Folder tree: `src/features/documents/utils/folder-tree.ts` (`buildFolderTree()` utility)
- Server actions: `src/app/actions/folders.ts`, `src/app/actions/permissions.ts`
- Vector permissions: `src/features/documents/services/commands/sync-vector-permissions-command.ts`
- Backfill script: `src/scripts/backfill-accessible-by.ts`
- UI: `src/app/components/ManageKnowledge/Folders/FoldersList.tsx`, `Breadcrumbs.tsx`, `MoveDialog.tsx`, `ShareDialog.tsx`
- Page: `src/app/[locale]/(panel)/knowledge/documents-list/DocumentsListContent.tsx`

**Upload with folder context:** The `/api/upload` route accepts an optional `folderId` in FormData. Files are created with `folderId` and `ownerId` set. The documents-list page has inline upload (button + drag & drop) that passes the current folder context.

### Document Processing Pipeline

Upload → S3 → Temporal worker (separate `ragen-worker` repo) → Parse → Generate embeddings → Store in Qdrant. Status tracked via `ParsingStatus`/`EmbeddingStatus` enums in Prisma.

**Supported file types** (`FileType` enum): `PDF`, `EPUB`, `DOCX`, `SRT`, `TEXT`, `MARKDOWN`, `URL`, `IMAGE`, `CSV`, `XLSX`

**File type handling:**
- **PDF**: Worker processes via Claude native PDF (sends entire PDF as base64 to Claude in single API call). Configurable via `PDF_PROCESSOR` env var (`claude` default, `vision` for legacy PDFium + page-by-page vision pipeline). `PDF_MODEL` defaults to `claude-haiku-4-5`. In chat, attached as binary data URL.
- **EPUB**: Binary file, uploaded to KB for worker text extraction. In chat, attached as binary data URL.
- **DOCX**: Text extracted via `mammoth` package. In chat, extracted client-side; in KB, extracted by worker. 
- **Image** (jpg, png, webp, gif): In chat, attached as base64 data URLs and sent as multimodal content to vision LLMs with thumbnail preview + lightbox. In KB, described via vision LLM and embedded for RAG retrieval.
- **CSV**: Read as plain text for both chat attachment and KB embedding. 5MB limit in chat.
- **XLSX/XLS**: Converted to CSV via SheetJS (`xlsx` package) client-side for chat; worker uses SheetJS for KB processing.
- **SRT**: Subtitle files read as text. Worker uses LLM to process into meaningful segments for embedding.
- **Markdown/TXT**: Read as plain text directly.

### Thread Message Encryption

Message content (`Message.content`) is encrypted at rest using **AWS KMS envelope encryption** (AES-256-GCM). Thread titles remain unencrypted to preserve search functionality.

**How it works:**
- Each thread gets a unique Data Encryption Key (DEK) generated via KMS `GenerateDataKey`
- DEK is encrypted by KMS (Key Encryption Key) and stored as `Thread.encryptedDek` (base64)
- `Message.content` is encrypted with the plaintext DEK before DB insert
- On read, encrypted DEK is decrypted via KMS, then messages are decrypted locally
- DEK cache (per-request) minimizes KMS calls when reading multiple messages from one thread

**Environment gating:**
- No `AWS_KMS_KEY_ID` env var → encryption disabled (local development stays plaintext)
- Staging/production: set `AWS_KMS_KEY_ID=arn:aws:kms:region:account:key/key-id`
- Uses same AWS credentials as S3 (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`)

**Key files:**
- `src/libs/crypto/thread-encryption.ts` — Core encrypt/decrypt functions, KMS key generation
- `src/libs/crypto/decrypt-messages.ts` — Generic helper to decrypt message arrays
- `src/features/messages/services/commands/create-message-command.ts` — Encrypts on write (race-safe via conditional update)
- `src/features/threads/services/commands/encrypt-threads-command.ts` — Batch migration for existing threads
- `src/app/actions/encrypt-threads.ts` — Admin server actions for migration

**Langfuse:** When encryption is enabled, `input` and `output` are omitted from Langfuse traces (only tags, sessionId, model are sent).

**Search trade-off:** Thread title search works normally. Message content search (`searchAllQuery`) skips content matching for encrypted threads — only title matches are returned.

**Admin migration:** `encryptAllThreadsAction()` (app admin only) batch-encrypts all unencrypted threads across all organizations. Idempotent and resumable.

### Vector Store (Qdrant, Hybrid Search)

Qdrant is the default vector database for RAG document retrieval. Collections use **hybrid named vectors** (dense + sparse, ADR-14) with **Reciprocal Rank Fusion** at query time. Meilisearch and Supabase are supported as legacy backends via the `Organization.vectorStore` column (dense-only).

**Collection schema (Qdrant)**:

```
vectors:
  dense:  { size: 1024, distance: Cosine }   # Cohere embed-multilingual-v3
sparse_vectors:
  sparse: { modifier: idf }                  # Qdrant computes IDF server-side, BM25-style
```

**Key files:**
- Interface: `src/libs/vector-store/types.ts` — `VectorStoreClient` with `similaritySearch()`, `addDocuments()`, optional `deleteDocuments()`
- Qdrant client: `src/libs/vector-store/qdrant-client.ts` — named dense+sparse vectors, RRF fusion via Query API `prefetch`
- BM25 encoder: `src/libs/vector-store/bm25-encoder.ts` — pure-TS unicode-aware tokenizer + FNV-1a hashing, produces `{ indices, values }` sparse vectors. Mirror lives in `ragen-worker/src/services/bm25-encoder.ts`
- Meilisearch client: `src/libs/vector-store/meilisearch-client.ts` — legacy dense-only
- Supabase client: `src/libs/vector-store/supabase-client.ts` — legacy pgvector backend (dense-only)

**How the query works:**

```mermaid
flowchart LR
    Q[Query text] --> D[Dense embed<br/>Cohere multilingual]
    Q --> S[Sparse encode<br/>BM25 tokens<br/>pure TS]
    D --> P[Qdrant Query API]
    S --> P
    P --> RRF[Server-side<br/>RRF fusion]
    RRF --> K[top-k fused]
    K --> C[Cohere Rerank<br/>ADR-12]
```

The client issues a single request with two prefetch branches and `fusion: 'rrf'`; Qdrant fuses server-side. Falls back to dense-only when the query has no tokenizable content (e.g., `"42 !!"`). `PREFETCH_MULTIPLIER = 4` per branch over-fetches before fusion.

**Configuration:**
- Organization collection: each org gets its own Qdrant collection (named by org ID)
- Embeddings (dense): Cohere `cohere-embed-multilingual-v3` via LiteLLM proxy (1024 dimensions, Cosine distance)
- Sparse: pure-TS BM25 encoder, Qdrant `modifier: idf` handles server-side BM25 scoring
- Payload indexes: `metadata.project_id`, `metadata.project_public_id`, `metadata.file_id`, `metadata.organization_id`, `metadata.accessible_by`
- `metadata.chunk_type: 'summary'` marks the synthetic summary chunks written by ADR-16; no filter routing needed, they participate in the same hybrid retrieval as body chunks
- Access control: `metadata.accessible_by` array contains principals (`org:<id>`, `user:<id>`, `team:<id>`) — filtered at query time for non-admin users
- Filter format: intermediate format (`{ must: [...], should: [...] }`) used across the codebase — each client converts internally
- Env vars: `QDRANT_URL` (default `http://localhost:6333`), `QDRANT_API_KEY` (optional for local dev)

**Multi-backend selection** (`Organization.vectorStore` column):
- `null` or `'qdrant'` → Qdrant (default, hybrid dense+sparse)
- `'meilisearch'` → Meilisearch (legacy, dense-only)
- `'supabase'` → Supabase pgvector (legacy, dense-only)

**Schema-breaking note**: hybrid collections use named vectors. Pre-ADR-14 collections (unnamed single vector) are not compatible — the vector store was wiped before rollout. Any re-rollout that needs to preserve data would require a reindex.

### Query-Side: Multi-Query Expansion (ADR-15)

Before retrieval, the standalone question is expanded into N-1 alternative phrasings via a single `generateObject` call using `REPHRASE_MODEL`. The **original standalone question is always included as the first query**, so behavior never regresses below single-query. All queries are submitted in parallel to Qdrant, results are deduplicated by content string, and the unified pool feeds the reranker.

- Code: `expandQueries()` and updated `retrieveRelevantDocuments()` in `src/libs/chains/basic-rag/operations.ts`
- Config: `MULTI_QUERY_VARIANT_COUNT = 2` (→ 3 total queries per turn)
- Feature flag: `FEATURE_FLAG_MULTI_QUERY` (default on; set to `0` or `false` to disable)
- Graceful fallback: LLM error, invalid structured output, or empty variants all fall back to single-query
- Per-query retrieval count is divided across queries so the pre-dedupe pool stays roughly the same as single-query — reranker input stays bounded

### Ingest-Side: Document Summaries (ADR-16)

Lives in `ragen-worker` (see worker's own docs for details). At ingest, after parsing and chunking, a 1-2 paragraph summary is generated via `SUMMARY_MODEL` (default `gpt-5.4-nano`). The summary is:

1. **Prepended as a synthetic chunk** with `metadata.chunk_type: 'summary'` — participates in hybrid retrieval alongside body chunks
2. **Merged into `UserFile.metadata.summary`** — for UI previews and future summary-first retrieval paths

Best-effort at every layer: feature flag off / LLM error / Temporal failure / DB error all degrade to "no summary" without affecting ingest success. Feature flag: `FEATURE_FLAG_DOC_SUMMARIES` (default on). The ragen-app side needs no retrieval changes — summary chunks show up naturally; only the answer prompt was updated with a light citation rule (`src/libs/chains/basic-rag/config.ts`).

### Post-Retrieval Reranking (ADR-12)

Cohere Rerank v3.5 via AWS Bedrock improves retrieval quality as the final sharpening step over the fused + deduplicated pool:
- Over-retrieves 3x candidates (in addition to the fan-out from multi-query), then reranks to top-k using Cohere cross-encoder
- Particularly effective for Polish and multilingual content
- Gracefully disabled when AWS credentials are not set (local dev without Bedrock)
- Falls back to original vector search results on Bedrock errors
- Key files: `src/libs/reranker/bedrock-cohere-reranker.ts`, integrated in `src/libs/chains/basic-rag/operations.ts`
- Env vars: `RERANK_MODEL` (default `cohere.rerank-v3-5:0`), uses existing `AWS_*` credentials

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
- Prisma schema uses `Int` autoincrement for most model IDs + `publicId` (UUID) for external/URL exposure. Better Auth tables (User, Organization, Member, etc.) keep String IDs. Pattern: `id` (Int, internal) + `publicId` (UUID, external/URLs).
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

**Configured models** (in `litellm/config.yaml` — this is the source of truth, check it directly as this list drifts):
- Azure OpenAI: `gpt-5.4`, `gpt-5.4-nano`, `gpt-5.3-chat`
- AWS Bedrock: `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-haiku-4-5`
- Google Vertex AI: `gemini-3-flash-preview`, `gemini-2.5-flash`
- Reranker: `cohere-rerank-v3-5` (Bedrock, used by ADR-12)
- Embeddings: `cohere-embed-multilingual-v3` (Bedrock, 1024-dim, used for dense vectors in hybrid search)

**Model management**: Add/remove models via LiteLLM UI (`http://localhost:4000/ui`, login: `admin` / `LITELLM_MASTER_KEY`). Changes are reflected in ragen-app automatically via `/v1/models` endpoint.

**Env vars**:
- `LITELLM_PROXY_URL` — proxy URL (default: `http://localhost:4000`)
- `LITELLM_MASTER_KEY` — API key for proxy auth (default for local dev: `sk-litellm-dev-key`)
- `DEFAULT_MODEL_PROVIDER` — must be `litellm`
- `DEFAULT_MODEL` — model name matching `litellm/config.yaml` (e.g., `gpt-5.4`)
- `REPHRASE_MODEL` — cheap/fast model for question rephrasing and multi-query expansion, default `gemini-2.5-flash` (hardcoded in `src/app/api/threads/services/initializeBasicRag.ts`)
- `EMBEDDING_MODEL` — embedding model name (default: `cohere-embed-multilingual-v3`)
- `FEATURE_FLAG_MULTI_QUERY` — enable/disable multi-query expansion (ADR-15, default on; set to `0` or `false` to disable)

**Langfuse tracing**: LiteLLM automatically traces all LLM calls (chat + embeddings) to Langfuse via `success_callback` / `failure_callback` in `config.yaml`. Set `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` env vars on the LiteLLM container. App-level tracing (thread context, user messages, tags) is still handled by `@langfuse/tracing` in `assistant-stream.ts`. The OTel-based `@langfuse/otel` span processor was removed — LiteLLM replaces it.

**Railway deployment**: `litellm/Dockerfile` bakes `config.yaml` into the image. Set provider credentials (`AZURE_API_KEY`, `AWS_ACCESS_KEY_ID`, `VERTEX_CREDENTIALS`, `LANGFUSE_*`, etc.) as Railway env vars. Use Railway managed Postgres for `LITELLM_DATABASE_URL`.

## Model Defaults

- **Default chat model**: `gpt-5.4` (via LiteLLM → Azure OpenAI)
- **Rephrase / multi-query expansion model**: `gemini-2.5-flash` — cheap/fast model used for standalone question rephrasing and for the expansion step in ADR-15 multi-query. Do not upgrade without explicit approval.
- **Summary model** (worker-side, ADR-16): `gpt-5.4-nano` — smallest Azure model available, set via `SUMMARY_MODEL` in `ragen-worker/src/consts.ts`. See ADR-16 for rationale.
- Always verify against `litellm/config.yaml` — previously the code documented `gpt-4o` / `gpt-4.1-nano` which are no longer provisioned.

## Per-Organization Model Management

- `OrganizationSettings.allowedModels` (`String[]`, default `[]`) controls which models an org can use
- Empty `[]` = no restriction (backward compatible)
- Filtered in `getAvailableModelsForOrganization()` (`src/app/lib/actions/checkAvailableProviders.ts`)
- Default allowed models stored in `Settings` table (key `default_allowed_models`) — applied to new orgs via `applyDefaultLimitsToOrg()`
- Admin UI: `apps/admin/src/app/(dashboard)/models/` (follows same pattern as Limits page)
- Key functions: `getAllowedModels()`, `saveAllowedModels()`, `getDefaultAllowedModels()`, `saveDefaultAllowedModels()` in `src/features/organizations/services/organization-settings.ts`

## Testing Requirements

All new code must include tests. Use Vitest + React Testing Library (`jsdom` environment). Test files live next to the code they test in `__tests__/` directories.

**Required tests by file type:**

| File type | Tests required | Example |
|-----------|---------------|---------|
| **Utility functions** (pure JS/TS) | Unit tests | `src/app/lib/utils/__tests__/fileValidation.test.ts` |
| **Redux slices** | Unit tests for all reducers | `src/store/__tests__/threadsSlice.test.ts` |
| **Zod schemas / validators** | Unit tests for valid/invalid inputs | `src/features/messages/contracts/__tests__/message.types.test.ts` |
| **React components** | Integration tests (render, interaction, state) | `src/app/components/__tests__/KnowledgeBasePickerDialog.test.tsx` |
| **Complex components** | Unit tests for logic + integration for UI | `src/app/components/Assistant/PromptForm/__tests__/PromptForm.test.tsx` |
| **New screens / pages** | At minimum E2E smoke test (Playwright) | `npm run test:e2e` |

**Unit test conventions (Vitest):**
- Wrap components with `<NextIntlClientProvider messages={...} locale="en">` for i18n
- Mock server actions (`vi.mock`) — never call real APIs in tests
- Mock external modules (Stripe, Prisma, logger) that would fail in jsdom
- Use `vi.hoisted()` for mock functions referenced inside `vi.mock()` factories
- Add `ResizeObserver` polyfill when testing cmdk/Radix components
- Use `@testing-library/user-event` for realistic user interactions
- Use `waitFor` for async state changes
- Follow existing patterns in `src/store/__tests__/`, `src/app/lib/utils/__tests__/`

### E2E Tests (Playwright)

E2E tests live in `e2e/` and run against a seeded local database with a pre-authenticated test user.

**Structure:**
- `e2e/constants.ts` — Test user/org IDs, credentials
- `e2e/helpers.ts` — `ROUTES`, `LABELS`, `login()`, `buildMockSSE()` helpers
- `e2e/seed/e2e-seed.ts` — Database seeding (runs in `global.setup.ts`)
- `e2e/fixtures/` — Test files for upload tests
- `e2e/auth.setup.ts` — Stores authenticated session to `.auth/user.json`

**Naming:** Files use `{priority}-{##}-{name}.spec.ts` format with priority prefixes:
- `smoke-0[1-6]-*` — Unauthenticated smoke tests (no-auth Playwright project)
- `smoke-{07+}-*` — Authenticated smoke tests (smoke-auth project, runs before p0-p3)
- `p0-*` — P0 Critical tests (core flows: auth, chat, KB, projects)
- `p1-*` — P1 High-priority tests (thread mgmt, org members, public access, connectors)
- `p2-*` — P2 Medium-priority tests (settings, subscription, documents, teams)

**Conventions:**
- All routes use `/pl` locale prefix (Polish UI text in assertions)
- Import `ROUTES` and `LABELS` from `e2e/helpers.ts`
- Mock external APIs (S3, Temporal, LLM) via `page.route()` — never depend on real backends
- Use `buildMockSSE()` to mock streaming chat responses
- Tests run sequentially with a single worker (shared DB state)
- Use `getByTestId()` for interactive elements, regex patterns for Polish text
- Timeouts: 10s for visibility checks, 15s for navigation/login

**Key test files:**
- `smoke-01..06` — Auth smoke tests (sign-in, sign-up, sign-out, validation, redirects)
- `smoke-07` — Authenticated page smoke tests (all pages load)
- `smoke-10..12` — Feature smoke tests (file upload, project upload, org switcher)
- `p0-13` — Auth session persistence
- `p0-20` — Chat & threads (create, send message, history, rename, delete)
- `p0-21` — Knowledge base (multi-upload, delete, add from URL)
- `p0-22` — Projects (create, instructions, navigation)
- `p1-30` — Thread management (star, search)
- `p1-31` — Organization members (invite, roles)
- `p1-32` — Public/shared access (share dialog, public chat, thread sharing)
- `p1-33` — Connectors (list, connect, OAuth, API key)
- `p2-40` — Settings (theme, profile, password, language)
- `p2-41` — Subscription (plan details, cancel dialog)
- `p2-42` — Document operations (create, edit/preview, list actions)
- `p2-43` — Teams (create, select, delete)
- `p3-50` — Admin functions (users CRUD, AI usage, disk usage)
- `p3-51` — Edge cases (upload validation, form errors, auth guards)
- `p3-52` — i18n (PL/EN rendering, locale switching)
- `p3-53` — API regression (healthcheck, auth enforcement, error responses)

### Manual Regression Checklist

A prioritized manual regression checklist is maintained at `docs/regression-checklist.md`. It covers P0 (critical), P1 (high), P2 (medium), and P3 (low/admin) scenarios across auth, chat, knowledge base, projects, connectors, settings, and API. Use it before releases to verify core functionality that isn't fully covered by automated tests.

## Post-Task Workflow

After completing any coding task that modifies or creates files:

1. **Write tests first** — Add unit/integration tests for all new code before proceeding to review. Follow the testing conventions in the "Testing Requirements" section above.
2. **Run tests** — Execute `npx vitest run` to verify all tests pass.
3. **Run code review** — Run `/coderabbit:review` to review the changes before reporting completion to the user.
