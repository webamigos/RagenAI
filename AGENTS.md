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
npm run web:dev          # Next.js dev server (apps/web)
npm run web:build        # Production build
npm run web:lint         # ESLint
npm run web:test         # Unit tests. Add a path to run one file.
npm run packages:test    # Workspace package tests
npm run ragen:up:full    # Backing services only (apps run on the host)
npm run ragen:up:everything  # Everything in containers, apps included
npm run generate:types   # Prisma client for every app (root owns the schema)
npm run test:e2e         # Playwright E2E tests (requires ragen_e2e DB)
npm run generate:types   # Regenerate Prisma client after schema changes
npm run db:seed          # Seed database (uses .env.local)
npm run worker:dev       # Temporal worker (apps/worker) in watch mode
npm run worker:test      # Worker Jest suite
npx turbo run build      # Build every workspace, in dependency order, cached
npx turbo run build --filter=@webamigos/ragen-api   # ...just one, plus what it needs
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
| Vector store, collection schema, why only Qdrant works | [`docs/vector-store.md`](docs/vector-store.md), ADRs [11](docs/adrs/11-qdrant-vector-store.md)/[14](docs/adrs/14-hybrid-search-dense-sparse.md)/[31](docs/adrs/31-only-qdrant-is-a-supported-vector-store.md) |
| Knowledge base folders, sharing, permissions, IDOR concerns | [`docs/knowledge-base.md`](docs/knowledge-base.md) |
| Tenant/org data scoping, cross-org data leaks | `apps/web/src/libs/db/tenant-scope-guard.ts`, this file's "Prisma (v7)" and "Server Actions — Security" sections, [`docs/lessons.md`](docs/lessons.md) (`architecture`/`security` areas) |
| Prisma schema changes, migrations | this file's "Prisma (v7)" section, ADR [03](docs/adrs/03-prisma-v7-migration.md) |
| Auth, RBAC, permission checks | this file's "RBAC" section, `apps/web/src/lib/auth-guards.ts`, `apps/web/src/lib/auth-access-control.ts` |
| Thread message encryption, KMS keys | [`docs/thread-encryption.md`](docs/thread-encryption.md), ADRs [02](docs/adrs/02-per-org-kms-keys.md)/[06](docs/adrs/06-thread-message-encryption.md) |
| **Integrations** | |
| MCP connectors (Slack/HubSpot/ClickUp/Google/Fireflies) | [`docs/mcp-integrations.md`](docs/mcp-integrations.md), ADR [05](docs/adrs/05-mcp-integration-strategy.md) |
| LiteLLM / model routing / adding a model | [`docs/litellm-proxy.md`](docs/litellm-proxy.md), `infra/litellm/config.yaml` |
| Public API, opaque API keys | ADR [13](docs/adrs/13-opaque-api-keys.md), this file's "API" section |
| Chatbot embed widget | [`docs/chatbot-integration-followups.md`](docs/chatbot-integration-followups.md) |
| **Monorepo & apps/api** | |
| Monorepo task graph, caching, adding a workspace | this file's "Monorepo tasks (Turborepo)" section, `turbo.json` |
| Anything touching `apps/api`, the NestJS port, or what's been cut over vs. stays local | [`docs/adrs/21-monorepo-and-api-decoupling.md`](docs/adrs/21-monorepo-and-api-decoupling.md) (read the latest updates first), `apps/api/AGENTS.md` |
| Document ingest, Temporal workflows, anything in `apps/worker` | [`docs/adrs/26-absorb-ragen-worker-into-monorepo.md`](docs/adrs/26-absorb-ragen-worker-into-monorepo.md), `apps/worker/AGENTS.md` |
| **Testing & ops** | |
| Document ingest file types, PDF/DOCX/XLSX handling | [`docs/document-processing.md`](docs/document-processing.md) |
| Settings pages, per-permission nav | [`docs/settings-pages.md`](docs/settings-pages.md) |
| Unit/component tests | this file's "Testing Requirements" section |
| E2E tests, regression sweep before a release | this file's "E2E Tests" section, [`docs/regression-checklist.md`](docs/regression-checklist.md) |
| Security incidents, PII alerting | [`docs/security-monitoring.md`](docs/security-monitoring.md) |
| LiteLLM version upgrades | [`docs/runbooks/litellm-upgrade.md`](docs/runbooks/litellm-upgrade.md) |

## Local Development

Node.js 24.x (Active LTS). Minimum `.env.local`:

```
DATABASE_URL="postgresql://postgres:pass123@localhost:5432/smartrag"
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

**Monorepo layout** (npm workspaces, `apps/*` + `packages/*`): `apps/web` is the Next.js app (ADR-29 moved it off the repository root); `apps/api` NestJS public API, `apps/admin` platform admin, `apps/worker` Temporal ingest worker; `packages/db` Prisma singleton, `packages/rag-core` the vector contract shared by app, api and worker, `packages/storage` the file-storage providers (local by default, any S3-compatible store opt-in — ADR-27), `packages/observability` the OTel logger and span helper (ADR-28). One `prisma/schema.prisma` serves every app via per-app `generator` blocks. Supporting services (LiteLLM, Docling, Presidio, the OTel collector) live in `infra/` — see [`infra/README.md`](infra/README.md); each carries its own `railway.toml`, so moving one means changing that Railway service's root directory.

**Path convention in this file**: a bare `src/…` means `apps/web/src/…`. Paths in
any other workspace are always written in full (`apps/api/src/…`,
`packages/rag-core/src/…`).

### Monorepo tasks (Turborepo)

`turbo.json` defines three tasks — `build`, `lint`, `test` — each with
`dependsOn: ["^build"]`. Turbo reads the dependency graph from the workspaces'
own `package.json` files, so a task on `apps/api` builds `packages/rag-core`,
`packages/storage` and `packages/observability` first, automatically. **Do not
re-add manual `packages:build &&` prefixes to scripts** — that is what this
replaces, and it defeated the cache.

Results are cached by input hash. A repeat `npm run api:build` with nothing
changed goes from ~15s to ~70ms, and a subsequent `worker:build` reuses the
three package builds rather than repeating them.

Two things worth knowing:

- **There is no remote cache configured.** The cache is local (`.turbo/`), so CI
  gets no cross-job reuse — every job still builds from cold. The win today is
  local. Adding Vercel Remote Cache or a self-hosted one is what would make CI
  benefit.
- Every app is a turbo workspace, including `apps/web` since ADR-29 — no CI job
  builds packages by hand any more. `packages/*` have no test runner of their
  own, so they get a root `vitest.config.ts` and their own `Packages / Test`
  job rather than riding along in another app's config.

### RAG Pipeline

Four composed improvements, all on by default (ADRs 11, 12, 14, 15, 16). Visual diagrams: [`docs/rag-pipeline.md`](docs/rag-pipeline.md).

| ADR | Stage | Purpose |
|---|---|---|
| **14** Hybrid search | Retrieval | Dense (`bge-multilingual-gemma2`) + sparse (BM25) with server-side RRF |
| **15** Multi-query | Before retrieval | Expand to N-1 alternative phrasings via `REPHRASE_MODEL` (standalone question always first) |
| **16** Summaries | Ingest | Worker prepends a summary chunk (`metadata.chunk_type: 'summary'`) per document |
| **12** Rerank | After retrieval | Cross-encoder sharpens top-k (Scaleway `qwen3-embedding-8b` by default) |

**Ingest** (in `apps/worker`): parse → chunk → summarize → prepend summary chunk → hybrid embed → upsert to Qdrant (named vectors) + best-effort merge `UserFile.metadata.summary`.

**Retrieval** (`src/libs/chains/basic-rag/`): rephrase to standalone → `expandQueries()` → parallel hybrid searches → dedupe by content → rerank → answer generation with citation prompting.

- Multi-query: `MULTI_QUERY_VARIANT_COUNT = 2` (3 total). Per-query k divided so reranker input stays bounded. Graceful single-query fallback on any error.
- Reranker: 3x over-retrieve, falls back to vector results on provider errors. `RERANK_PROVIDER` selects the backend — unset (default) uses Scaleway `/v1/rerank` with `qwen3-embedding-8b`; `cohere` opts back into Bedrock Cohere Rerank v3.5 via LiteLLM, which requires AWS credentials and re-enabling `cohere-rerank-v3-5` in `infra/litellm/config.yaml`.
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
- `vector-store/` — Qdrant (the only supported backend), plus Meilisearch and Supabase clients implementing `VectorStoreClient` that are **not connected at the write end** — ingest writes to Qdrant unconditionally, so selecting either returns nothing. See [ADR-31](docs/adrs/31-only-qdrant-is-a-supported-vector-store.md).
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

### Knowledge Base

Moved to [`docs/knowledge-base.md`](docs/knowledge-base.md) — see the Task Router.

### Document Processing

Moved to [`docs/document-processing.md`](docs/document-processing.md) — see the Task Router.

### Thread Message Encryption

Moved to [`docs/thread-encryption.md`](docs/thread-encryption.md) — see the Task Router.

### Vector Store (Qdrant, Hybrid)

Moved to [`docs/vector-store.md`](docs/vector-store.md) — see the Task Router.

### MCP Integrations

Moved to [`docs/mcp-integrations.md`](docs/mcp-integrations.md) — see the Task Router.

### Settings Pages

Moved to [`docs/settings-pages.md`](docs/settings-pages.md) — see the Task Router.

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
@/*                    → apps/web/src/*
@/temporal/*           → apps/web/temporal/src/*
@ragenai/common-ui/*   → apps/web/src/libs/common-ui/*
@ragenai/tui/*         → apps/web/src/libs/tui/*
@ragenai/prisma-client → apps/web/src/libs/db
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

## LiteLLM Proxy

Moved to [`docs/litellm-proxy.md`](docs/litellm-proxy.md) — see the Task Router.

## Model Defaults

- **Chat**: `gpt-5.4` (LiteLLM → Azure OpenAI)
- **Rephrase / multi-query expansion**: `gemini-2.5-flash` — do not upgrade without explicit approval
- **Summary** (worker, ADR-16): `gemini-2.5-flash` — faster than `gpt-5.4-nano` for short outputs, strong Polish. Set via `SUMMARY_MODEL` in `apps/worker/src/consts.ts`.
- Always verify against `infra/litellm/config.yaml` (older docs mentioned `gpt-4o`/`gpt-4.1-nano` which are no longer provisioned).

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
| Workspace packages (`packages/*`) | Unit tests beside the source. They run in the root `App / Test` job (vitest's `include` covers `packages/*/src`) and count toward coverage |
| Thin bindings / adapters | A test for whatever they wire. A five-line file that injects a logger or picks a service name is still the only place that wiring exists, and it fails silently when it breaks |

This is not aspirational — a PR adding code with no test is incomplete. The cases
most often missed are the two rows above: shared package code, and the small
per-app files that bind it.

**Vitest and Playwright conventions**: [`docs/testing-conventions.md`](docs/testing-conventions.md).

### E2E Tests (Playwright)

Live in `e2e/`, run against seeded local DB with pre-authenticated test user.

- `e2e/constants.ts` — test user/org IDs, credentials
- `e2e/helpers.ts` — `ROUTES`, `LABELS`, `login()`, `buildMockSSE()`
- `e2e/seed/e2e-seed.ts` — DB seeding (runs in `global.setup.ts`)
- `e2e/auth.setup.ts` — stores authenticated session to `.auth/user.json`
- `e2e/fixtures/` — upload test files

**Naming**: `{priority}-{##}-{name}.spec.ts` where priority is `smoke-01..06` (unauth), `smoke-07+` (auth), `p0-*` (critical), `p1-*` (high), `p2-*` (medium), `p3-*` (low/admin/edge cases).

**The prefix decides when CI runs it.** A PR into `dev` runs only `smoke-*` and `p0-*` (82 of 175 tests); the full suite runs on the `dev`→`main` PR, on push to `main`, and nightly on `dev`. So a `p1`–`p3` test will not gate the PR that breaks it — put anything that must block a merge in `smoke-*` or `p0-*`. Run everything locally with `npm run test:e2e`, or just the fast tier with `npx playwright test "(smoke|p0)-"`.

**Conventions**: see [`docs/testing-conventions.md`](docs/testing-conventions.md).

### Manual Regression Checklist

`docs/regression-checklist.md` — prioritized P0–P3 scenarios across auth, chat, KB, projects, connectors, settings, API. Use before releases.

## Post-Task Workflow

After modifying or creating files:

1. **Write tests first** — unit/integration tests for all new code (see Testing Requirements above).
2. **Run tests** — `npx vitest run`.
3. **Run code review** — `/coderabbit:review` before reporting completion.
4. **Log a lesson if you hit one** — if you made a nontrivial correction or found a non-obvious gotcha, add/update an entry in [`docs/lessons.md`](docs/lessons.md) (see that file's own instructions).
