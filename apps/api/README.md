# Ragen API

Standalone public API service for Ragen AI. Handles API key authentication, rate limiting, and proxies chat requests to apps/web's internal endpoints.

## Tech Stack

- **Framework**: NestJS 11 + TypeScript
- **Database**: PostgreSQL (Prisma with `@prisma/adapter-pg`) — shared with apps/web
- **Auth**: API key validation via ragen-token-vault (timing-safe comparison)
- **Observability**: OpenTelemetry (traces, metrics, logs)
- **Runtime**: Node.js 24

## Local Development

**Prerequisites**: Node.js 24.x, the shared infrastructure running (`docker compose up` at the repo root)

```bash
npm install
cp .env.example .env.local        # Fill in env vars
npm run start:dev                  # http://localhost:3001 (watch mode)
```

Requires apps/web running on port 3000 (chat proxy target) and ragen-token-vault on port 3100 (API key validation).

## Commands

```bash
npm run start:dev    # Dev server with watch mode
npm run build        # Production build (nest build)
npm run lint         # ESLint with auto-fix
npm run format       # Prettier formatting
npm test             # Unit tests (Jest)
npm run test:e2e     # E2E tests
```

### Docker

```bash
docker build -t ragen-api .    # Multi-stage build (node:24-alpine)
# Production: node dist/main.js on port 3001
```

## Architecture

NestJS API with `v1` global prefix. All client-facing endpoints are authenticated via `Authorization: Bearer <key>` header.

### Authentication Flow

API keys use an opaque format: `sk-<keyId>.<secret>` — no organizational context is embedded.

```text
Client (Authorization: Bearer sk-<keyId>.<secret>)
    ↓
ragen-api (ApiKeyGuard)
    ├── Parse keyId from key
    ├── DB lookup: isActive, orgId, projectId, createdBy
    ├── Validate secret against ragen-token-vault (timing-safe)
    └── Build ApiContext from DB record
    ↓
apps/web internal endpoints
    (x-internal-secret + x-org-id, x-user-id, x-project-id)
```

### Modules

| Module | Description |
|--------|-------------|
| **PrismaModule** | Global Prisma client with `@prisma/adapter-pg` |
| **VaultModule** | HMAC-signed HTTP client for ragen-token-vault |
| **CommonModule** | `ApiKeysService`, `ApiKeyGuard` |
| **ChatModule** | Proxies chat to apps/web with SSE streaming support |
| **HealthcheckModule** | Health check |

### Chat Endpoint

`POST /v1/chat` — the primary endpoint for external integrations.

**Request:**
```json
{
  "content": "What is Ragen?",
  "context": "Optional page context",
  "stream": true
}
```

**Headers:** `Authorization: Bearer sk-...`

**Response:** JSON (`{ "text": "..." }`) or SSE stream (`data: {"text":"chunk"}\n\n`).

The chat endpoint proxies to apps/web's internal `/api/v1/chat` route, passing the authenticated context via internal headers protected by a shared secret.

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection (shared with apps/web) |
| `PORT` | `3001` | HTTP port |
| `RAGEN_APP_INTERNAL_URL` | `http://localhost:3000` | apps/web URL for chat proxy (name kept: set per-environment on Railway) |
| `INTERNAL_API_SECRET` | — | Shared secret for apps/api → apps/web calls (must match apps/web) |
| `RAGEN_TOKEN_VAULT_URL` | `http://localhost:3100` | Token vault URL |
| `RAGEN_TOKEN_VAULT_SERVICE_SECRET` | — | HMAC secret for vault auth |
| `WORKER_SECRET_KEY` | — | Secret for internal worker calls |
| `TARGET_ENV` | `local` | `local` / `staging` / `production` |

## Deployment

Deployed on Railway. Uses `railway.toml` for configuration and multi-stage Docker build.

```bash
# Railway private networking (production)
RAGEN_APP_INTERNAL_URL=http://ragen-app.railway.internal:3000
RAGEN_TOKEN_VAULT_URL=http://ragen-token-vault.railway.internal:3100
```
