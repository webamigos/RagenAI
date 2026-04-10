# ADR-13: Opaque API Keys with DB-Backed Context

**Status:** Accepted
**Date:** 2026-04-10

## Context

The original API key design (circa early 2025) embedded organizational context directly in the key:

```
sk-<base64url( 32-random-bytes orgId userId projectId keyId )>
```

This was convenient because the system could extract `orgId`, `userId`, and `projectId` from the key itself without a database lookup. However, with ragen-api becoming a public-facing service shared with external developers, several problems emerged:

1. **Information leakage** — anyone who base64-decoded the key could read internal org/user/project UUIDs, revealing data model structure and enabling ID enumeration.
2. **Stale context** — if an API key's project was changed in the database, the old key still carried the original projectId. The guard trusted the key's embedded data without cross-checking the DB.
3. **Missing `isActive` check** — the ragen-api guard validated the key against the vault but never checked the `isActive` flag in the database, so deactivated keys kept working.
4. **No `lastUsedAt` tracking** — usage telemetry was lost when auth moved from ragen-app to ragen-api.
5. **No internal endpoint protection** — ragen-app's `/api/v1/chat` trusted context headers (`x-org-id`, `x-user-id`, `x-project-id`) without any authentication, making it vulnerable to direct access if the reverse proxy was misconfigured.

## Decision

### 1. Opaque key format

API keys no longer embed any context. New format:

```
sk-<keyId>.<random-secret>
```

- `keyId` — the UUID primary key from the `api_keys` table (used for DB lookup)
- `random-secret` — 32 bytes of `crypto.randomBytes`, base64url-encoded (used for vault validation)

The keyId is not sensitive — it's a lookup identifier, not a secret. The secret portion provides the actual authentication.

### 2. DB-backed context resolution

On each request, the `ApiKeyGuard` in ragen-api:

1. Parses `keyId` from the key (splits on `.`)
2. Queries the `api_keys` table for `isActive`, `organizationId`, `projectId`, `createdBy`
3. Rejects deactivated keys (`isActive = false`) with `403 Forbidden`
4. Validates the full key against ragen-token-vault (timing-safe comparison)
5. Builds `ApiContext` from the **database record**, not from the key
6. Fire-and-forget updates `lastUsedAt`

This means context always reflects the current DB state, not what was true at key-creation time.

### 3. Internal endpoint protection

Communication between ragen-api and ragen-app uses a shared secret (`INTERNAL_API_SECRET`) sent as the `x-internal-secret` header. The ragen-app `/api/v1/chat` route verifies this secret with timing-safe comparison before processing any request. CORS headers were removed since this endpoint is internal-only.

### 4. Schema cleanup

The `hashedValue` column on `api_keys` (a vestige of the old bcrypt-based validation) has been dropped. Keys are validated exclusively via ragen-token-vault.

## Consequences

### Positive

- **No information leakage** — keys reveal only the keyId (a UUID), not org/user/project structure
- **Always-current context** — DB lookup ensures deactivated keys are rejected and project changes are reflected immediately
- **Usage tracking** — `lastUsedAt` is updated on every authenticated request
- **Defense in depth** — internal endpoints require a shared secret, not just context headers
- **Follows industry standard** — matches how Stripe (`sk_live_*`), OpenAI (`sk-proj-*`), and other APIs structure keys

### Negative

- **Extra DB query per request** — each API call now requires a `findUnique` on `api_keys`. Mitigated by the fact that the UUID primary key lookup is an index scan, and the vault HTTP call (which was already present) dominates latency.
- **Breaking change** — existing API keys (with embedded context) are incompatible with the new format. All keys must be regenerated. Since the API is not yet in production use, this has no customer impact.

## Key files

| File | Purpose |
|------|---------|
| `ragen-app: src/features/organizations/services/commands/create-api-key-command.ts` | Key generation (`sk-keyId.secret`) |
| `ragen-api: src/common/services/api-keys.service.ts` | Key parsing and vault validation |
| `ragen-api: src/common/guards/api-key.guard.ts` | DB lookup, isActive check, context resolution, lastUsedAt |
| `ragen-api: src/chat/chat.service.ts` | Passes internal secret + context headers to ragen-app |
| `ragen-app: src/app/api/v1/chat/route.ts` | Verifies internal secret, reads context headers |
