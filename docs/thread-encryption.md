# Thread Message Encryption

Split out of `AGENTS.md` to keep it under Codex's 32,768-byte `project_doc_max_bytes` budget. Reached from that file's Task Router.

Message content is encrypted at rest with **envelope encryption** (AES-256-GCM). Thread titles stay plaintext so they remain searchable.

## Where it lives

**`packages/crypto` (`@ragenai/crypto`) — and nowhere else.** apps/web, apps/api and apps/worker all import it; none of them keeps a copy.

They used to. The same envelope code existed four times, drifted twice, and both drifts failed as a `logger.warn` and a fallback to plaintext rather than as an error: the worker read `ENCRYPTION_MASTER_KEY` as base64 where the others read hex (#979), and its `isEncryptionConfigured()` disagreed with `getKeyProvider()` about which providers counted (#983). Typecheck sees neither — each copy compiles and is internally consistent. See [ADR-02](adrs/02-per-org-kms-keys.md), [ADR-06](adrs/06-thread-message-encryption.md) and [the extraction spec](specs/2026-09-08-one-encryption-package.md).

`tests/architecture/encryption-lives-in-one-package.test.ts` fails the build on a fifth copy — a `KeyProvider` declaration, an AES-GCM cipher, or auth-tag handling outside the package.

Two things that are **not** this, despite living nearby:

- `apps/web/src/libs/crypto/public-link-token.ts` — HMAC-signs a share token; shares the old directory name and nothing else.
- The `crypto-js` AES that encrypts organization API keys (`hashApiKey.ts` and three siblings) — a different algorithm, key and lifetime. The guard is written to match cipher *construction* rather than the word "AES" precisely so these stay out of it.

## Providers

Adding a KMS is one file in `packages/crypto/src/key-provider/`.

| `ENCRYPTION_PROVIDER` | Backend | Needs |
|---|---|---|
| `scaleway` | Scaleway Key Manager — **current** | `SCW_KEY_MANAGER_KEY_ID` + `SCW_API_KEY` |
| `kms` | AWS KMS — legacy, still supported | `AWS_KMS_KEY_ID` + the existing `AWS_*` credentials |
| `local` | Local master key — dev | `ENCRYPTION_MASTER_KEY` |
| unset | Auto-detect, in order: Scaleway → KMS → local | whichever of the above is present |

With none of them set, encryption stays off and local development is plaintext.

`ENCRYPTION_MASTER_KEY` is accepted as **either** a 64-character hex string (what `.env.example` documents) or base64, both decoding to 32 bytes. Hex is tried first and strictly — a hex key is also valid base64 input, decoding to 48 bytes, which is exactly how the worker's copy rejected the documented key as "wrong length" rather than as unparseable.

**The invariant to preserve:** `isEncryptionConfigured()` must agree with `getKeyProvider()` for every input. Callers check the predicate and then call the factory, and `apply-dual-content-mode.ts` wraps the factory in a `try` whose `catch` logs one line and continues *without* encryption. A predicate that says no for a provider the factory supports is therefore not an error — it is a silent downgrade. Both original bugs hid there. Presence is not enough either: `LocalKeyProvider` parses the key in its constructor, so the predicate validates it rather than just checking that it is set.

## How it works

Per-thread DEK from the provider's `GenerateDataKey`; the wrapped DEK is stored base64 in `Thread.encryptedDek`. A per-request DEK cache keeps provider calls down.

Key files:

- `packages/crypto/src/` — `envelope.ts` (the cipher), `key-provider/` (the providers and the factory), `thread-encryption.ts` (`generateThreadKey`, `decryptThreadKey`, `encryptMessages`, `decryptMessageContents`), `master-key.ts`
- `apps/web/src/features/messages/services/commands/create-message-command.ts` — race-safe conditional update
- `apps/web/src/features/threads/services/commands/encrypt-threads-command.ts` and `apps/web/src/app/actions/encrypt-threads.ts` — the backfill

## Consequences

- **Langfuse**: with encryption on, `input`/`output` are omitted from traces — only tags, sessionId and model (`assistant-stream.ts`).
- **Search**: `/v1/internal/threads/search-all` in apps/api matches titles only, for every thread. Message content is not searched whether or not it is encrypted.
- **Admin migration**: `encryptAllThreadsAction()`, app admin only — idempotent and resumable.
