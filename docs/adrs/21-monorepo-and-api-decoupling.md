# ADR-21: Monorepo Consolidation and RAG Engine Decoupling into ragen-api

**Status:** Proposed
**Date:** 2026-08-29

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
