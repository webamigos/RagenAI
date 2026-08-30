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
- **ChatModule** — Direct implementation (as of the Phase B cutover, not a proxy) — see "Chat" below. `ChatCompletionsModule` still proxies to ragen-app's `/api/v1/chat/completions`.
- **ThreadsModule** — CRUD for threads + nested messages sub-resource.
- **AssistantsModule** — Assistant CRUD.
- **HealthcheckModule** — Health check endpoint.
- **RagEngineModule** — anchor module for the ported RAG engine — see "Ported RAG-engine libs" below. As of the Phase B cutover, `ChatModule` imports this for real (`/v1/chat`) — it's no longer "not yet wired into any controller."
- **AiUsageModule** (via RagEngineModule) — real, DB-backed (`AiUsageService.track()` writes to the `AiUsage` table). Called from `ChatService` (usage tracking) and threaded into the RAG chain as `trackAiUsage`.
- **OrganizationsModule**, **DocumentsModule**, **TeamsModule**, **ApiLimitsModule**, **ChainsModule** (all via RagEngineModule) — real, DB-backed config/settings-resolution services (org settings, LiteLLM key resolution, API rate limits, the `initializeBasicRag` chain factory). `ChatService` calls `ApiLimitsService`/`OrganizationSettingsService`/`ResolveLiteLLMKeyService`/`InitializeBasicRagService` directly.
- **ConnectorsModule**, **ProjectsModule**, **SecurityModule**, **McpModule** (all via RagEngineModule) — real, DB-backed MCP connector/tool-loading services. `ChatService` calls `LoadMcpToolsService.loadMcpToolsForApiRequest()` directly.
- **ThreadsModule** gained **`PersistApiThreadService`** (`createApiThread`, ported from ragen-app's `persist-api-thread.ts`) — real, DB-backed, uses `src/crypto/thread-encryption.ts` for optional per-thread KMS envelope encryption. Registered as a provider in the *existing* `ThreadsModule` (not `RagEngineModule` — that module already exists with a real, wired `ThreadsController`; this is additive, nothing else in it changed). `ChatService` imports `ThreadsModule` directly (not re-exported via `RagEngineModule`) and calls it when `context.debugMode` is true.

- **NotificationsModule** — Phase C's first slice (see docs/adrs/21-monorepo-and-api-decoupling.md). `NotificationsService` (`create`/`markAllAsRead`/`markAsRead`/`getNotifications`), ported from ragen-app's `src/features/notifications/services/{commands,queries}/*.ts`. Real, DB-backed. No controller yet — same unwired-first pattern as Phase B's slices, `AppModule` imports it directly (not nested under `RagEngineModule`, which is scoped to the RAG/chat engine specifically).
- **MessagesModule** — Phase C's second slice. `MessagesService` (`createMessageInDb`/`createAndStoreMessage`/`deleteMessage`/`rateMessage`/`regenerateAssistantMessage`/`updateMessagePlayed`/`getThreadMessages`/`getNegativeQa`), ported from ragen-app's `src/features/messages/services/{commands,queries}/*.ts`. Real, DB-backed, uses `src/crypto/thread-encryption.ts` (write) and the newly-ported `src/crypto/decrypt-messages.ts` (read) for per-thread KMS envelope encryption. `getOrgIdFromAuthOrThrow()`/`getOrgIdFromAuth()` (ragen-app's session-cookie auth helpers) replaced with an explicit `orgId` parameter on every method that needed them. **Not ported**: `send-message-command.ts` (needs `threads`' `findOrCreateThreadCommand` — deferred to the `threads` slice, last in Phase C's ordering). No controller yet, same unwired pattern, `AppModule` imports it directly.

(`QueryModule` and a worker-facing `AiUsageModule` controller were previously listed here as TODO stubs — neither exists in `app.module.ts`.)

### Ported RAG-engine libs

`src/llm/`, `src/litellm/`, `src/vector-store/`, `src/reranker/`, `src/ai-usage/`, `src/chains/`, `src/organizations/`, `src/teams/`, `src/documents/`, `src/api-limits/`, `src/mcp/`, `src/ragen-vault/`, `src/security/`, `src/connectors/`, `src/projects/`, `src/crypto/`, and `ThreadsModule`'s `PersistApiThreadService` are ports of ragen-app's `src/libs/{llm,litellm,vector-store,reranker,chains,mcp,ragen-vault,security,crypto}` (the `basic-rag` chain only — `conversation-chain` is not ported), `src/features/{ai-usage,security,connectors,projects}` (query/command closures only, not full feature modules), `src/app/api/threads/services/initializeBasicRag.ts`, `src/app/api/threads/services/decode-dual-content-chunks.ts`, and `src/app/api/v1/{check-api-limit,resolve-litellm-key,load-mcp-tools,persist-api-thread}.ts` (plus their `features/organizations`/`features/teams`/`features/documents` closures) — see `docs/adrs/21-monorepo-and-api-decoupling.md`.

**As of the Phase B cutover, `RagEngineModule` and `ThreadsModule` ARE wired into a real controller** — `ChatModule` → `ChatService` calls into them directly to serve `POST /v1/chat`. ragen-app's own copies of all this still exist too (untouched); this is a from-scratch reimplementation, not a move. `ChatCompletionsModule`'s proxy to ragen-app is still what's live for `/v1/chat/completions` — that cutover is separate, not-yet-done follow-up work, same for `FilesModule`'s upload/remove.

**Still NOT ported** (out of scope for this whole Phase-B libs-only track): `src/app/api/v1/utils.ts` (`verifyInternalSecret`/`extractInternalContext` — the old proxy-auth mechanism, gets deleted at cutover, not ported); `src/libs/crypto/decrypt-messages.ts` (the read-side of message decryption — nothing ported so far needs it, since `persist-api-thread.ts` only ever writes); `src/libs/crypto/decrypt-documents.ts` and `public-link-token.ts` (unrelated crypto utilities).

`src/crypto/scaleway-kms.ts` is a port of ragen-app's *separate* `src/libs/encryption/scaleway-kms.ts` (a sibling of `libs/crypto/`, not inside it) — landed under `apps/api/src/crypto/` here since it exists solely to back `crypto/key-provider/scaleway-provider.ts` and nothing else in apps/api needs it yet.

**KNOWN GAP (security-event.service.ts)**: the original `recordSecurityEvent` dispatches an email alert (React Email + Resend, via ragen-app's `src/app/emails/services/mailer`) when the resolved severity meets the alert threshold. That mailer subsystem is Next.js-specific and out of scope for this slice — `SecurityEventService.record()` inserts the row, mirrors to the logger, and runs burst-escalation, but never sends an email. Fine while unwired; whoever wires this up for real should either port the mailer alongside it or explicitly decide alerting stays ragen-app-only. See the class-level comment in `security/security-event.service.ts`.

`src/mcp/client.ts`'s `wrapToolsForConnector`/`createMcpToolsFromConnectors` take an optional `recordSecurityEvent` callback (same injected-callback pattern as `trackAiUsage`) instead of importing `recordSecurityEvent` globally — a real caller passes `securityEventService.record.bind(securityEventService)` (see `mcp/load-mcp-tools.service.ts`).

`organizations/organization-settings.service.ts` gained two more methods in this slice — `getAllowedConnectors`/`getDefaultAllowedConnectors` — same narrow-extraction treatment as the rest of that file (see below).

`organizations/organization-settings.service.ts` is a narrow extraction, not a 1:1 port, of ragen-app's 900+ line `organization-settings.ts` grab-bag — it carries only `getUsageLimits`/`getRagPipelineSettings`/`getAllSettings`/`getLiteLLMOrgApiKey` and their shared private `getSettings()` helper. Do not add unrelated org-settings exports (allowed-models/connectors/templates management, LiteLLM team provisioning, PII DEK management) here — port them into their own slice if/when something in apps/api actually needs them.

**RESOLVED at cutover time**: `chains/basic-rag/initialize-basic-rag.service.ts` now wraps its vector store with `chains/basic-rag/dual-content-decode.ts` (`wrapVectorStoreWithDualContentDecode`, ported from ragen-app's `decode-dual-content-chunks.ts`) — the opt-in, default-off `piiIngestionMode: 'dual_content'` org setting gets real decrypted content again, not masked `pageContent`. Needed a new `OrganizationSettingsService.getOrCreatePiiDek()` (race-safe per-org DEK init, same pattern as `PersistApiThreadService`'s per-thread DEK) — not in this file's original narrow-extraction closure, added specifically to close this gap. `getOrCreatePiiDek` is injected into the decode wrapper as a callback, same pattern as `trackAiUsage`/`recordSecurityEvent`.

Notable adaptations from the ragen-app originals:
- ragen-app's shared `logger` (Pino, client/server-split) → a `new Logger(ClassName)` per file/class, NestJS-style.
- `trackAiUsage()` (a global function import in ragen-app) → an optional injected callback (`TrackAiUsage` type, `ai-usage/types.ts`) threaded through `TrackedEmbeddingsProvider`, both reranker functions, `chains/basic-rag/operations.ts`'s rephrase/expand/retrieval functions, `chains/utils/common-operations/moderate-content.ts`, and now `chains/basic-rag/initialize-basic-rag.service.ts`, so those stay plain framework-agnostic classes/functions with no NestJS DI inside them. A real caller passes `aiUsageService.track.bind(aiUsageService)`.
- `model-registry.ts` (`llm/`) and `ai-pricing.ts` (`ai-usage/`) are **duplicated**, not shared — each has a comment marking it as such. Same treatment for `chains/types/thread-document.ts` (`ThreadDocumentUI`), `chains/moderation-instance.ts`, `organizations/types.ts` (settings-related contract types), `organizations/constants.ts` (the two org-setting defaults this slice needs), and `organizations/hash-api-key.ts` (AES encrypt/decrypt for provider API keys — NOT the KMS thread-message subsystem). Keep them in sync with ragen-app's copies by hand until a real shared package exists (see the ADR's 2026-08-30 update on why `packages/db`-style sharing doesn't trivially extend here).
- `chains/utils/thread-document-retriever.ts` (ported from ragen-app's `ThreadDocumentRetriever.ts`) dropped a dead `import db from '@ragenai/prisma-client'` present in the original — grep confirms it was never actually used in that file, so no NestJS/PrismaService DI was needed here (unlike `AiUsageService`/`OrganizationSettingsService`/etc., which genuinely write to or read from the DB).
- `chains/errors.ts` (top-level, not `chains/types/errors.ts` which only has the `ChainErrorCode` type) was missing from an earlier slice's original file-list plan but is a real dependency of `chains/utils/chain-utils.ts` (`ModerationError`) — ported alongside the rest.
- `PersistApiThreadService` (unlike `ThreadDocumentRetriever` in an earlier slice) genuinely uses `db.thread`/`db.message` for real — full `PrismaService` DI, not a dropped dead import. `Role`/`Source` enums are imported directly from `../generated/prisma/client.js` (same precedent as `SecurityEventType`/`McpConnectorProvider` in the MCP slice) rather than hand-duplicated.
- **Module placement note**: `PersistApiThreadService` was added as a provider to the *pre-existing* `ThreadsModule` (`src/threads/threads.module.ts`, which already has a real, wired `ThreadsController`/`ThreadsService`/`MessagesService` — this is the original ragen-api CRUD module, not something earlier Phase-B slices created), rather than a new module under `RagEngineModule`. An earlier draft of this change accidentally clobbered that file's existing content with a Write instead of an Edit — caught immediately via `git diff` before it was ever committed, fixed by merging the new provider in alongside the existing controller/providers. Worth remembering: `apps/api/src/threads/` was **not** empty before this slice, unlike every other directory these Phase-B slices have created.
- `@qdrant/js-client-rest` and `meilisearch` are ESM-only from this project's `moduleResolution: nodenext` + CJS package.json's point of view, despite both actually shipping real CJS builds — their `qdrant-client.ts`/`meilisearch-client.ts` files use plain `require()` (not `import`) to get the constructor, with `// eslint-disable-next-line @typescript-eslint/no-require-imports` — this is a deliberate interop workaround, not a mistake; don't "fix" it back to a static `import`.
- `llm/model-instances.ts` (ported from ragen-app's `src/app/lib/services/llm.ts` — only `createChatCompletionInstance`/`createEmbeddingsInstance`, not the org-aware variant or `createModerationInstance` which is already separately ported) preserves the original's eager-throw behavior for a misconfigured `DEFAULT_MODEL_PROVIDER`/`DEFAULT_MODEL` via `llm/types/credentials.ts`'s local `modelsSchema` — don't simplify this back to a bare `process.env.DEFAULT_MODEL` read, that would silently swallow a real misconfiguration.
- `ragen-app`'s `src/libs/mcp/oauth-provider.ts` defines a `PrismaOAuthClientProvider` class that is **dead code** — grep confirms nothing imports it (the real OAuth flow uses `RagenAuthOAuthClientProvider` from `ragen-vault/`, not this). Not ported; don't add it "for completeness."
- `ragen-vault/client.ts`'s `X-Service-Name` header (sent to ragen-token-vault for logging/auditing, not part of the HMAC signature) is `'ragen-api'` here, not `'ragen-app'` — apps/api is a distinct caller and should identify itself as such.
- `security/types.ts`, `connectors/types.ts` duplicate their respective contract-type subsets the same way as the rest of this slice; `SecurityEventType`/`SecurityEventSeverity`/`McpConnectorProvider`/`McpConnectorStatus` are imported directly from the generated Prisma client (`../generated/prisma/client.js`) rather than hand-duplicated as string-literal unions — cleaner than the `AiUsageStep` precedent in `ai-usage/types.ts` and possible because these enums live in the one shared `schema.prisma`.

### Chat (`POST /v1/chat`) — direct implementation, not a proxy

As of the Phase B cutover (see `docs/adrs/21-monorepo-and-api-decoupling.md`), `ChatModule` no longer proxies to ragen-app — `ChatService` orchestrates the RAG-engine services ported across all of Phase B directly. The flow:
1. `ApiKeyGuard` parses `keyId`, queries DB (isActive, org, project, `debugMode`), validates secret against vault, attaches `ApiContext`.
2. `ChatService.chat()`: resolve `assistant_id` → project (org-scoped `findFirst`, IDOR guard) → 404 if not found.
3. `ApiLimitsService.checkApiRequestLimit()` → 429 if exceeded.
4. In parallel: `OrganizationSettingsService.getAllSettings()` + `ResolveLiteLLMKeyService.resolveForRequest()`.
5. `LoadMcpToolsService.loadMcpToolsForApiRequest()` — connector/MCP tools for this org/user/project.
6. `InitializeBasicRagService.initializeRagChain()` — assembles the `basicRagChain` instance (model instances, vector store incl. the dual-content PII decode wrapper, RAG pipeline settings).
7. `context.debugMode` (from the API key's DB record, not a client header) gates `PersistApiThreadService.createApiThread()`.
8. Streams SSE (`text-delta`/`reasoning-delta` parts, `[DONE]` terminator) or returns JSON `{ text }`; either way tracks usage via `AiUsageService.track()` and always closes MCP clients (`closeMcpClients()`), including on error.
9. Client disconnect handled via `AbortController` on `req.on('close', ...)`, same as before.

Public contract (`ChatController`/`ChatDto`) is unchanged from the proxy era — `content`/`assistant_id`/`context`/`stream`/`reasoning_effort` fields, same status codes (400/401/403/404/429/500).

**`ChatCompletionsModule` (`POST /v1/chat/completions`, OpenAI-compatible) still proxies to ragen-app** — that cutover (OpenAI wire-format translation on top of the same engine) is separate, not-yet-done follow-up work. `FilesModule`'s `upload()`/`remove()` also still proxy (S3 + Temporal orchestration, out of scope for the chat cutover). `RagenAppClient`/`INTERNAL_API_SECRET` stay in place until those are cut over too — don't remove them yet.

There is a full-DI-graph wiring test (`chat/chat.module.wiring.spec.ts`) that compiles the real `AppModule` via `Test.createTestingModule` — `nest build` only type-checks, it never verifies that NestJS can actually resolve every provider in the graph. Keep this test (or an equivalent) if `ChatModule`'s dependency list changes.

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
