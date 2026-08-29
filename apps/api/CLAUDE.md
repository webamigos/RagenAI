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

Uses Prisma with `@prisma/adapter-pg` (same pattern as ragen-app). Schema at `prisma/schema.prisma` is a copy of ragen-app's schema. `PrismaModule` is global — inject `PrismaService` and access `prismaService.client` for queries.

### Authentication & Guards

Two auth mechanisms, both using timing-safe comparison:
- **ApiKeyGuard** (`Authorization: Bearer` header) — for client-facing endpoints. Parses `keyId` from the opaque key (`sk-<keyId>.<secret>`), queries DB for `isActive`/org/project context, validates secret against Vault, and attaches `ApiContext` to the request. Updates `lastUsedAt` (fire-and-forget). Returns `403` for deactivated keys.
- **WorkerSecretGuard** (`x-worker-secret` header) — for internal worker-to-API calls (e.g., ai-usage reporting).

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
- **DocumentsModule** — Document management.
- **AssistantsModule** — Assistant CRUD.
- **QueryModule** — RAG query endpoint (stub — TODO: integrate RAG chain).
- **AiUsageModule** — AI usage reporting from workers (stub — TODO: integrate Prisma).
- **HealthcheckModule** — Health check endpoint.

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
- `TARGET_ENV` — `local` | `staging` | `production` (controls rate limits)

## Style

- Prettier: single quotes, trailing commas
- ESLint: `@typescript-eslint/no-explicit-any` is off; `no-floating-promises` and `no-unsafe-argument` are warnings
- DTOs use `class-validator` + `class-transformer` decorators
