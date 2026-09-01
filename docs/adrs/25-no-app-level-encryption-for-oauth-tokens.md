# ADR-25: No Application-Level Encryption for MCP OAuth Tokens

**Status:** Accepted
**Date:** 2026-03-13

> Migrated 2026-08-31 from the legacy root `adr/` directory (where it was
> numbered 0003) into `docs/adrs/`, which is now the single location for ADRs.
> Only the header format changed; the decision and its rationale are verbatim.
> The `McpOAuthToken` model still carries `access_token`, `refresh_token`,
> `client_secret` and `code_verifier` as plaintext columns, so this decision is
> still in force.

## Context

When implementing the `McpOAuthToken` model for storing OAuth tokens from external MCP providers (ClickUp, HubSpot, Fireflies), we initially added AES application-level encryption (via `encryptApiKey`/`decryptApiKey`) for `access_token`, `refresh_token`, `client_secret`, and `code_verifier` fields.

We reconsidered whether this encryption provides meaningful security.

## Decision

We will **not** use application-level encryption for OAuth tokens stored in `McpOAuthToken`. Tokens are stored in plaintext in PostgreSQL.

### Rationale

1. **No separate security boundary.** The AES encryption key (`SECRET_KEY`) is an environment variable on the same server that holds the database credentials. An attacker who gains database access almost certainly has access to env vars too, making decryption trivial.

2. **OAuth tokens are inherently short-lived.** Access tokens typically expire within 1 hour. Refresh tokens can be revoked by the provider. Leaked tokens have a limited blast radius compared to long-lived API keys.

3. **Infrastructure-level encryption is sufficient.** Railway PostgreSQL (and most managed database providers) provide disk-level encryption at rest. This protects against physical access without application complexity.

4. **Complexity cost.** Application-level encryption adds encrypt/decrypt overhead on every MCP tool invocation, makes debugging harder, and introduces risk of double-encryption bugs or key rotation issues.

## Consequences

- OAuth tokens are readable by anyone with direct database access (same as session tokens, user data, etc.)
- If compliance requirements (SOC2, HIPAA) later mandate application-level encryption, we should revisit this decision and use a dedicated KMS (e.g., AWS KMS, HashiCorp Vault) rather than a co-located symmetric key
- The existing `encryptApiKey`/`decryptApiKey` utilities remain available for other use cases where a separate security boundary exists
