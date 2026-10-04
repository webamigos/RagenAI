# ADR-06: Thread Message Encryption (AWS KMS Envelope Encryption)

**Status:** Accepted; the key scheme and "Environment Gating" are superseded —
see the update at the end
**Date:** 2025-06-01

> "No `AWS_KMS_KEY_ID` env var → encryption disabled" and "Staging/production:
> set `AWS_KMS_KEY_ID=…`" are **stale**: the key comes from the provider seam in
> `@ragenai/crypto` (`ENCRYPTION_PROVIDER`), `AWS_KMS_KEY_ID` is only what the
> `kms` provider needs, and a deployed process with no provider refuses to store
> plaintext. Following the gating section as written leaves an install that
> looks configured and does not start, or one that was told to waive the
> requirement. See
> [the update](#update-2026-10-04-the-key-comes-from-the-provider-seam-and-a-deployed-process-requires-one).

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

## Update (2026-10-04): the key comes from the provider seam, and a deployed process requires one

"AWS KMS envelope encryption" was the decision, and the envelope is unchanged:
a DEK per thread, AES-256-GCM, the wrapped DEK in `Thread.encryptedDek`, a
per-request DEK cache. What changed is where the wrapping key comes from and
what happens when there is none.

**The key.** `@ragenai/crypto` has a key-provider seam, chosen by
`ENCRYPTION_PROVIDER`: `scaleway` (Scaleway Key Manager), `kms` (AWS KMS) or
`local` (`ENCRYPTION_MASTER_KEY`). Unset, it auto-detects from whichever
credentials are present, in that order. AWS KMS is one provider of three, named
legacy in the current docs; `AWS_KMS_KEY_ID` is what it needs and no longer the
switch for encryption as a whole. See
[`docs/thread-encryption.md`](../thread-encryption.md) for the providers and the
IAM actions `kms` needs, and
[the environment reference](https://docs.ragen.ai/configuration/environment-reference)
for the settings.

**Environment gating, as it is now** (replacing the section above):

- **Development and test** (`NODE_ENV` `development` or `test`, or a `TARGET_ENV`
  that is not a deployment): no provider is fine, and content is stored in
  plaintext, as the old text said for local development.
- **Anything else — including an unset `TARGET_ENV`, which reads as a
  deployment:** with no provider configured the process refuses to store
  content. `ALLOW_UNENCRYPTED=1` waives that deliberately; it does not rescue a
  provider that is configured but broken, which fails the boot probe and blocks
  the process. The old text had the opposite default: no key meant plaintext, and
  a missing variable in a container went unnoticed.

The reason for the change is on record in
[`docs/lessons/an-encrypted-dek-does-not-record-which-provider-wrapped-it.md`](../lessons/an-encrypted-dek-does-not-record-which-provider-wrapped-it.md)
and the extraction spec
[`2026-09-08-one-encryption-package`](../specs/2026-09-08-one-encryption-package.md):
the envelope code existed four times, drifted twice, and both drifts failed as a
logged warning and a fallback to plaintext. Per-organization keys, which the
Future Consideration above defers to ADR-02, remain deferred.
