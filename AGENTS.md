# AGENTS.md

Guidance for coding agents working in this repository. This is the canonical
file — Claude Code, Codex, Cursor and Copilot all read `AGENTS.md`, and
`CLAUDE.md` is a one-line import of it so both names resolve to the same
content. Edit this file, never the pointer.

> **Instruction budget:** Codex reads this file *plus* the `AGENTS.md` of the
> directory it works in, and stops at **32,768 bytes combined** (its default
> `project_doc_max_bytes`) — silently. This file is capped at 30,720 bytes and
> root + any app's file at 32,768, both enforced by
> `tests/architecture/agent-instructions-fit-the-budget.test.ts`. When it fires,
> move long-form detail into `docs/` and leave a pointer — do not trim the hard
> rules.

## Commands

```bash
docker compose up        # Postgres, Redis, Qdrant, Docling (Presidio: --profile pii)
npm run web:dev          # Next.js dev server (apps/web)
npm run web:build        # Production build
npm run verify           # THE gate: generate types, then lint + typecheck + test + build
npm run typecheck        # tsc --noEmit across every workspace
npm run lint             # ESLint across every workspace (or web:lint / api:lint / …)
npm run web:test         # Unit tests. Add a path to run one file.
npm run packages:test    # Workspace package tests
npm run ragen:up:full    # Backing services only (apps run on the host)
npm run ragen:up:everything  # Everything in containers, apps included
npm run generate:types   # Prisma client for every app (root owns the schema)
npm run web:e2e          # Playwright E2E (needs ragen_e2e DB + web:build first)
npm run db:seed          # Seed database (uses .env.local)
npm run local:admin -- --list   # platform admins; --email <e> grants+sets a password
npm run worker:dev       # Background-job worker (apps/worker) in watch mode
npm run worker:test      # Worker Vitest suite
npm run worker:test:jobs # Job-runtime integration suite (needs Redis) — the BullMQ gate
npm run check:config-paths   # Fail if a CI-config path glob matches nothing
npx turbo run build --filter=@ragenai/api   # build one workspace + its deps
```

## Task Router

Before starting a nontrivial task, match it against this table and read the linked doc(s) first — and check [`docs/lessons.md`](docs/lessons.md) for the relevant area, so you don't re-discover a known gotcha. Skip this for single-line/obvious fixes.

| Task | Where to look |
|---|---|
| **RAG pipeline** | |
| Retrieval quality, hybrid search, reranking | [`docs/rag-pipeline.md`](docs/rag-pipeline.md), ADRs [11](docs/adrs/11-qdrant-vector-store.md)/[12](docs/adrs/12-cohere-rerank-post-retrieval.md)/[14](docs/adrs/14-hybrid-search-dense-sparse.md), this file's "RAG Pipeline" section |
| Multi-query expansion / rephrasing | ADR [15](docs/adrs/15-multi-query-expansion.md) |
| Document summaries at ingest | ADR [16](docs/adrs/16-document-summaries-at-ingest.md) |
| Chunking strategy, PDF heading detection, section-aware context, table chunks | ADRs [17](docs/adrs/17-type-specific-chunking.md)/[18](docs/adrs/18-pdf-heading-detection.md)/[19](docs/adrs/19-section-aware-context-rendering.md)/[43](docs/adrs/43-table-chunks-come-from-the-parser-not-the-prompt.md) |
| Measuring/evaluating RAG quality changes | ADR [20](docs/adrs/20-pause-and-measure-rag-quality.md), the [2026-09-12 measurement](docs/rag-measurement-2026-09-12.md), [`evals/`](apps/web/evals/README.md) — three harnesses, one tests retrieval |
| **Data & access control** | |
| Vector store, collection schema, why only Qdrant works | [`docs/vector-store.md`](docs/vector-store.md), ADRs [11](docs/adrs/11-qdrant-vector-store.md)/[14](docs/adrs/14-hybrid-search-dense-sparse.md)/[31](docs/adrs/31-only-qdrant-is-a-supported-vector-store.md) |
| Knowledge base folders, sharing, permissions, IDOR concerns | [`docs/knowledge-base.md`](docs/knowledge-base.md) |
| Document versions, diff, rollback, re-indexing after a content change | [`docs/document-versioning.md`](docs/document-versioning.md) |
| RAG optimization suggestions (Suggest & Accept) | [`docs/document-versioning.md`](docs/document-versioning.md) |
| The `RAG NN/100` badge, the Optimize tab's score, turning it off | [`docs/rag-readiness-score.md`](docs/rag-readiness-score.md) — feature key `ragReadinessScore`; not yet validated against retrieval |
| Tenant/org data scoping, cross-org data leaks | [`docs/tenant-scope-guard.md`](docs/tenant-scope-guard.md), this file's "Server Actions — Security" section |
| Prisma schema changes, migrations | [`docs/prisma.md`](docs/prisma.md), ADR [03](docs/adrs/03-prisma-v7-migration.md) |
| Auth, RBAC, permissions, adding an org role | this file's "RBAC" section and [ADR-39](docs/adrs/39-org-roles-are-capabilities-not-a-rank.md) — ask a capability, never compare the role string |
| Thread message encryption, KMS keys | [`docs/thread-encryption.md`](docs/thread-encryption.md), ADRs [02](docs/adrs/02-per-org-kms-keys.md)/[06](docs/adrs/06-thread-message-encryption.md)/[42](docs/adrs/42-thread-derived-content-is-encrypted-through-one-function.md) — anything derived from a thread goes through one function, never a second branch |
| **Integrations** | |
| MCP connectors (Slack/HubSpot/ClickUp/Google/Fireflies) | [`docs/mcp-integrations.md`](docs/mcp-integrations.md), ADR [05](docs/adrs/05-mcp-integration-strategy.md) |
| Connector OAuth flows, where tokens are stored | [`docs/token-vault.md`](docs/token-vault.md), ADR [32](docs/adrs/32-token-vault-and-mcp-stay-separate.md) |
| Adding a connector, or anything about which connectors exist | [ADR-52](docs/adrs/52-the-connector-catalogue-is-data-not-an-enum.md) — the catalogue is rows a platform admin edits at `/mcp-catalogue`, not an enum; a manifest is optional code beside one |
| A connector URL that must not reach a private address | [`packages/connector-guard`](packages/connector-guard/src) — one policy, three moments (save, connect, every tool call); `allowsPrivateAddress` admits RFC 1918 and nothing else |
| Whether a sibling repository belongs in the monorepo | [ADR-32](docs/adrs/32-token-vault-and-mcp-stay-separate.md) — measure drift first |
| Where a new admin page or read belongs — `apps/web` or `apps/admin` | [ADR-35](docs/adrs/35-two-admin-surfaces-split-by-scope.md) — per-org is web, platform-wide is admin |
| Adding a feature flag, a model, or an MCP connector | [`packages/platform-contracts`](packages/platform-contracts/src) and [ADR-33](docs/adrs/33-shared-platform-contracts-package.md) — declare it once, never per app |
| Adding or validating an environment variable | [`packages/env`](packages/env/src) and [ADR-37](docs/adrs/37-typed-env-contract-not-a-config-file.md) — compose a fragment, don't re-describe a shared var; a provider fragment is merged *with* its rule (`storageRules`, `encryptionRules`), or it validates nothing |
| Extending Ragen without changing core — plugins | [ADR-38](docs/adrs/38-mcp-is-the-plugin-api-no-in-process-plugin-runtime.md) — MCP is the extension API; nothing loads in-process |
| Monthly usage ceilings (cost, tokens, messages) | `assert-within-usage-limits.ts` on chat surfaces, `check-usage-ceilings.ts` on API paths. **The app enforces these, not the proxy** |
| Model routing, adding a model, provider credentials | [ADR-49](docs/adrs/49-the-application-calls-model-providers-itself.md) — the app calls providers itself; routes are `infra/llm-gateway/routes.yaml`. There is no proxy path and no flag: B6 removed both |
| Attaching Portkey, vLLM or Ollama | [`attaching-a-gateway.md`](docs/attaching-a-gateway.md) — an `openai-compatible` route, not a mode. `npm run gateway:preflight -- --probe` first |
| OpenRouter routing, EU region, zero data retention | [`docs/model-routing.md`](docs/model-routing.md) |
| Public API, opaque API keys | ADR [13](docs/adrs/13-opaque-api-keys.md), this file's "API" section |
| Chatbot embed widget | [`docs/chatbot-integration-followups.md`](docs/chatbot-integration-followups.md) |
| **Monorepo & apps/api** | |
| Monorepo task graph, caching, adding a workspace | this file's "Monorepo tasks (Turborepo)" section, `turbo.json` |
| Where a module, route or library lives | [`docs/architecture.md`](docs/architecture.md) |
| Running the whole ecosystem locally, ports, companion services | [`docs/companion-services.md`](docs/companion-services.md) |
| Documentation site, published docs, self-hosting guide | the **`ragen-docs`** repository (Mintlify) — not this one. `npm run docs:config-reference` writes the generated reference into a sibling checkout |
| Anything touching `apps/api`, the NestJS port, or what's been cut over vs. stays local | [ADR-21](docs/adrs/21-monorepo-and-api-decoupling.md) (read the latest updates first), `apps/api/AGENTS.md` + its `docs/agent-guide.md` |
| `apps/mcp`, the MCP server exposing Ragen's chat to external clients | [ADR-36](docs/adrs/36-mcp-server-exposes-chat-via-apps-api.md) — it calls `apps/api` with the caller's key and never touches the database; running it: [`docs/companion-services.md`](docs/companion-services.md) |
| Document ingest, background jobs, anything in `apps/worker` | [ADR-44](docs/adrs/44-bullmq-is-the-worker-runtime.md) — BullMQ runs jobs, Temporal is an adapter — [ADR-26](docs/adrs/26-absorb-ragen-worker-into-monorepo.md), [ADR-40](docs/adrs/40-worker-uses-prisma-not-knex.md), `apps/worker/AGENTS.md` |
| Writing or reviewing a spec before building | [`docs/specs/README.md`](docs/specs/README.md), [`docs/specs/TEMPLATE.md`](docs/specs/TEMPLATE.md) |
| A feature too big for one PR, several people on it, or which commits cut a release | [ADR-50](docs/adrs/50-a-large-feature-ships-as-many-small-prs.md) — small PRs onto `main` behind a feature key defaulting to `false`, never a release branch; a slice behind a disabled key is a `chore` and releases nothing |
| **Testing & ops** | |
| Document ingest file types, PDF/DOCX/XLSX handling | [`docs/document-processing.md`](docs/document-processing.md) |
| Settings pages, per-permission nav | [`docs/settings-pages.md`](docs/settings-pages.md) |
| Any panel UI — layout, tables, empty states, copy | [`docs/panel-ux-rules.md`](docs/panel-ux-rules.md) |
| Uploading, storing or serving a file; S3 vs local | [`docs/file-storage.md`](docs/file-storage.md), ADR [27](docs/adrs/27-storage-abstraction-local-by-default.md) |
| A side-effect on a lifecycle event (welcome email, signup) | [`docs/event-bus.md`](docs/event-bus.md) |
| Unit/component tests | this file's "Testing Requirements" section |
| E2E tests, regression sweep before a release | this file's "E2E Tests" section, [`docs/regression-checklist.md`](docs/regression-checklist.md) |
| Guardrail rules — what a turn must pass, per org | [`docs/guardrails.md`](docs/guardrails.md) — one package, both stages. Input runs *downstream* of PII masking, so a pattern never sees a phone number; output runs in the stream funnel (a chain's `textStream` is a view of it) — a fourth way for text to leave a chain is unguarded |
| Security incidents, PII alerting | [`docs/security-monitoring.md`](docs/security-monitoring.md) |
| Docling version upgrades | [`docs/runbooks/docling-upgrade.md`](docs/runbooks/docling-upgrade.md) |
| Presidio version upgrades, PII test scenarios | [`docs/runbooks/presidio-upgrade.md`](docs/runbooks/presidio-upgrade.md) |
| Upgrading any dependency, or clearing an npm audit advisory | [`.claude/skills/ragen-upgrade-dependency/SKILL.md`](.claude/skills/ragen-upgrade-dependency/SKILL.md) — read it before a bump that touches a library owning DB tables |
| Load testing, or proving who can reach a document | [`apps/web/perf/README.md`](apps/web/perf/README.md) |
| An E2E failure: real regression or your own setup | [`.claude/skills/ragen-e2e-triage/SKILL.md`](.claude/skills/ragen-e2e-triage/SKILL.md) |
| Changing retrieval — chunking, embeddings, reranking, prompts | [`.claude/skills/ragen-rag-change/SKILL.md`](.claude/skills/ragen-rag-change/SKILL.md) — measure, per ADR-20 |
| A query missing its org scope, or the IDOR backlog | [`.claude/skills/ragen-tenant-scope-audit/SKILL.md`](.claude/skills/ragen-tenant-scope-audit/SKILL.md) |
| Reviewing a change against this repo's own invariants | [`.claude/skills/ragen-code-review/SKILL.md`](.claude/skills/ragen-code-review/SKILL.md) |

## Core Surfaces

Five apps share one schema and 18 packages, so some files are read by code you
are not looking at. Before changing one of these, know who depends on it, and
run `npm run verify` — the only command that checks all of them.

| Surface | Who depends on it | What catches a mistake |
|---|---|---|
| `prisma/schema.prisma` | every app, via per-app `generator` blocks | a migration, plus `npm run verify` — one `prisma generate` regenerates all clients |
| `packages/rag-core` | web, api, worker | package tests + each consumer's build |
| `packages/crypto` | web, api, worker | package tests, plus `tests/architecture/encryption-lives-in-one-package.test.ts` |
| `packages/storage`, `observability`, `vault-client` | web, api, worker | as above |
| `packages/platform-contracts` | web, api, admin | package tests, plus `tests/architecture/shared-contracts-are-not-recopied.test.ts` |
| `packages/env` | every app | package tests, `tests/architecture/provider-fragments-carry-their-rules.test.ts`, plus each app's own env schema tests |
| `packages/create-ragen-app` | every new self-hosted install | its own tests + `tests/architecture/create-ragen-app-manifest-is-current.test.ts` |
| `src/lib/auth-guards.ts`, `auth-access-control.ts` | every authenticated route and Server Action | `apps/admin`'s `server-actions-are-guarded` test |
| `src/libs/db/tenant-scope-guard.ts` | ~20 tenant-scoped models | warns at runtime; it does **not** block |
| Better Auth tables (`users`, `sessions`, `accounts`, `members`, …) | the library's own queries | `tests/architecture/` |
| `infra/llm-gateway/routes.yaml` | every model call | `npm run gateway:preflight -- --probe` |

Three rules that come from things that actually broke here:

- **A library that owns a table also owns how it is queried.** Writing its rows
  with Prisma couples you to queries you cannot see; an upgrade can filter on a
  column that was write-only. Prefer the library's API.
- **A red required check is red for a reason.** `test-e2e` is the only gate
  exercising sign-in end to end.
- **A limit that is computed is not a limit — a limit is a call site.** The
  monthly ceilings were enforced by nothing for five months. Grep a guard's
  callers before trusting it.

Architecture guards (`tests/architecture/`, run in `Packages / Test`) read
source as text — add one whenever a rule matters more than a comment can.

## Local Development

Node.js `^24.15.0 || >=26.0.0` — `engine-strict` fails 24.0–24.14 **and all
of 25**. One root `.env.local` serves every app (real env > app `.env` > root;
`scripts/load-root-env.mjs`). Minimum:

```
DATABASE_URL="postgresql://postgres:pass123@localhost:55432/ragen"
REDIS_URL=redis://localhost:56379
QDRANT_URL=http://localhost:6333
DEFAULT_MODEL_PROVIDER=litellm   # the pricing namespace, not a gateway
DEFAULT_MODEL=gpt-4o-mini        # plus OPENAI_API_KEY and a route for it
```

**No bare `PORT` in the root `.env.local`** — three services read it, so one
value moves all three. Use `RAGEN_API_PORT` / `RAGEN_MCP_PORT` (the MCP server defaults to 3300).

**Postgres 55432 and Redis 56379 are deliberately non-standard**: a stale
`DATABASE_URL` naming 5432 makes `prisma migrate` migrate a native Postgres and
report success — **check which server answered before believing a schema
problem**. Every port and Compose name: [`docs/companion-services.md`](docs/companion-services.md).

**Claude Code cloud sessions**: `.claude/hooks/session-start.sh` installs the
`.nvmrc` Node, runs `npm ci` and generates the Prisma clients, so `npm run
verify` works without setup. Known reds there, none yours: no Docker (e2e, DB
suites), no IPv6 loopback (`connector-guard`'s redirect tests) and no
`temporal.download` (the worker's `workflow.spec.ts`).

## Architecture

**Stack**: Next.js 16 (App Router) + React 19 + TypeScript ~5.7 + Tailwind 4 + Postgres (Prisma 7) + Qdrant (hybrid dense+sparse) + BullMQ on Redis (ADR-44) + Scaleway reranker. Model providers are called directly, per the route table (ADR-49). **Redis is the queue**: without `REDIS_URL` apps/api and the worker refuse to boot; apps/web reports it and serves the setup page.

**What it is**: RAG AI chat app with an in-process model gateway, document knowledge bases, and a public API.

**Monorepo layout**: npm workspaces — 5 apps (`web`, `api`, `admin`, `worker`,
`mcp`) over 18 packages, one `prisma/schema.prisma`, services in `infra/`. The
tree and what each package is for: [`docs/architecture.md`](docs/architecture.md).

**Path convention**: a bare `src/…` means `apps/web/src/…`; every other
workspace's paths are written in full.

### Monorepo tasks (Turborepo)

Detail: [`docs/monorepo-tasks.md`](docs/monorepo-tasks.md). The rules:

- **ESLint is one shared flat config**, `packages/eslint-config` (`base`,
  `/next`, `/node`); change one app's rules in its own file.
- **No manual `packages:build &&` prefixes** — `dependsOn: ["^build"]` orders
  them, and the prefixes defeated the cache.
- **`outputs` names the build product only** — it excludes `.next/cache/**`
  *and* `.next/dev/**`; losing the second once filled the disk. Re-check after
  a Next major.

### RAG Pipeline

Hybrid search always runs; multi-query is a per-org setting, default on (no
`FEATURE_FLAG_MULTI_QUERY`); **reranking is opt-in** — `FEATURE_FLAG_RERANKING=1`
plus credentials. Two queries per turn (`MULTI_QUERY_VARIANT_COUNT = 1`).
Detail: [`docs/rag-pipeline.md`](docs/rag-pipeline.md).

### Routing & Layouts

Locale-prefixed (`/en`, `/pl`) via `next-intl`; all UI under
`src/app/[locale]/`, split into `(panel)/`, `(auth)/` and `public/`.
`src/proxy.ts` (Next 16's `middleware.ts`) does i18n and cookie checks only —
**real auth verification happens in server components and layouts**.
See [`docs/architecture.md`](docs/architecture.md).

### Feature Modules (`src/features/`)

CQRS per feature — `contracts/`, `constants/`, `services/queries/` (named
`get*Query()`), `services/commands/` (named `*Command()`), `utils/`. The layout
and the module list: [`docs/architecture.md`](docs/architecture.md).

**Conventions**:
- Queries return data directly; commands return results or `OperationResult<T>`
- Import types from `@/features/{feature}/contracts/` (NOT `@/app/contracts/` or `@/app/lib/types/`)
- Import logic from `@/features/{feature}/services/` (NOT `@/app/lib/services/`)
- Server actions in `src/app/actions/index.ts` delegate to feature commands/queries
- New domain logic goes in `src/features/`, not in actions files

### API

The public API is **`apps/api`** (NestJS). `apps/web`'s `src/app/api/v1/` is
internal, called by `apps/api` only behind `INTERNAL_API_SECRET` — never expose
one directly. API keys are opaque (`sk-<keyId>.<secret>`), live in
ragen-token-vault, and the DB holds only `maskedValue` (ADR-13). Detail:
[`docs/architecture.md`](docs/architecture.md).

### Auth, state, libraries, logging

Better Auth (`src/lib/auth.ts`) with `admin` + `organization` plugins; one org
record (`Organization`, no `InternalOrganization`). Client UI state is Redux
Toolkit via the typed hooks in `src/store/hooks.ts`. Logging is
`@/app/lib/utils/logger`; OTel is a no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT`
is set. Detail on all four, plus what each `src/libs/` module is for:
[`docs/architecture.md`](docs/architecture.md).

### RBAC — Two distinct role hierarchies (never confuse)

| Level | Field | Values | Purpose |
|---|---|---|---|
| **App** | `User.role` | `'admin'`, `'user'` | Platform admin (disk/AI usage dashboards) |
| **Org** | `Member.role` | `'owner'`, `'admin'`, `'member'` | Per-org permissions |

- The vocabulary is `@ragenai/platform-contracts`: `ORG_ROLES`, the `ORG_*_ROLE` constants, `canManageOrg()` (may act), `orgVisibilityScope()` (may see → `DocumentActor.scope`), `canOwnOrg()`, `hasOrgRole()`, `isAppAdmin(user)`. No `isOrgAdmin` — it meant both (ADR-39). `src/lib/auth-access-control.ts` re-exports them, and adds the Better Auth `orgRoles`/`platformRoles` registries; **a new org role goes in both**, and `org-roles.test.ts` asserts they agree.
- `src/lib/auth-guards.ts` — **server-only**: async guards (`requireAppAdmin()`, `requireOrgAdmin()`, `requireOrgOwner()`), cached session/member lookups (`getSession()`, `getActiveMember()`)
- **Never inline a role comparison** — `tests/architecture/role-checks-are-not-inlined.test.ts` fails on `role === 'admin'` outside it. Do NOT duplicate `getActiveMember` in action files.

### Prisma (v7)

One shared `prisma/schema.prisma` for the whole monorepo — each app gets its
client from a `generator` block in that one file, and one `prisma generate` at
the root regenerates all of them. Never add a second schema. Server code imports
from `@/generated/prisma/client`, client components from
`@/generated/prisma/browser`; nothing rewrites one into the other, and
`tests/architecture/client-bundles-stay-browser-safe.test.ts` catches a mistake.
The tenant-scope guard **warns, it does not throw**. Everything else — the
adapter, the paths, why the guard only warns:
[`docs/prisma.md`](docs/prisma.md).

### Document Versions & RAG Optimization

Detail: [`docs/document-versioning.md`](docs/document-versioning.md). Two rules that bite if you miss them: **never re-index a content change with
`runFileEmbeddings`** (it re-parses the stored file, which still holds the
original upload) and **never overwrite the stored file to make it pick up new
text** (that destroys a non-plaintext original). Use
`Workflow.REINDEX_DOCUMENT_VERSION`, which embeds the version text and clears
the previous chunks first.

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
@ragenai/common-ui/*   → apps/web/src/libs/common-ui/*
@ragenai/prisma-client → apps/web/src/libs/db
```

## Key Conventions

- **Environment variables**: one read by several apps belongs in a `@ragenai/env` fragment (ADR-37). Use `httpUrl()` for endpoints — `z.string().url()` accepts `localhost:4318`. Services validate at boot and exit; `apps/web` must not — it serves the setup page.
- **Panel colour and density** (design system v2): semantic tokens
  (`bg-primary`, `text-muted-foreground`), never a literal Tailwind colour —
  `panel-colours-are-tokens-not-literals.test.ts` fails on a ramp step or a hex.
  Why crimson is rationed, and why state never rests on colour alone:
  [`docs/panel-ux-rules.md`](docs/panel-ux-rules.md).
- **Braces required**: always use braces for `if`/`else`/`for`/`while` — no single-line bodies. Enforced by ESLint `curly` in `@ragenai/eslint-config`, so it applies to every workspace, not just `apps/web`.
- **ESM**: `"type": "module"` — all `.js` are ESM. CommonJS scripts use `.cjs`. `moduleResolution: "bundler"` — no deep internal imports (e.g. `langchain/dist/...`).
- Server components by default; client components mark with `'use client'`.
- All API routes use `export const dynamic = 'force-dynamic'`.
- Prisma IDs: `Int` autoincrement `id` (internal) + `publicId` UUID (external/URLs). Better Auth tables keep String IDs.
- All Prisma fields use camelCase with `@map('snake_case')` for DB columns.
- Timestamps use `Timestamptz`; default TZ Europe/Warsaw.
- i18n: `next-intl` (locales: `apps/web/src/app/config.ts`). Use `@/i18n/routing`'s `Link`/`redirect`/`usePathname`/`useRouter`, not `next/link`.
- Tailwind v4 with `@theme` directive in `src/app/[locale]/global.css`. Brand colors: Ragen red `#cb1d3d`, Ragen blue `#252d53`.
- Error classes: `UnauthorizedException`, `NotFoundException`, `LimitExceededException`. Jobs: start them by name through `@ragenai/jobs`, never by importing a handler.
- Pre-commit: lint-staged runs `eslint --fix` + `prettier --write`, dispatching each file to its own workspace in `lint-staged.config.mjs` — add an entry there when you add a workspace. Conventional commits, enforced by commitlint.

## Model Defaults

All six areas, their env vars, defaults and the reasoning behind each:
[`docs/ai-models.md`](docs/ai-models.md). The rules that do not survive being
looked up later:

- **`infra/llm-gateway/routes.yaml` is the source of truth for which models exist**, and a route is not enough on its own — the credentials have to be there too. `npm run gateway:preflight -- --probe` checks both with one real call per configured model.
- **Do not upgrade the rephrase model without explicit approval.** It runs on every question and cost matters.
- **Per-org restriction**: `OrganizationSettings.allowedModels`, empty = no restriction.

## Testing Requirements

All new code must include tests. Vitest + React Testing Library (`jsdom`). Tests live next to code in `__tests__/` directories.

Utilities, Redux reducers and Zod schemas (valid + invalid) get unit tests;
React components get integration tests (render, interaction, state); a new
screen gets at least a Playwright smoke test. A PR adding code with no test is
incomplete. The two most often missed:

- **Workspace packages** (`packages/*`): unit tests beside the source — they run
  in the root `App / Test` job and count toward coverage.
- **Thin bindings / adapters**: a five-line file that injects a logger or picks
  a service name is still the only place that wiring exists, and it fails
  silently when it breaks — test what it wires.

**Vitest and Playwright conventions**: [`docs/testing-conventions.md`](docs/testing-conventions.md).

### E2E Tests (Playwright)

Live in `e2e/`, against a seeded local database with a pre-authenticated test
user. What each file there is for:
[`docs/testing-conventions.md`](docs/testing-conventions.md).

**A test's prefix decides when CI runs it.** A PR runs only `smoke-*` and
`p0-*`, so a `p1`–`p3` test does not gate the PR that breaks it — **anything
that must block a merge goes in `smoke-*` or `p0-*`.** The full naming scheme,
the tiers and how to run each: [`docs/testing-conventions.md`](docs/testing-conventions.md).

### Manual Regression Checklist

`docs/regression-checklist.md` — prioritized P0–P3 scenarios. Use before releases.

## Post-Task Workflow

After modifying or creating files:

1. **Write tests first** — unit/integration tests for all new code (see Testing Requirements above).
2. **Run the gate** — `npm run verify`. It is the one command that covers every workspace; `npx vitest run` alone misses typecheck and the other apps.
3. **Run code review** — `/coderabbit:review` where the plugin is installed, otherwise the `ragen-code-review` skill. On a PR read the CodeRabbit check's *description*: it says `pass` with "Review rate limited" when no review ran.
4. **Changed what a fresh install needs?** A new/renamed env var, a service the app can no longer run without, a changed default model or vector size, a compose change — update `packages/create-ragen-app` in the same PR and **say so in the description**. Nothing else exercises the first-run path; what counts is listed in its [README](packages/create-ragen-app/README.md).
5. **Log a lesson if you hit one** — if you made a nontrivial correction or found a non-obvious gotcha, add/update an entry in [`docs/lessons.md`](docs/lessons.md) (see that file's own instructions).
6. **Would a user notice?** Add a line to [`docs/changelog-notes.md`](docs/changelog-notes.md) — the weekly blog post is written from it, and the effect is easy to name now and expensive to reconstruct on Friday.
