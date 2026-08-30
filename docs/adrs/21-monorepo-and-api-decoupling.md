# ADR-21: Monorepo Consolidation and RAG Engine Decoupling into ragen-api

**Status:** Partially implemented (monorepo merge + schema unification + Phase A + Phase B fully done for `/v1/chat`; Phase C started (notifications); `/v1/chat/completions` cutover and the rest of Phases C–D still pending)
**Date:** 2026-08-29

## Update (2026-08-30): Phase C started — `notifications` ported (service-only, no controller)

First Phase C slice. Scope check first: the six CRUD feature modules Phase C covers (`threads`, `documents`, `connectors`, `projects`, `messages`, `notifications`) total ~10,250 lines across ~160 files in ragen-app's `src/features/` — bigger than all of Phase B combined. Same safe-slice pattern as Phase B, smallest/least-coupled module first: `notifications` (199 lines, 6 files, zero cross-feature imports beyond Prisma) → `messages` → `projects` → `connectors` → `documents` → `threads` last (per the original audit, `threads` and `documents` are the most auth/session-coupled).

Ported ragen-app's `src/features/notifications/services/{commands,queries}/*.ts` (`create-notification-command`, `mark-all-as-read-command`, `mark-as-read-command`, `get-notifications-query`) as one `NotificationsService` (`apps/api/src/notifications/`), constructor-injected `PrismaService`, matching the `AiUsageService`/`OrganizationSettingsService` shape. `NotificationType` imported directly from the shared generated Prisma client rather than hand-duplicated (unlike `AiUsageStep` in an earlier slice) — both apps generate from the same schema now, no drift risk to guard against here.

**Not ported, deliberately**: `send-notification-to-user.ts` (the real-time SSE push wrapper around `createNotificationCommand`, via ragen-app's `src/app/lib/services/notifications/sse-bus` — no equivalent delivery mechanism exists in apps/api) and the three `src/app/api/notifications/{push,stream,user-push}/route.ts` endpoints (Pusher/SSE delivery, not CRUD). Per the user's direction, this and every future Phase C slice ports **service logic only** — no NestJS controllers, no wiring into `AppModule`'s HTTP surface, and no changes to ragen-app's own UI/routes. Adding controllers (and actually switching ragen-app's session-authenticated UI over) is explicitly a separate, later step once the service layer exists for all six modules — mirrors how Phase B ported the whole RAG engine before the `/v1/chat` cutover.

`NotificationsModule` registered directly in `AppModule` (not nested under `RagEngineModule`, which is scoped to the RAG/chat engine specifically — future Phase C modules should follow the same top-level pattern).

Verified: `apps/api` build/lint clean (0 errors, same 17 pre-existing warnings), 62 suites / 577 tests pass (up from 61/568).

## Update (2026-08-30): Phase B, `/v1/chat` cutover — no longer a proxy

`ChatModule`/`ChatService` reimplemented from scratch against the RAG-engine services ported across every earlier Phase B slice — `POST /v1/chat` no longer calls `RagenAppClient`/ragen-app at all. `ChatController`/`ChatDto` (the public contract) are unchanged; only `ChatService`'s internals changed, verified by direct comparison against ragen-app's `src/app/api/v1/chat/route.ts` line-by-line (field mapping `content`→`prompt`, project resolution via `assistant_id` with `asst-` prefix stripping, API-limit/settings/LiteLLM-key/MCP-tools orchestration order, SSE frame shapes, debug-mode thread persistence, error-status parity).

One deliberate behavioral clarification, not a change: debug-mode thread persistence now reads `context.debugMode` (sourced from the API key's DB record via `ApiKeyGuard`) directly, instead of the `x-debug-mode` HTTP header the ragen-app route read. Checked `RagenAppClient.request()`: it already set that header from `context.debugMode` before forwarding — so this is the exact same value, just read one hop earlier now that the hop is gone.

**Also closed**: the PII dual-content decode gap flagged when `initialize-basic-rag.service.ts` was first ported (opt-in, default-off `piiIngestionMode: 'dual_content'` org setting). Ported `decode-dual-content-chunks.ts` as `chains/basic-rag/dual-content-decode.ts`, and added `OrganizationSettingsService.getOrCreatePiiDek()` (race-safe per-org DEK init/reuse, same pattern as `PersistApiThreadService`'s per-thread DEK) since the narrow org-settings extraction from an earlier slice didn't include it. `initialize-basic-rag.service.ts` now wraps its vector store with this before handing it to `basicRagChain`. This was explicitly called out as "must be fixed before cutover" — fixed as part of this cutover, not deferred further.

**New verification this slice added, beyond build/test/lint**: `chat/chat.module.wiring.spec.ts` compiles the real `AppModule` via `Test.createTestingModule({imports: [AppModule]}).compile()` (never `.init()`, so no live DB/LiteLLM/Qdrant/vault connection needed — only providers whose *constructor* reads `ConfigService.getOrThrow` need a value, set via `process.env` in the test itself so it's not dependent on a local `.env.local`). This is the first test in the codebase to validate the actual NestJS DI graph end to end rather than mocking every dependency — `nest build` only type-checks, it never catches a missing module import or an unresolvable provider. Worth keeping as regression coverage for `ChatModule`'s dependency list.

**Still proxying to ragen-app, not cut over**: `ChatCompletionsModule` (`/v1/chat/completions`, needs OpenAI wire-format translation on top of the same engine — a separate task) and `FilesModule`'s `upload()`/`remove()` (S3 + Temporal orchestration, out of scope here). `RagenAppClient`/`INTERNAL_API_SECRET` stay in place until those are cut over too.

## Update (2026-08-30): Phase B, thread persistence + KMS encryption ported — libs-only sub-scope now complete

Ported `src/app/api/v1/persist-api-thread.ts` (`createApiThread`) and `libs/crypto/thread-encryption.ts` + its `key-provider/{index,types,kms-provider,local-provider,scaleway-provider}.ts` closure, plus `libs/encryption/scaleway-kms.ts` (a real dependency of `scaleway-provider.ts`, not in the original slice's line-count estimate — landed at `apps/api/src/crypto/scaleway-kms.ts` rather than mirroring ragen-app's separate `libs/encryption/` directory, since nothing else in apps/api needs it). Landed as `apps/api/src/crypto/{thread-encryption.ts,key-provider/*,scaleway-kms.ts}` and a new `PersistApiThreadService` provider in the *existing* `ThreadsModule`. Same not-wired, ragen-app-untouched pattern as every prior Phase B slice.

This was the last piece `/api/v1/chat`'s route needs — every dependency (RAG chain, config/settings resolution, MCP tool loading, and now thread persistence/encryption) now exists in `apps/api`, unwired. **The libs-only sub-scope of Phase B is done.** What's left of Phase B is the actual cutover: reimplementing `ChatModule`/`ChatCompletionsModule` against this code and deleting `RagenAppClient`/the proxy — a distinct, higher-risk task, not another libs-porting slice.

**Near-miss caught before commit, not a real incident:** the first attempt at wiring `PersistApiThreadService` into a module used `Write` on `apps/api/src/threads/threads.module.ts` and clobbered its existing content — that file is the *original* ragen-api `ThreadsModule` (real, wired `ThreadsController`/`ThreadsService`/`MessagesService`), not something an earlier Phase-B slice created, unlike every other directory these slices have touched so far. Caught immediately via `git diff` before anything was staged or committed; fixed by merging the new provider into the existing module instead of replacing it. Recorded here because it's the first time one of these slices has landed in a directory with pre-existing, live code — worth double-checking `git status`/`git diff` before writing to any file whose directory wasn't created earlier in this ADR's history.

**Explicitly excluded, unchanged from the original slice plan:** `libs/crypto/decrypt-messages.ts` (message read/decrypt side — `persist-api-thread.ts` only writes, never reads existing messages back); `libs/crypto/decrypt-documents.ts`, `public-link-token.ts` (unrelated crypto utilities); the PII `dual_content` decode wrapper (`wrapVectorStoreWithDualContentDecode`, the `initialize-basic-rag.service.ts` KNOWN GAP from an earlier slice) — this slice ports the KMS/DEK foundation that gap needs but does not wire it in; still a separate task.

**Adaptations, same established patterns:** `logger` → NestJS `Logger`; `db.thread`/`db.message` → `PrismaService` DI in `PersistApiThreadService` (this one's `db` usage is real, not a dropped dead import like an earlier slice's `ThreadDocumentRetriever`); `Role`/`Source` Prisma enums imported directly from the generated client rather than hand-duplicated (same as the MCP slice's enum handling). `key-provider/local-provider.ts` needed a new eslint-override entry (`@typescript-eslint/require-await: off`) beyond the established `no-unsafe-*` group — its `KeyProvider` interface methods are declared `async` to satisfy the interface contract but do no actual `await`ing (pure local AES wrap/unwrap, no I/O).

Verified: `apps/api` build/lint clean (0 errors; same 17 `no-unsafe-argument` warnings, unchanged count — nothing new), 59 suites / 552 tests pass (up from 56/515); `git status` confirms nothing under `ragen-app/src/` changed, only `apps/api/**` + root lockfile/`package.json` (new dep: `@aws-sdk/client-kms`, pinned to ragen-app root's `^3.1018.0`).

## Update (2026-08-30): Phase B, MCP tool loading ported (still not wired)

Ported `src/app/api/v1/load-mcp-tools.ts` and its full closure — `libs/mcp/{client,oauth-provider,provider-instructions}.ts`, `libs/ragen-vault/{client,oauth-provider,index}.ts`, `libs/security/{mcp-tool-classifier,tool-gating-context,tool-arg-inspector}.ts`, `features/security/services/commands/record-security-event-command.ts` + its `utils/{pii-scrubber,escalation-rules,severity-threshold}.ts` closure, and the read-only connector queries/registry (`features/connectors/services/queries/{get-enabled-connectors-query,get-available-connectors-query}.ts`, `features/connectors/contracts/connector.types.ts`, `features/connectors/constants/providers.ts` + all 11 `features/connectors/providers/*.ts` provider manifests, `features/projects/services/queries/get-project-mcp-providers-query.ts`). Landed as `apps/api/src/{mcp,ragen-vault,security,connectors,projects}/`, plus two more methods (`getAllowedConnectors`/`getDefaultAllowedConnectors`) added to the already-ported `organizations/organization-settings.service.ts`. Same not-wired, ragen-app-untouched pattern as every prior Phase B slice — this closes the loop on `chains/basic-rag/chain.ts`'s `toolGatingContext`/`experimental_context` plumbing (already ported, previously unexercised since nothing populated `mcpTools`).

**Still deliberately excluded, unchanged reasoning:** `src/app/api/v1/persist-api-thread.ts` (thread persistence — needs `libs/crypto/thread-encryption.ts`), `src/app/api/v1/utils.ts` (the old `verifyInternalSecret` proxy-auth mechanism, gets deleted at cutover rather than ported). All connector-management WRITE-side commands (create/disconnect/toggle/register-api-key*/drive-sync/import) and provider-UI-specific read queries (Drive file pickers, Fireflies transcript search, `get-connector-query`, `get-user-connectors-query`) were out of scope — this slice is "load already-connected tools for a chat turn," not connector management.

**Two real deviations found during porting, not in the original slice plan:**
1. `libs/mcp/oauth-provider.ts` (`PrismaOAuthClientProvider`, using `db.mcpOAuthToken` directly) turned out to be **dead code** — grep confirms nothing in ragen-app imports it; the real OAuth flow uses `RagenAuthOAuthClientProvider` from `libs/ragen-vault/` instead. Not ported.
2. `record-security-event-command.ts` dispatches an email alert (React Email + Resend via `src/app/emails/services/mailer`) on threshold-crossing severity — a Next.js-specific subsystem outside this slice's scope. `SecurityEventService.record()` ports the DB insert, logger mirror, and burst-escalation logic faithfully, but the email dispatch is a documented **KNOWN GAP** (class-level comment in `security/security-event.service.ts` + `apps/api/CLAUDE.md`) — no alert email fires from apps/api today. Fine while unwired.

**Adaptations, same established patterns:** `logger` → NestJS `Logger`; `recordSecurityEvent` (a global import in ragen-app) → an optional injected `RecordSecurityEvent` callback (`security/types.ts`) threaded through `wrapToolsForConnector`/`createMcpToolsFromConnectors`, same pattern as `trackAiUsage` — a real caller passes `securityEventService.record.bind(securityEventService)` (see `mcp/load-mcp-tools.service.ts`). `SecurityEventType`/`SecurityEventSeverity`/`McpConnectorProvider`/`McpConnectorStatus` are imported directly from the generated Prisma client rather than hand-duplicated as string-literal unions (cleaner than the `AiUsageStep` precedent, and available because these enums live in the one shared schema). `ragen-vault/client.ts`'s `X-Service-Name` audit header is `'ragen-api'` here, not `'ragen-app'`, since apps/api is a distinct caller. New dependency: `@ai-sdk/mcp`, pinned to ragen-app root's version.

Verified: `apps/api` build/lint clean (0 errors; same `no-unsafe-argument` warning category, count up from 12 to 17 — all in already-ported files, none new-and-unexplained), 56 suites / 515 tests pass (up from 41/338); `git status` confirms nothing under `ragen-app/src/` changed, only `apps/api/**` + root lockfile/`package.json` (new dep: `@ai-sdk/mcp`).

## Update (2026-08-30): Phase B, config/settings resolution layer ported (still not wired)

Ported the layer around the chain — `src/app/api/threads/services/initializeBasicRag.ts` (the chain factory), `src/app/api/v1/{check-api-limit,resolve-litellm-key}.ts`, and the narrow slice of `src/features/organizations/services/organization-settings.ts` (900+ lines — a grab-bag covering every org setting) that those actually call: `getUsageLimits`, `getRagPipelineSettings`, `getAllSettings`, `getLiteLLMOrgApiKey`, and their shared private `getSettings()` helper. Landed as `apps/api/src/{organizations,teams,documents,api-limits}/` plus `apps/api/src/chains/basic-rag/initialize-basic-rag.service.ts` and `apps/api/src/llm/model-instances.ts` (`createChatCompletionInstance`/`createEmbeddingsInstance`, needed by the chain factory to actually instantiate models from resolved credentials). Same not-wired, ragen-app-untouched pattern as every prior Phase B slice.

**Still deliberately excluded, unchanged reasoning:** `src/app/api/v1/load-mcp-tools.ts` (MCP/OAuth tool loading — `libs/mcp`, `features/connectors`, `libs/ragen-vault`), `src/app/api/v1/persist-api-thread.ts` (thread persistence — needs `libs/crypto/thread-encryption.ts`), `src/app/api/v1/utils.ts` (the old `verifyInternalSecret` proxy-auth mechanism, gets deleted at cutover rather than ported).

**One real "needs logic, not just a type, from an excluded area" case, flagged rather than silently expanded:** `initializeBasicRag.ts` wraps its vector store with `wrapVectorStoreWithDualContentDecode`, which calls `getOrCreatePiiDek`/`decryptContent` from the deferred `libs/crypto/thread-encryption.ts` KMS subsystem, to decrypt PII "dual_content"-mode chunks. The ported `initialize-basic-rag.service.ts` skips that wrapping entirely (documented as a class-level "KNOWN GAP" comment and in `apps/api/CLAUDE.md`) — for the opt-in, default-off `piiIngestionMode: 'dual_content'` org setting, retrieved chunks would come back with masked content instead of the real decrypted text. Harmless while unwired; **whoever does the cutover must port the dual-content decode wrapper (alongside thread-encryption.ts) first**, or this becomes a real correctness bug for any org using that mode.

Other adaptations: `OrganizationSettingsService` is a narrow read-only extraction of the 4-function closure named above, not a 1:1 port of the 900-line original — the private `getSettings()`/`getApiKeyFromPool()`/`resolveOrgModel()` helpers and `RawOrganizationSettings`/`UsageLimits`/`RagPipelineSettings`/`OrganizationSettings`/`OrganizationMetadata` types were traced and carried along, everything else (allowed-models/connectors/templates management, LiteLLM team provisioning, PII DEK management) was deliberately left out. `hashApiKey.ts`'s `decryptApiKey`/`encryptApiKey`/`maskApiKey` (small, self-contained `crypto-js` AES helpers — new dependency `crypto-js`/`@types/crypto-js`, pinned to ragen-app's versions) ported as `organizations/hash-api-key.ts` — explicitly NOT the KMS thread-message subsystem. `model-instances.ts` preserves the original's eager-throw on a misconfigured `DEFAULT_MODEL_PROVIDER`/`DEFAULT_MODEL` (via the already-ported local `modelsSchema` in `llm/types/credentials.ts`) rather than silently falling back. `supabaseVectorStoreClient.ts` ported as a plain-`SupabaseClient` factory (no `Database` generic), matching the simplification the earlier vector-store slice already made for `supabase-client.ts` rather than porting the 329-line generated types file.

Verified: `apps/api` build/lint clean (0 errors; the same 12 pre-existing `no-unsafe-argument` warnings, no new ones), 41 suites / 338 tests pass (up from 36/309); `git status` confirms nothing under `ragen-app/src/` changed, only `apps/api/**` + root lockfile/`package.json` (new dep: `crypto-js`).

## Update (2026-08-30): Phase B, basic-rag chain ported (still libs-only, still not wired)

Ported `src/libs/chains/basic-rag/*` and its direct closure (`src/libs/chains/{types,utils}/*`, plus `src/libs/chains/errors.ts` — a real dependency missed in the original file-list plan for this slice, added alongside the rest) into `apps/api/src/chains/`, same safe/reversible/not-wired pattern as the rest of Phase B's libs-only sub-scope. This is "the chain algorithm itself" (rephrase/expand, hybrid retrieval, rerank, moderation, answer generation with citations, streaming) — it takes already-constructed `vectorStore`/`models`/`config` objects as parameters.

**Deliberately excluded, same reasoning as before:** `src/app/api/threads/services/initializeBasicRag.ts` (the chain factory — org settings, vector store selection, access filter) and `src/app/api/v1/{load-mcp-tools,check-api-limit,persist-api-thread,resolve-litellm-key,utils}.ts` (MCP loading, rate limiting, thread persistence, LiteLLM key resolution) — these pull in `features/organizations`, `features/documents/services`, `libs/mcp`, `features/connectors`, none of which are ported. Nothing in this slice needed *logic* (as opposed to a type) from those excluded areas.

Adaptations beyond what's already documented for the earlier libs-only slice (see the Update below and `apps/api/CLAUDE.md`'s "Ported RAG-engine libs" section for the full list): `chains/basic-rag/operations.ts`'s rephrase/expand/retrieval functions and `chains/utils/common-operations/moderate-content.ts` now take the same injected `TrackAiUsage` callback pattern as `TrackedEmbeddingsProvider`/the reranker; `ThreadDocumentUI` (duplicated, from `features/documents/contracts/document.types.ts`) and moderation (`createModerationInstance`/`ModerationInstance`, duplicated from `src/app/lib/services/llm.ts`, new dependency `openai` added to `apps/api/package.json` at ragen-app's pinned version) join `model-registry.ts`/`ai-pricing.ts` as duplicated-not-shared content. `ThreadDocumentRetriever` turned out not to need any NestJS DI adaptation at all — its `import db from '@ragenai/prisma-client'` in the original is dead code (never referenced in the file), so the ported version is a plain class exactly like the rest of the chain code.

Verified: `apps/api` build/lint clean (0 errors; the pre-existing 12 `no-unsafe-argument` warnings from the last slice unchanged), 36 suites / 309 tests pass (up from 30/225); `git status` confirms nothing under `ragen-app/src/` changed.

## Update (2026-08-30): Phase B, libs-only sub-scope implemented

Ported `src/libs/{llm,litellm,vector-store,reranker}` and `src/features/ai-usage` into `apps/api/src/{llm,litellm,vector-store,reranker,ai-usage}` as standalone, tested code — deliberately **not** wired into `ChatModule`/`ChatCompletionsModule` or any other controller yet, and ragen-app's own copies are untouched. This is the safe, reversible slice of Phase B the user asked for explicitly, ahead of the actual chat-engine cutover (still pending — that's the rest of Phase B: reimplementing `ChatModule`/`ChatCompletionsModule` against this code and deleting `RagenAppClient`/the proxy). See `apps/api/CLAUDE.md`'s "Ported RAG-engine libs" section for the adaptation details (logger swap, `trackAiUsage` as an injected callback instead of a global import, `model-registry.ts`/`ai-pricing.ts` duplicated rather than shared, and a `require()`-not-`import` workaround for `@qdrant/js-client-rest`/`meilisearch` being ESM-resolved despite shipping real CJS builds under this project's `moduleResolution: nodenext`).

Verified: `apps/api` build/lint clean, 30 suites / 225 tests pass (up from 150 after Phase A); confirmed via `git status` that nothing under `ragen-app/src/` changed — only `apps/api/**` and the root lockfile (new dependencies: `ai`, `@ai-sdk/openai`, `@ai-sdk/provider`, `@qdrant/js-client-rest`, `meilisearch`, `@supabase/supabase-js`, `zod`, pinned to the same versions ragen-app already uses).

Also had to relax `apps/api/eslint.config.mjs`'s type-aware `no-unsafe-*` rules for `src/{ai-usage,llm,litellm,vector-store,reranker}/**` (same rationale, and same existing pattern, as the pre-existing `prisma.service.ts`/`api-key.guard.ts` override): this code was written against ragen-app's non-type-aware Next.js eslint config, and genuinely-`any` external-API/mock-call shapes (`response.json()`, third-party `.rpc()` calls, `jest.fn().mock.calls[n][n]`) that config never flagged now do, under apps/api's stricter `recommendedTypeChecked` ruleset. Hand-annotating every one across ~14 files wasn't a reasonable ask for code not yet wired into anything; revisit per-file if/when a file actually gets wired into Phase B's cutover.

## Update (2026-08-30): Phase A implemented

Session auth bridge: `apps/api` gained `SessionAuthGuard`/`SessionAuthService` (`apps/api/src/common/{guards,services}/session-auth.*`), and ragen-app gained `issueSessionToken()` (`src/libs/service-auth/issue-session-token.ts`). Not the Better-Auth-cookie-forwarding or in-apps/api-Better-Auth-instance approach — a purpose-built, short-lived (~30s TTL) HMAC-SHA256-signed token, format `base64url(JSON payload).hex(hmac)`, shared secret `SESSION_AUTH_SECRET`. Mirrors the existing `ApiKeyGuard`/`ragen-vault` HMAC style already in this codebase rather than adding a JWT library or depending on Better Auth internals from apps/api.

ragen-app calls `issueSessionToken({ userId, orgId, projectId })` **after** it has already resolved a real session server-side (via its own Better Auth instance) — apps/api never sees or validates the raw session cookie, and never issues these tokens itself, only verifies them. This is deliberately scoped to server-to-server calls; it does not address browser-to-apps/api auth (cross-origin cookies, CORS, cookie domain) — that's a separate decision for whenever Phase C actually wires a route through it.

Not wired into any real controller yet — Phase A is pure enabling infrastructure per the original plan below. The first controller to use `SessionAuthGuard` should be part of Phase C, when an actual session-authenticated CRUD route moves.

## Update (2026-08-30): schema unification implemented differently than originally decided

The monorepo merge (ragen-api → `apps/api`) and Prisma schema unification are done, but **not** via `packages/db` as this ADR originally specified. Instead: `prisma/schema.prisma` stayed in place at the ragen-app root, and gained a second `generator apiClient` block (`provider = "prisma-client-js"`, `output = "../apps/api/src/generated/prisma"`). One `prisma generate` now produces both apps' clients from the one schema file. `apps/api/src/prisma/prisma.service.ts` imports `PrismaClient` from the relative path `../generated/prisma/client.js`, not from `@ragenai/db`.

Reason for the deviation: `packages/db`'s `exports` field points `import`/`types` at raw `index.ts` with no `require` condition and no compiled build. That's fine for Next.js (webpack/Turbopack transpiles it at bundle time) but apps/api compiles to CommonJS (`nest build` → `node dist/main.js`, no bundler) — a bare `require('@ragenai/db')` would fail to resolve (`ERR_PACKAGE_PATH_NOT_EXPORTED`) without first adding a real CJS build step to `packages/db`. The two-generator-block approach achieves the same goal (single schema, drift structurally impossible, `apps/api`'s own copy deleted) without that extra work or touching `packages/db`/`apps/admin`/ragen-app's own generator config at all — lower risk, same outcome. `packages/db` remains unchanged and is still what `apps/admin` uses; giving it a real build step so `apps/api` (or a future non-bundled consumer) could import it directly is a possible future cleanup, not required.

Also required to make this work, beyond what's written below: `nest-cli.json` needed `compilerOptions.assets: ["generated/**/*"]` (tsc doesn't copy pre-built `.js`/`.wasm` files into `dist` on its own — without this, `node dist/main.js` would crash on the relative import at runtime, since `dist/generated` wouldn't exist). Both `apps/api/eslint.config.mjs` and `.eslintignore` needed `src/generated` excluded — it now sits under `apps/api/src/`, and ESLint's type-aware linting was hanging trying to type-check the generated client's declaration files. `apps/api/Dockerfile`'s `RUN npx prisma generate` step was removed (no local schema left to generate from) but the deeper issue — the image build's context/working-directory assumptions no longer match a monorepo layout — is still open; see the Dockerfile's own comment.

## Context

`ragen-api` (NestJS, port 3001) was intended to be the public-facing API for Ragen, with `ragen-app` (Next.js) as the primary product surface. In practice the dependency runs backwards:

- `ChatModule` and `ChatCompletionsModule` in ragen-api are pure proxies — they forward `POST /v1/chat` and `POST /v1/chat/completions` to `ragen-app`'s internal `src/app/api/v1/chat/route.ts` and `chat/completions/route.ts` (guarded by a shared `INTERNAL_API_SECRET`, with `x-org-id`/`x-user-id`/`x-project-id` headers set after API-key resolution). `FilesModule`'s `upload()`/`remove()` do the same for `/api/v1/files`.
- The actual RAG/chat engine — `initializeRagChain`, MCP tool loading, LiteLLM key resolution, usage tracking, API-thread persistence (~1,150 lines across `src/app/api/v1/*` and its helpers) — lives entirely in ragen-app.
- Only `Assistants`, `Threads`, `Messages`, and read-paths of `Files` in ragen-api are genuine, independent Prisma-backed implementations.
- `QueryModule` and `AiUsageModule`, described as "stubs" in `ragen-api/CLAUDE.md`, do not exist in `app.module.ts` at all — the doc is stale.

Two structural problems compound this:

1. **Schema drift is already real, not hypothetical.** `ragen-api/prisma/schema.prisma` (777 lines) has diverged from `ragen-app/prisma/schema.prisma` (1,101 lines) — missing `Message.metadata`, the `DocumentCitation` model, and `Thread.publicLink`/`chatbotId` relations, among others. There is no sync script and no CI check comparing the two. Both connect to the same `DATABASE_URL`, so this is a silent-data-loss risk today, independent of any decoupling work.
2. **No session-based auth exists in ragen-api.** It has `ApiKeyGuard` (opaque `sk-<keyId>.<secret>`, per ADR-13) and `WorkerSecretGuard` only — nothing that understands a Better Auth session/cookie the way ragen-app's own UI does. This blocks moving any session-authenticated, UI-facing route (threads, documents, connectors, projects, messages CRUD) out of ragen-app, even though the underlying `src/features/*` service logic (queries/commands) is already framework-agnostic — it takes `orgId`/`userId` as explicit arguments rather than pulling them from `next/headers`.

Separately, ragen-app already has the scaffolding of a monorepo: root `package.json` declares `"workspaces": ["packages/*", "apps/*"]`, `apps/admin` (`@webamigos/ragen-admin`) is a second Next.js app, and `packages/db` (`@ragenai/db`) re-exports a shared Prisma client singleton — today still generated from `ragen-app`'s own `src/generated/prisma`, so it's a shared *wrapper*, not yet a shared *schema*.

`ragen-worker` (Temporal document processing) is a third, independent direct-Postgres client (via Knex, not Prisma) — it intentionally duplicates logic like `trackAiUsage` rather than importing ragen-app code, plus makes an ad-hoc HTTP callback to ragen-app on PII detection. It is out of scope for this ADR but must be kept in mind: consolidating the schema doesn't include it, and any future move of ingest orchestration should account for it separately.

No prior ADR governs the ragen-api/ragen-app split. ADR-13 (2026-04-10) only addresses API key format and notes "the API is not yet in production use" — confirming this is safe to restructure now, before external consumers exist.

## Decision

Do two things together, because doing the monorepo merge first removes the schema-drift risk before any business logic moves, and doing the decoupling without it would just relocate the drift problem into a bigger codebase.

### 1. Bring ragen-api into the ragen-app monorepo as `apps/api`

- Copy `ragen-api`'s working tree into `ragen-app/apps/api` as a new workspace package (`@webamigos/ragen-api`), following the `apps/admin` precedent (own `package.json`, own `next`/`nest` scripts, root-level `api:dev` script analogous to `admin:dev`).
- **No git history import** — this is a plain file copy, not a `git subtree`/submodule. The standalone `ragen-api` repo is tagged and archived (not deleted) as the historical record; new work continues only in the merged monorepo.
- Delete `apps/api/prisma/schema.prisma`. `apps/api` consumes `packages/db` (`@ragenai/db`) exactly like `apps/admin` does, eliminating the drift vector structurally rather than procedurally (no sync script to forget to run).
- `packages/db` stops being "ragen-app's generated client with an extra name" and becomes the actual source of truth: `schema.prisma` and `prisma generate` output move there; ragen-app root, `apps/admin`, and `apps/api` all depend on it.
- Merge CI: ragen-api's GitHub Actions workflow (lint → test → build on Node 22) becomes a path-filtered job in ragen-app's CI rather than a separate pipeline, so `apps/api` changes are gated the same way `apps/admin`/root changes are.
- Deployment stays split — `apps/api` still builds/deploys as its own container (`node dist/main.js`, port 3001) independent of the Next.js app. The monorepo changes source-of-truth and CI, not runtime topology.

### 2. Eliminate the reverse proxy and relocate the RAG engine

Phased, in dependency order:

**Phase A — Auth bridge.** Add a guard to `apps/api` that accepts a Better-Auth-issued session token forwarded from ragen-app (short-lived server-to-server exchange, not the raw cookie) so session-authenticated routes can eventually live in `apps/api` without weakening auth. Blocks nothing else, but unblocks Phase C.

**Phase B — Move the chat/RAG engine.** Port into `apps/api` as real NestJS services (not proxies): `src/libs/chains/` (basic-rag, conversation-chain), `src/libs/llm/`, `src/libs/litellm/`, `src/libs/vector-store/`, `src/libs/reranker/`, plus the specific commands they depend on from `features/ai-usage`, `features/documents`, `features/security`, `features/connectors`. Reimplement `ChatModule`/`ChatCompletionsModule` against this, matching today's `/api/v1/chat` and `/api/v1/chat/completions` behavior (SSE + JSON, MCP tools, usage limits, LiteLLM key resolution, thread persistence). Delete `RagenAppClient` and the `INTERNAL_API_SECRET` plumbing once nothing calls back into ragen-app. This is the highest-value, highest-effort step — it's the one that actually makes ragen-api the backend instead of a pass-through.

**Phase C — Move CRUD-heavy features.** Using the Phase A auth bridge, move `threads`, `documents`, `connectors`, `projects`, `messages`, `notifications` service logic into `apps/api`, largest-refactor-last: `threads` (session/cookie-coupled active-team selection, encryption, public links — 12 files touch auth-guards) and `documents` (7 files with embedded permission checks) go last. ragen-app's own UI switches its client-side fetches to `apps/api`; whether ragen-app keeps thin same-origin route handlers that forward to `apps/api` (to avoid CORS/cookie complications) or calls it directly is a decision for Phase C's own implementation, not this ADR.

**Phase D — Cleanup.** Remove now-dead code in `ragen-app/src/app/api/v1/*` and `src/app/api/internal/*`. Update `ragen-app/CLAUDE.md` and `ragen-api/CLAUDE.md` (merge into one `apps/api/CLAUDE.md` plus a root-level architecture note). Decide, as a separate future ADR, whether `ragen-worker` should start talking to `apps/api` instead of the DB directly — not required for this decoupling to succeed.

`src/libs/common-ui/` and `src/libs/tui/` never move — they're React component libraries, not business logic.

## Consequences

### Positive

- Single Prisma schema — the drift bug class is structurally eliminated, not just documented against.
- `ragen-api` (`apps/api`) becomes what it was meant to be: the real backend, callable independent of ragen-app being up. Removes a hard runtime dependency (today, if ragen-app is down, ragen-api's chat endpoints are down too).
- Shared CI/lint/type-checking across all three apps via the existing workspace.
- Matches the already-established `apps/admin` + `packages/db` pattern — no new tooling paradigm introduced.

### Negative

- Losing `ragen-api`'s standalone git history in the working tree (mitigated by tagging/archiving the old repo, but `git blame` continuity is gone going forward from the merge commit).
- Phase B is a substantial, high-risk refactor of the actual chat/RAG path — needs feature-flagged rollout or a parallel-run/shadow-traffic period before cutting ragen-app's `/api/v1/chat` route off for real.
- Two runtimes (Next.js, NestJS) in one workspace increases install/build time and requires care in `packages/db`'s `exports` (currently `.ts` source-import, which both frameworks currently tolerate — worth re-verifying under `apps/api`'s `nodenext` module resolution, which is stricter about `.js` extensions than ragen-app's bundler resolution).
- `INTERNAL_API_SECRET` and related headers can only be deleted once *all* of Phase B's call sites are gone — partial migration must keep both paths working.

## Migration Plan (execution order)

1. Tag/archive standalone `ragen-api` repo.
2. Copy `ragen-api` → `ragen-app/apps/api`, wire into npm workspaces, get it building/testing standalone against `packages/db` (schema moved there, `apps/api`'s own `prisma/` deleted).
3. Update `apps/admin` and ragen-app root to also resolve schema/client through the relocated `packages/db` (should be a no-op for them if `@ragenai/db`'s public interface doesn't change).
4. Merge CI workflows; confirm `apps/api` build/test/lint run in ragen-app's pipeline.
5. Phase A: session-token bridge in `apps/api`.
6. Phase B: relocate chat/RAG engine; dual-run/verify; cut over; delete `RagenAppClient` + internal-secret plumbing.
7. Phase C: relocate CRUD-heavy features, `threads`/`documents` last.
8. Phase D: dead-code removal, CLAUDE.md consolidation, optional follow-up ADR for `ragen-worker`.

## Key files

| File | Purpose |
|------|---------|
| `ragen-app: package.json` (`workspaces`) | Existing monorepo scaffolding this ADR extends |
| `ragen-app: apps/admin/` | Precedent for a second app in the workspace |
| `ragen-app: packages/db/index.ts` | Becomes the single Prisma source of truth |
| `ragen-api: src/common/services/ragen-app.client.ts` | Proxy client to be deleted in Phase B |
| `ragen-api: src/chat/chat.service.ts`, `src/chat-completions/chat-completions.service.ts` | Proxies to be replaced with real implementations |
| `ragen-app: src/app/api/v1/chat/route.ts`, `chat/completions/route.ts`, `files/route.ts` | Logic to be ported into `apps/api` in Phase B |
| `ragen-app: src/libs/chains/`, `llm/`, `litellm/`, `vector-store/`, `reranker/` | The RAG engine being relocated |
| `ragen-app: docs/adrs/13-opaque-api-keys.md` | Prior decision this ADR builds on (auth model) |
