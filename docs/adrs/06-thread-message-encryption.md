# ADR-06: Thread Message Encryption (AWS KMS Envelope Encryption)

**Status:** Accepted
**Date:** 2025-06-01

## Context

Message content in chat threads may contain sensitive user data. At-rest encryption at the database level (e.g., PostgreSQL TDE) encrypts the entire disk but doesn't provide application-level access control or per-tenant key isolation.

## Decision

**AWS KMS envelope encryption** (AES-256-GCM) for `Message.content` at the application level.

### How It Works

1. Each thread gets a unique Data Encryption Key (DEK) via KMS `GenerateDataKey`
2. DEK is encrypted by KMS (Key Encryption Key) and stored as `Thread.encryptedDek` (base64)
3. `Message.content` is encrypted with the plaintext DEK before DB insert
4. On read, encrypted DEK is decrypted via KMS, then messages are decrypted locally
5. DEK cache (per-request) minimizes KMS calls when reading multiple messages from one thread

### Environment Gating

- No `AWS_KMS_KEY_ID` env var → encryption disabled (local development stays plaintext)
- Staging/production: set `AWS_KMS_KEY_ID=arn:aws:kms:region:account:key/key-id`

## Trade-offs

- **Thread titles remain unencrypted** to preserve search functionality
- **Message content search** (`searchAllQuery`) skips content matching for encrypted threads — only title matches returned
- **Langfuse traces** omit `input`/`output` when encryption is enabled (only tags, sessionId, model sent)
- Admin batch migration available via `encryptAllThreadsAction()` (idempotent, resumable)

## Future Consideration

Per-organization KMS keys deferred — see [ADR-02](02-per-org-kms-keys.md).
