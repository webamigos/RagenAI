# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The root `AGENTS.md`'s "Task Router" table and `docs/lessons.md` (repo root, shared across the whole monorepo) apply here too — check both before starting nontrivial work in `apps/api`.

## Commands

```bash
npm install          # Install dependencies
npm run build        # Build (nest build)
npm run start:dev    # Dev server with watch mode
npm run lint         # ESLint with auto-fix
npm run format       # Prettier formatting
npm test             # Unit tests (Jest)
npm run test:e2e     # E2E tests (separate jest config in test/jest-e2e.json)
npx jest --testPathPatterns='<pattern>' # Run a single test file (Jest 30 renamed --testPathPattern)
```

### Docker

Build context is the **monorepo root**, not `apps/api/` — the image needs the shared `prisma/schema.prisma` and `npm ci`'s workspace resolution, same reason `apps/admin/Dockerfile` also builds from root. Run from the repo root, not from inside `apps/api/`:

```bash
docker build -f apps/api/Dockerfile -t ragen-api .   # Multi-stage build (node:24-alpine), context = repo root
# Production: node apps/api/dist/main.js on port 3001
```

`apps/api/railway.toml`'s `dockerfilePath`/`startCommand` are root-relative to match (same pattern as `apps/admin/railway.json`). `deps` stage: `npm ci --ignore-scripts` (skips husky's `prepare` hook, which needs a `.git` dir not present in the build context at that stage) `&& npm rebuild bcrypt` (the one native module apps/api actually needs at runtime — `ThreadSharingService`'s public-link password hashing; `--ignore-scripts` skips its native binary build too, so it's rebuilt explicitly, same pattern as admin's `npm rebuild esbuild`). `build` stage: `COPY . .` → `npx prisma generate` (produces both ragen-app's and apps/api's clients from the one shared schema) → `cd apps/api && npm run build` → `npm prune --omit=dev` (operates on the exact tree that built, avoiding a hoisting mismatch a separate `npm ci --omit=dev` could introduce). Root `.dockerignore` excludes `node_modules`/`.git`/generated Prisma output/etc. — without it the build context is >10GB (the whole monorepo, unfiltered).

### CI

GitHub Actions (`.github/workflows/ci.yml`) runs lint → test → build on Node 24. All three must pass. Triggers on push/PR to `main` **and `dev`** — `dev` is the branch contributions target (see `CONTRIBUTING.md`), so PRs there get the full gate.

## Architecture

NestJS 11 API with `v1` global prefix, running on port 3001. Uses `nodenext` module resolution — all local imports must use `.js` extensions. Shares the same PostgreSQL database as ragen-app.

### Database (Prisma)

Uses Prisma with `@prisma/adapter-pg` (same pattern as ragen-app). **No local schema** — this app has no `prisma/` directory. The Prisma client is generated from the monorepo's single shared schema at `../../prisma/schema.prisma` via a second `generator apiClient` block in that file (output `../apps/api/src/generated/prisma`, gitignored). Running `prisma generate` at the repo root (already wired into the root `postinstall`) regenerates both ragen-app's and apps/api's clients from the same schema — see `docs/adrs/21-monorepo-and-api-decoupling.md`. Never add back a local `prisma/schema.prisma` here; edit the root schema instead.

`PrismaService` (`src/prisma/prisma.service.ts`) imports `PrismaClient` from the relative path `../generated/prisma/client.js`, not from `@prisma/client`. `nest-cli.json`'s `assets` config copies `src/generated/**/*` into `dist/generated` on build (tsc doesn't copy pre-built JS on its own). `apps/api/eslint.config.mjs` and root `.eslintignore` both exclude `src/generated` — it's large generated code, not linted.

`PrismaModule` is global — inject `PrismaService` and access `prismaService.client` for queries.

**Tenant-scope guard (warn-only)**: `PrismaService`'s client is wrapped with a Prisma Client Extension from `src/prisma/tenant-scope-guard.ts` — logs (`Logger.warn`) when a query on a tenant-scoped model (~20 models with a direct `organizationId`/`orgId` column) runs without that field in `where`/`data`. Doesn't throw — see the mirrored file's doc comment and root `AGENTS.md`'s "Prisma (v7)" section for why (repo-wide grep found ~200 existing call sites across both apps; hard enforcement is future work). Keep this file in sync by hand with ragen-app's `src/libs/db/tenant-scope-guard.ts` — no shared package exists for it yet.

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

The NestJS module inventory — every module, its providers and what it owns — is
[`docs/modules.md`](docs/modules.md). Read it before adding a module or wiring a
provider.

### Ported RAG-engine libs

`apps/api` keeps its **own copies** of ragen-app's RAG engine, vector store,
connectors, crypto and storage libs (ADR-21). The per-directory mapping, and the
deliberate divergences from ragen-app, are in
[`docs/ported-libs.md`](docs/ported-libs.md).

> **This is the repo's most-repeated bug source.** A fix in ragen-app's `src/`
> almost always needs the same edit here, and the root `tsc -p .` does **not**
> cover `apps/api` — run `npm run api:build`. Four separate fixes needed the
> second edit during the 2026-08-31 cycle alone.

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

### Chat Completions (`POST /v1/chat/completions`) — also a direct implementation, not a proxy

Also no longer proxies to ragen-app — `ChatCompletionsService` runs the same ported RAG engine as `ChatService` above, adapted for the OpenAI-compatible wire format. Ported from ragen-app's `src/app/api/v1/chat/completions/route.ts`. Differences from `/v1/chat`'s flow:
- Input is an OpenAI-style `messages` array, folded into `question`/`chat_history`/`systemPrompts` by `chat-completions/fold-messages.ts` (`foldMessages`/`mergeProjectInstruction`, ported 1:1 from the route's helpers of the same name) — the last `user` message is the question, earlier turns become `chat_history` in the `"USER: ..."`/`"ASSISTANT: ..."` format `basic-rag/operations.ts` parses, and `system` messages are merged into `projectInstruction` instead (the chain parser has no `SYSTEM:` branch).
- `model`/`temperature` request fields override the org defaults on top of `getAllSettings()`; `max_tokens` is threaded straight into `initializeRagChain`'s `maxTokens`.
- Errors are thrown as NestJS exceptions (`NotFoundException`, `HttpException(..., TOO_MANY_REQUESTS)`) rather than written directly to `res` — `@UseFilters(OpenAiExceptionFilter)` on `ChatCompletionsController` (unchanged from the proxy era) formats them into the OpenAI `{ error: { message, type, code } }` envelope. Only pre-stream errors can go this route; once SSE headers are flushed, `streamChunks()` catches and logs internally instead (same reasoning as `ChatService`'s streaming branch — a thrown exception can no longer be formatted once the response has started).
- Non-streaming responses are wrapped via `buildChatCompletion()`; streaming responses emit `chat.completion.chunk` events directly from the RAG chain's `textStream` via `buildChatCompletionChunk()`/`encodeSseData()` (no more upstream-SSE-text parsing — `common/utils/openai-format.ts` is unchanged, only the previous fetch-and-reparse step was removed).
- Same debug-mode deviation as `/v1/chat`: gated on `context.debugMode`, not the original's `x-debug-mode` header.

There is a full-DI-graph wiring test (`chat/chat.module.wiring.spec.ts`) that compiles the real `AppModule` via `Test.createTestingModule` — `nest build` only type-checks, it never verifies that NestJS can actually resolve every provider in the graph. It now also asserts `ChatCompletionsService`/`ChatCompletionsController` resolve (both modules assemble the identical `RagEngineModule` + `ThreadsModule` graph, so one whole-`AppModule` compile covers both — no need for a second, duplicate wiring test). Keep this test (or an equivalent) if either module's dependency list changes.

### Files (`POST`/`DELETE /v1/files`) — direct implementation, not a proxy

`FilesController`'s `list()`/`get()` were already direct Prisma reads from an earlier slice. `upload()`/`remove()` are now also direct — `FilesService` (in `files/`, distinct from `documents/files.service.ts`'s same-named class — watch for the collision when importing) calls `UploadFileService`/`DeleteFileService` (both in `documents/`) instead of `RagenAppClient`. This was the S3/Temporal infra track — the first apps/api slice to need either:

- **`StorageModule`** (`S3StorageService`) and **`TemporalModule`** (`TemporalClientService`) are new, small, standalone modules (see "Modules" above).
- `UploadFileService.uploadFile()`: checks per-file/org/project storage limits (`OrganizationSettingsService.getStorageLimits()` + the new `StorageUsageService`) → `parse-file.ts` type-detects and reads raw bytes from the `Express.Multer.File` buffer → creates the `UserFile` row → `S3StorageService.upload()` under an `${orgId}/${fileId}.${ext}` key (rolls back the DB row on S3 failure) → marks `isUploaded: true` → resolves the PII policy (explicit param, or the folder's via `FoldersService.getFolderPiiPolicy()`, already ported in an earlier slice) → `TemporalClientService.startWorkflow(Workflow.RUN_FILE_EMBEDDINGS, ...)`. Throws a typed `UploadRejectedError` (`single_file_limit`/`org_storage_limit`/`project_storage_limit`/`s3_upload_failed`/`workflow_start_failed`) that `FilesService.upload()` maps to 413 or 502 with an OpenAI error envelope (`buildError()`).
- `DeleteFileService.deleteFile()`: finds the file (optionally project-scoped) → `FilesService.deleteFileFromDb()` (documents module's `FilesService`, already ported) → best-effort S3 object delete, thumbnail delete, `UserDocument` cleanup (`FilesService.deleteDocumentFromDb()`), and vector-store cleanup (new `DeleteFileFromVectorStoreService`, ported from `TableService.ts`'s `deleteFileFromVectorStore` — raw Qdrant/Meilisearch/Supabase clients per org's `vectorStore` setting, same `require()` interop pattern as `vector-store/qdrant-client.ts`). All four cleanup steps log-and-continue on failure — only the DB delete has to succeed.
- Workflow ids use `node:crypto`'s `randomUUID()`, not the original's `nanoid` — nanoid v5 is ESM-only with no CJS build at all (unlike `@qdrant/js-client-rest`/`meilisearch`, which do and get the `require()` workaround), so it can't be added under `nodenext` without an async dynamic `import()`.
- `RagenAppClient`/`RagenAppError` now have no injected callers left anywhere in apps/api — see the "Ported RAG-engine libs" section above. Not removed yet (Phase D cleanup is explicitly blocked until then).

Google Drive folder import/sync and Fireflies transcript search (`ConnectorsModule`, ~1450 lines) checked and found **not applicable** to apps/api — see the "Not ported, and not planned" note under `ConnectorsModule` above.

### Internal (session-authenticated) routes — Phase C controllers

All six Phase C service modules (notifications, messages, projects, connectors, documents, threads) now have controllers under `internal/<feature>` (e.g. `POST /v1/internal/projects`), separate from the public OpenAI-compatible `/v1/*` API in every respect:

- `@UseGuards(SessionAuthGuard)`, not `ApiKeyGuard` — callable only by ragen-app on behalf of an already-signed-in user (Phase A's HMAC bridge, wired into a real controller for the first time here). Identity via `@GetSessionAuthContext()`.
- `@ApiExcludeController()` — not in `/v1/docs`, which is the public API's own docs.
- `@SkipResponseTransform()` — same as every other controller in this codebase (see `ReplaceIdsInterceptor`'s doc comment for why: it looks for snake_case keys Prisma's camelCase client never produces).
- **UI cutover status**: all six modules — `notifications`, `messages`, `projects`, `connectors`, `documents`, `threads` — are cut over (ragen-app calls these routes via `src/libs/ragen-api-client/client.ts` — see the ADR's per-module "UI cutover" updates). Phase C's UI cutover is complete, and Phase D (deleting the ragen-app feature-module commands/queries those cut-over actions used to call directly) is also done — see the ADR's "Phase D cleanup" update. Every module still has documented exceptions (S3/Temporal/app-admin-role-dependent commands, RAG-pipeline internals, guest/embed-widget flows, or an SSR page's direct query call) that deliberately stay local in ragen-app — see each module's ADR update for the exact list before assuming a route with no caller is dead.
- **Response-serialization gotcha, found during the projects cutover**: a controller handler that returns a bare `string`/`number`/`boolean`/`null` straight from a service call (not wrapped in an object) gets serialized via Express's `res.send()`, not `res.json()` — an invalid-JSON unquoted body for a non-empty primitive, an empty body for `null`. Objects and arrays are unaffected. `ProjectsController.getInstruction()`/`getDefault()`, `FoldersController.getPiiPolicy()`, and `ThreadCoreController.getPublicLink()` all had this bug, found only via live testing (not `nest build`, not the unit suite), now fixed by wrapping in an object (`{ instruction }`, `{ projectId }`, `{ piiPolicy }`, `{ publicLink }`). `ConnectorsController` and the rest of the documents/threads controllers were checked and found clean. Check for this pattern on any new controller handler before assuming it's fine.
- **`Promise<unknown>` type-safety gotcha, found during the connectors cutover** (ragen-app side, not apps/api, but relevant to every future cutover calling into these controllers): a ragen-app Server Action calling `ragenApiRequest(...)` without an explicit `<T>` generic silently infers `Promise<unknown>` — `tsc` only catches this if the check is broad enough to cover every consumer file, not just the edited action file. Found in both the connectors and (retroactively) the already-shipped projects cutover; fixed in both. Always give `ragenApiRequest<T>` an explicit generic matched to the actual controller/service return shape, and always run an unfiltered `tsc --noEmit -p .` (not file-scoped) before considering a UI-cutover slice done.

Full detail — the exact route list per module, every deliberate exclusion and why, and the access-control gaps found and closed (`ProjectsService.getProjectDetail`, `ThreadsCoreService.createThreadForUser`/`sendMessageInOwnThread`, `FoldersService.getMembershipContext`) — is in `docs/adrs/21-monorepo-and-api-decoupling.md`'s "Phase C controllers" update; each controller file's own class-level doc comment also documents its own exclusions. Don't re-derive the route list from scratch — read those first.

`DocumentEncryptionService` and `ThreadEncryptionService` (admin-only batch KMS migrations) have no controller — `SessionAuthContext` carries no app-admin-role flag, so there's currently no way to gate an admin-only route at all. Porting an app-admin guard is its own future slice.

### Telemetry

OpenTelemetry (traces, metrics, logs) initialized in `src/instrument.ts` — must be the first import in `main.ts`. Only activates when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; otherwise it's a complete no-op. Auto-instrumentation covers HTTP, outgoing `fetch`/undici (the ragen-app calls and the token vault), Postgres, and Prisma. Use `withSpan()` from `src/telemetry/telemetry.ts` to instrument async operations — see `vault.client.ts` and `api-keys.service.ts` for the pattern.

For a local collector + Jaeger UI (http://localhost:16686), run `docker compose --profile observability up -d` at the repo root, then set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`.

### Type Safety

Branded types in `src/common/types/brand.ts` (`OrgId`, `UserId`, `ProjectId`, `KeyId`, `ApiKey`) prevent accidental mixing of ID types.

## Environment Variables

Key env vars (see `.env.example` for full list):
- `DATABASE_URL` — PostgreSQL connection (shared with ragen-app)
- `PORT` — HTTP port (default: 3001)
- `RAGEN_APP_INTERNAL_URL` — ragen-app base URL used by `RagenAppClient` (default: `http://localhost:3000`). Since the Phase B cutover `ChatService` calls the ported engine directly rather than proxying, and `RagenAppClient` has no injected consumers left — it stays registered in `CommonModule` for the endpoints not yet ported. Unset it and nothing currently breaks.
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
