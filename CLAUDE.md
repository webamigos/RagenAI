# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Start Next.js dev server
npm run build            # Production build
npm run lint             # ESLint
npm run test             # Vitest (unit tests, watch mode)
npx vitest run           # Vitest (single run, no watch)
npx vitest run path/to/file  # Run a single test file
npm run test:e2e         # Playwright E2E tests
npm run test:e2e:ui      # Playwright in UI mode
npm run storybook        # Storybook on port 6006
npm run generate:types   # Regenerate Prisma client types (run after schema changes)
npm run db:seed          # Seed database (uses .env.local)
```

## Architecture

**Stack**: Next.js 15 (App Router) + React 18 + TypeScript + Tailwind CSS 4 + PostgreSQL (Prisma) + Redis (Upstash)

**What it does**: RAG (Retrieval Augmented Generation) AI chat application with multi-provider LLM support, document knowledge bases, and a public API.

### Routing & Layouts

Routes are locale-prefixed (`/en/...`, `/pl/...`) via `next-intl`. All UI routes live under `src/app/[locale]/`:

- `(panel)/` — Authenticated app: threads, assistants, settings, documents, projects
- `(auth)/` — Sign-in, sign-up, forgot password, etc.
- `public/` — Public-facing assistant chat widgets

Middleware (`src/middleware.ts`) handles i18n routing and session cookie checks. Actual auth verification happens in server components/layouts, not middleware.

### API

REST API at `src/app/api/v1/` with route handlers. Key subdirectories:
- `__logic__/` — Cross-cutting concerns: `guards/` (API key validation, rate limiting), `services/` (error handling, DB), `context/` (request context extraction), `dtos/`, `types/`, `filters/`
- `threads/`, `assistants/`, `documents/`, `auth/`, `healthcheck/`, `query/`

API authentication uses `x-api-key` header → `apiKeyGuard()` → returns `ApiContext` with `orgId`, `userId`, `projectId`.

The app can run in API-only mode (`IS_API_MODE=1`) which rewrites `/v1` → `/api/v1`.

### Auth

Better Auth (`src/lib/auth.ts`) with Prisma adapter. On user creation, a hook auto-creates an organization, internal organization, and default project. Dual org system: Better Auth `Organization` for membership management + Ragen `InternalOrganization` for app-specific data (projects, API keys, subscriptions).

### State Management

- **Redux Toolkit** (`src/store/`): Client UI state — sidebar, assistant config, threads list, voice mode. Typed hooks in `src/store/hooks.ts`.
- **React Context**: `AssistantSettingsContext`, `FilesContext`, `OnboardingContext`, `SearchThreadsContext`
- **Server state**: Prisma queries in server components and server actions (`src/app/actions/index.ts`)

### Libraries (`src/libs/`)

- `llm/` — Chat completion & embeddings factories supporting OpenAI, Anthropic, Google, Bedrock, Ollama, OpenRouter, Fireworks, Azure
- `chains/` — LangChain RAG chains
- `document-loaders/` — PDF, EPUB, Markdown, SRT, URL parsing
- `db/` — Prisma client singleton (aliased as `@ragenai/prisma-client`)
- `temporal/` — Temporal.io client for async document processing workflows
- `payments/` — Stripe integration
- `sse/` — Server-Sent Events for streaming
- `tui/` — Tailwind UI component library (aliased as `@ragenai/tui`)
- `common-ui/` — Shared UI utilities (aliased as `@ragenai/common-ui`)

### Document Processing Pipeline

Upload → S3 → Temporal worker (separate `ragen-worker` repo) → Parse → Generate embeddings → Store in Qdrant vector DB. Status tracked via `ParsingStatus`/`EmbeddingStatus` enums in Prisma.

### Server Actions

Located in `src/app/actions/index.ts` and co-located with components. All instrumented with Sentry tags. Used for: messaging, file operations, thread management, org settings.

## Path Aliases

```
@/*                    → src/*
@/temporal/*           → temporal/src/*
@ragenai/common-ui/*   → src/libs/common-ui/*
@ragenai/tui/*         → src/libs/tui/*
@ragenai/prisma-client → src/libs/db
```

## Key Conventions

- Server components by default; client components marked with `'use client'`
- All API routes use `export const dynamic = 'force-dynamic'`
- Prisma schema uses `uuid` for IDs, `cuid` for `public_id` fields
- Database timestamps use `Timestamptz` (timezone-aware), default timezone is Europe/Warsaw
- i18n: English (`en`) and Polish (`pl`) via `next-intl`
- Styling: Tailwind CSS v4 with custom theme in `src/app/[locale]/global.css` using `@theme` directive; custom colors (Ragen red `#cb1d3d`, Ragen blue `#252d53`)
- Components organized by feature under `src/app/components/`
- Custom error classes: `UnauthorizedException`, `NotFoundException`, `LimitExceededException`
- Temporal workflows: use string names, not function imports (workflow definition limitation)
- Logging: Pino (server) with Sentry integration; webpack replaces server logger with client logger on client builds
- Commit messages follow conventional commits (commitlint enforced via Husky)
