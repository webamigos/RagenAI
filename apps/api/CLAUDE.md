# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run build        # Build (nest build)
npm run start:dev    # Dev server with watch mode
npm run lint         # ESLint with auto-fix
npm run format       # Prettier formatting
npm test             # Unit tests (Jest)
npm run test:e2e     # E2E tests (separate jest config in test/jest-e2e.json)
npx jest --testPathPattern='<pattern>' # Run a single test file
```

### Docker

```bash
docker build -t ragen-api .    # Multi-stage build (node:22-alpine)
# Production: node dist/main.js on port 3001
```

### CI

GitHub Actions (`.github/workflows/ci.yml`) runs lint → test → build on Node 22. All three must pass. Triggers on push/PR to `main`.

## Architecture

NestJS 11 API with `v1` global prefix, running on port 3001. Uses `nodenext` module resolution — all local imports must use `.js` extensions. Shares the same PostgreSQL database as ragen-app.

### Database (Prisma)

Uses Prisma with `@prisma/adapter-pg` (same pattern as ragen-app). **No local schema** — this app has no `prisma/` directory. The Prisma client is generated from the monorepo's single shared schema at `../../prisma/schema.prisma` via a second `generator apiClient` block in that file (output `../apps/api/src/generated/prisma`, gitignored). Running `prisma generate` at the repo root (already wired into the root `postinstall`) regenerates both ragen-app's and apps/api's clients from the same schema — see `docs/adrs/21-monorepo-and-api-decoupling.md`. Never add back a local `prisma/schema.prisma` here; edit the root schema instead.

`PrismaService` (`src/prisma/prisma.service.ts`) imports `PrismaClient` from the relative path `../generated/prisma/client.js`, not from `@prisma/client`. `nest-cli.json`'s `assets` config copies `src/generated/**/*` into `dist/generated` on build (tsc doesn't copy pre-built JS on its own). `apps/api/eslint.config.mjs` and root `.eslintignore` both exclude `src/generated` — it's large generated code, not linted.

`PrismaModule` is global — inject `PrismaService` and access `prismaService.client` for queries.

### Authentication & Guards

Three auth mechanisms, all using timing-safe comparison:
- **ApiKeyGuard** (`Authorization: Bearer` header) — for client-facing endpoints. Parses `keyId` from the opaque key (`sk-<keyId>.<secret>`), queries DB for `isActive`/org/project context, validates secret against Vault, and attaches `ApiContext` to the request. Updates `lastUsedAt` (fire-and-forget). Returns `403` for deactivated keys.
- **WorkerSecretGuard** (`x-worker-secret` header) — for internal worker-to-API calls (e.g., ai-usage reporting).
- **SessionAuthGuard** (`Authorization: Bearer` header, short-lived HMAC-signed token — NOT an API key or a Better Auth session cookie) — for server-to-server calls from ragen-app on behalf of an already session-authenticated user. `SessionAuthService.verify()` checks the HMAC signature (`SESSION_AUTH_SECRET`, shared with ragen-app) and a short expiry (payload has its own `exp`, issued with a ~30s TTL by ragen-app's `issueSessionToken()` in `src/libs/service-auth/`). apps/api never validates a Better Auth session/cookie itself and never issues these tokens — only ragen-app does, after it has already resolved the real session. Attaches `SessionAuthContext` (`userId`, `orgId`, optional `projectId`), accessed via `@GetSessionAuthContext()`. Not yet used by any route — added in Phase A of the decoupling plan (see ADR-21) to unblock Phase C; wire it into a controller alongside that phase's move, not before.

`ApiContext` (orgId, userId, projectId, keyId) is sourced from the **database record**, not from the key itself. Accessed via the `@GetApiContext()` parameter decorator.

### Key Cross-Cutting Concerns

- **ReplaceIdsInterceptor** (global) — rewrites `public_id` → `id` in responses and strips internal IDs (`id`, `organization_id`, `project_id`). All API responses go through this.
- **ApiExceptionFilter** (global) — catches all exceptions; returns structured JSON errors.
- **ThrottlerGuard** (global, via `@nestjs/throttler`) — per-IP rate limiting (20 req/min production, 30 req/min local). Healthcheck is excluded via `@SkipThrottle()`.
- **ValidationPipe** (global) — `whitelist: true, forbidNonWhitelisted: true, transform: true`.

### Modules

- **PrismaModule** (global) — `PrismaService` wrapping `PrismaClient` with `@prisma/adapter-pg`.
- **VaultModule** — `VaultClient` for secure token storage via HMAC-SHA256 signed HTTP requests to an external ragen-token-vault service.
- **CommonModule** (global) — `ApiKeysService`, `ApiKeyGuard`.
- **ChatModule** — Proxies chat requests to ragen-app's `/api/v1/chat` endpoint with SSE streaming support. Accepts `content`, `context`, and `stream` fields.
- **ThreadsModule** — CRUD for threads + nested messages sub-resource.
- **AssistantsModule** — Assistant CRUD.
- **HealthcheckModule** — Health check endpoint.
- **RagEngineModule** — anchor module for the ported (not yet wired into any controller) RAG engine — see "Ported RAG-engine libs" below.
- **AiUsageModule** (via RagEngineModule) — real, DB-backed (`AiUsageService.track()` writes to the `AiUsage` table). Not a controller; nothing currently calls it.

(`QueryModule` and a worker-facing `AiUsageModule` controller were previously listed here as TODO stubs — neither exists in `app.module.ts`. `DocumentsModule` is likewise not implemented; don't assume either without checking `app.module.ts`.)

### Ported RAG-engine libs (not yet wired up)

`src/llm/`, `src/litellm/`, `src/vector-store/`, `src/reranker/`, `src/ai-usage/`, `src/chains/` are ports of ragen-app's `src/libs/{llm,litellm,vector-store,reranker,chains}` (the `basic-rag` chain only — `conversation-chain` is not ported) and `src/features/ai-usage`, done as a deliberately safe, reversible intermediate step (Phase B, libs-only sub-scope) before actually cutting the chat/RAG engine over — see `docs/adrs/21-monorepo-and-api-decoupling.md`. **Nothing imports from them outside `RagEngineModule` yet** — ragen-app's own copies and `ChatModule`/`ChatCompletionsModule`'s proxy to ragen-app are still what's live.

`src/chains/` intentionally does NOT include ragen-app's `initializeBasicRag.ts` (the chain factory that resolves org settings, picks the vector store impl, and builds the vector-store access filter) or the `src/app/api/v1/{load-mcp-tools,check-api-limit,persist-api-thread,resolve-litellm-key,utils}.ts` orchestration helpers (MCP connector loading, rate limiting, thread persistence, LiteLLM key resolution) — those pull in `features/organizations`, `features/documents/services`, `libs/mcp`, `features/connectors`, which are out of scope for this slice. `basicRagChain()` here takes already-constructed `vectorStore`/`models`/`config` objects; nothing in this module resolves them from an org/project/request.

Notable adaptations from the ragen-app originals:
- ragen-app's shared `logger` (Pino, client/server-split) → a `new Logger(ClassName)` per file/class, NestJS-style.
- `trackAiUsage()` (a global function import in ragen-app) → an optional injected callback (`TrackAiUsage` type, `ai-usage/types.ts`) threaded through `TrackedEmbeddingsProvider`, both reranker functions, and now `chains/basic-rag/operations.ts`'s rephrase/expand/retrieval functions plus `chains/utils/common-operations/moderate-content.ts`, so those stay plain framework-agnostic classes/functions with no NestJS DI inside them. A real caller passes `aiUsageService.track.bind(aiUsageService)`.
- `model-registry.ts` (`llm/`) and `ai-pricing.ts` (`ai-usage/`) are **duplicated**, not shared — each has a comment marking it as such. Same treatment for `chains/types/thread-document.ts` (`ThreadDocumentUI`, duplicated from `features/documents/contracts/document.types.ts`) and `chains/moderation-instance.ts` (duplicated from `src/app/lib/services/llm.ts`'s `createModerationInstance`/`ModerationInstance`/`ModerationResult` exports only). Keep them in sync with ragen-app's copies by hand until a real shared package exists (see the ADR's 2026-08-30 update on why `packages/db`-style sharing doesn't trivially extend here).
- `chains/utils/thread-document-retriever.ts` (ported from ragen-app's `ThreadDocumentRetriever.ts`) dropped a dead `import db from '@ragenai/prisma-client'` present in the original — grep confirms it was never actually used in that file, so no NestJS/PrismaService DI was needed here (unlike `AiUsageService`, which genuinely writes to the DB).
- `chains/errors.ts` (top-level, not `chains/types/errors.ts` which only has the `ChainErrorCode` type) was missing from this slice's original file-list plan but is a real dependency of `chains/utils/chain-utils.ts` (`ModerationError`) — ported alongside the rest.
- `@qdrant/js-client-rest` and `meilisearch` are ESM-only from this project's `moduleResolution: nodenext` + CJS package.json's point of view, despite both actually shipping real CJS builds — their `qdrant-client.ts`/`meilisearch-client.ts` files use plain `require()` (not `import`) to get the constructor, with `// eslint-disable-next-line @typescript-eslint/no-require-imports` — this is a deliberate interop workaround, not a mistake; don't "fix" it back to a static `import`.

### Chat Proxy

`ChatModule` acts as a proxy to ragen-app's internal `/api/v1/chat` endpoint. The flow:
1. Client sends `POST /v1/chat` with `Authorization: Bearer` header
2. `ApiKeyGuard` parses `keyId`, queries DB (isActive, org, project), validates secret against vault
3. `ChatService` forwards the request to ragen-app with:
   - `x-internal-secret` — shared secret (`INTERNAL_API_SECRET`) for endpoint protection
   - `x-org-id`, `x-user-id`, `x-project-id` — context from DB lookup
4. ragen-app verifies the internal secret (timing-safe), then reads context headers
5. Supports both streaming (SSE) and non-streaming (JSON) responses
6. Handles client disconnection via `AbortController`

### Telemetry

OpenTelemetry (traces, metrics, logs) initialized in `src/instrument.ts` — must be the first import in `main.ts`. Only activates when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Use `withSpan()` from `src/telemetry/telemetry.ts` to instrument async operations.

### Type Safety

Branded types in `src/common/types/brand.ts` (`OrgId`, `UserId`, `ProjectId`, `KeyId`, `ApiKey`) prevent accidental mixing of ID types.

## Environment Variables

Key env vars (see `.env.example` for full list):
- `DATABASE_URL` — PostgreSQL connection (shared with ragen-app)
- `PORT` — HTTP port (default: 3001)
- `RAGEN_APP_INTERNAL_URL` — ragen-app URL for chat proxy (default: `http://localhost:3000`)
- `INTERNAL_API_SECRET` — shared secret for ragen-api → ragen-app calls (must match ragen-app)
- `RAGEN_TOKEN_VAULT_URL` — token vault URL (default: `http://localhost:3100`)
- `RAGEN_TOKEN_VAULT_SERVICE_SECRET` — HMAC secret for vault auth
- `WORKER_SECRET_KEY` — secret for internal worker calls
- `SESSION_AUTH_SECRET` — shared secret for verifying ragen-app-issued session tokens (SessionAuthGuard, must match ragen-app's `SESSION_AUTH_SECRET`)
- `TARGET_ENV` — `local` | `staging` | `production` (controls rate limits)

## Style

- Prettier: single quotes, trailing commas
- ESLint: `@typescript-eslint/no-explicit-any` is off; `no-floating-promises` and `no-unsafe-argument` are warnings
- DTOs use `class-validator` + `class-transformer` decorators
