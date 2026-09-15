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

`kms` needs exactly two actions on the key — `kms:GenerateDataKey` and
`kms:Decrypt` — which is the `KmsEnvelopeEncryption` statement in
[`aws-iam-policy.json`](aws-iam-policy.json). Both, not one: a principal
allowed to wrap but not unwrap writes messages nobody can ever read back, and
that failure surfaces on the first *read* rather than at configuration time.
`KmsKeyProvider` names the key on decrypt as well as on generate, so a policy
scoped to a single key id is the boundary it appears to be.

## Production requires a key provider

Local dev being plaintext used to also mean a deployed environment with a
missing provider silently ran plaintext — indistinguishable from a laptop,
and directly contradicting a customer-facing security claim ("without a
configured key provider, the system will not start"). `isEncryptionRequired()`
(`@ragenai/crypto`) now says which is which: `false` under a dev/test
`NODE_ENV`, `true` for any deployed `TARGET_ENV` (including an unset or blank
one — read as a forgotten deployment, not an excuse, the same fail-safe
reading `apps/worker`'s `isMasterKeyRequired` already used for
`LITELLM_MASTER_KEY`). `getEncryptionStartupStatus()` combines that with
`isEncryptionConfigured()` and the `ALLOW_UNENCRYPTED=1` opt-out into one of
`'ok' | 'bypassed' | 'blocked'`, and is the single thing every enforcement
point below reads — never a second copy of the required/bypassed branch.

Enforced in two independent ways:

- **The write path itself** (`assertEncryptionAvailable()`): every content
  write that branches on `isEncryptionEnabled()` — `maybeEncryptContent()`
  (messages), `createDocumentCommand()`/`updateDocumentContentCommand()`
  (apps/web), and their apps/api equivalents in `messages.service.ts` and
  `files.service.ts` — throws `EncryptionRequiredError` instead of silently
  falling through to plaintext when `getEncryptionStartupStatus()` is
  `'blocked'`. This is the part that actually prevents the data-safety hole,
  independent of whether anyone is looking at a screen.
- **Boot-time visibility.** apps/api (`main.ts`) checks before
  `NestFactory.create()` and calls `process.exit(1)` with a clear message if
  blocked — the same convention it already uses for a bad env parse. apps/web
  cannot do that (it serves the first-run setup page — see `AGENTS.md`, "Key
  Conventions"), so `[locale]/layout.tsx` instead renders
  `EncryptionRequiredScreen` in place of the whole app when blocked; the
  container keeps running (health checks stay green) but nothing is usable.

`ALLOW_UNENCRYPTED=1` is the explicit, conscious opt-out for a deployment that
has decided to run without encryption anyway. It is logged once per boot as a
`critical` `ENCRYPTION_REQUIREMENT_BYPASSED` security event (not per message —
`assertEncryptionAvailable()` itself is silent about the bypass; only
`apps/web`'s `instrumentation.ts` and `apps/api`'s `main.ts` log it, each
exactly once at startup).

`ENCRYPTION_MASTER_KEY` is accepted as **either** a 64-character hex string (what `.env.example` documents) or base64, both decoding to 32 bytes. Hex is tried first and strictly — a hex key is also valid base64 input, decoding to 48 bytes, which is exactly how the worker's copy rejected the documented key as "wrong length" rather than as unparseable.

### Set is not the same as usable

`isEncryptionConfigured()` answers whether the variables are *set*. Both halves
of a Scaleway configuration can be present and the key still refuse every call:
an IAM application that may not use that key, a key id belonging to another
project, a `SCW_KEY_MANAGER_REGION` that does not hold it. All three return the
same `403 permissions_denied`, and the first write is where they surface —
which is why `demo.ragen.ai` spent days answering `unknown-error` to every
question (see [the lesson](lessons/a-configured-kms-key-can-still-refuse-every-write.md)).

`probeEncryptionProvider()` closes that: one throwaway data key, wrapped and
then unwrapped — two calls, because encrypt and decrypt are separate
permissions and a principal that may wrap but not unwrap writes messages nobody
can read back. It is called from `apps/web`'s `instrumentation.ts` and
`apps/api`'s `main.ts`, before either reads `getEncryptionStartupStatus()`, and
never throws.

The verdict splits by whether a restart could plausibly help:

- **`misconfigured`** — any 4xx that is not 408 or 429, an AWS refusal, a
  malformed response, or a round trip that returns different bytes. Cached, and
  `getEncryptionStartupStatus()` reads it as `'blocked'`: the blocking screen in
  `apps/web`, `process.exit(1)` in `apps/api`. **`ALLOW_UNENCRYPTED=1` does not
  waive it** — that flag waives the *requirement*, not a broken provider, and
  since `isEncryptionEnabled()` stays true the writes would fail anyway; saying
  `'bypassed'` would promise a plaintext fallback that does not exist.
- **`unavailable`** — timeout, 5xx, throttling, a socket that never opened.
  Logged and ignored, because stranding a working deployment behind a blocking
  screen over one bad second at boot is the worse trade.
- **`skipped`** — no provider configured. Already the existing branch's
  question, and it knows about `isEncryptionRequired()` and the opt-out.

A process that never probes (the worker, every test) behaves exactly as it did
before. `SCW_API_KEY` is shared with object storage and with Scaleway inference,
each needing different IAM permission sets — so re-scoping it for one product is
a live way to break the other two.

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
