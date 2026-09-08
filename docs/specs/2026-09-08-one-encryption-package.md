---
title: One encryption package, so a new KMS provider is one file and not three
status: approved
areas: [security, api, worker, architecture]
adrs: [02, 06, 21, 26, 33, 37]
---

# One encryption package, so a new KMS provider is one file and not three

## TLDR

Envelope encryption exists three times — `apps/web/src/libs/crypto`,
`apps/api/src/crypto`, `apps/worker/src/utils/crypto` — and the copies have
already drifted: the worker supports Scaleway and a local master key but
**not AWS KMS**, so on an AWS deployment it reports encryption as
unconfigured and silently discards the original text of every PII
dual-content document at ingest. This extracts one `packages/crypto` and
closes that gap on the way. The non-obvious part is that nothing needs
re-encrypting: all three copies pack the envelope identically, so the
package is a move, not a format change.

## Problem

Adding Google Cloud KMS or Azure Key Vault today means writing the provider
three times, in three directories, with three sets of tests. That is the
question that prompted this. The answer turned out to be worse than the
question: **the last provider that was added is already missing from one of
the three.**

`apps/worker/src/utils/crypto/key-provider.ts` knows `scaleway` and `local`.
Web and api know `scaleway`, `local` and `kms` (AWS). On a deployment with
`ENCRYPTION_PROVIDER=kms`:

- `getKeyProvider()` in the worker matches neither branch and throws.
- `isEncryptionConfigured()` returns `false`, because its `explicit !== undefined`
  branch treats any unrecognised value as "not configured".

And `isEncryptionConfigured()` is a **silent** gate, not a loud one:

- `activities/documents/apply-dual-content-mode.ts` logs
  `encryption not configured — falling back to destructive mode` and returns
  the masked documents. The organization asked for dual-content PII — masked
  text for retrieval, the original encrypted alongside — and gets masked
  only. **The original is discarded at ingest and cannot be recovered**,
  because the source file has already been parsed into chunks.
- `services/qdrant.ts` skips the decryption branch, so any dual-content chunk
  that did survive is embedded from its masked text.

One `logger.warn` per document is the entire signal. The organization's
setting still says `dual_content`, the admin panel still shows it, and
nothing fails.

The demo deployment runs `ENCRYPTION_PROVIDER=scaleway`, so this is latent
today, not live. It becomes live the day anyone sets AWS.

Three smaller findings from the same sweep, all pointing the same way — AWS
is a second-class provider that was added to two apps and forgotten in the
rest of the machinery:

- **`@ragenai/env`'s `encryption` fragment validates `ENCRYPTION_PROVIDER`,
  `ENCRYPTION_MASTER_KEY` and the three `SCW_*` variables — and no
  `AWS_KMS_KEY_ID`.** So the AWS path is the one path with no boot-time
  validation, in a repo whose ADR-37 exists to make misconfiguration fail at
  boot.
- **`apps/web` imports `@aws-sdk/client-kms` without declaring it.** It
  resolves because the _root_ `package.json` declares it, and the web image
  runs a full root `npm ci`, so this is a phantom dependency rather than a
  live break — but it is exactly the kind that turns into one when someone
  scopes the install or drops the root entry.
- **web and api have not drifted in logic at all.** Diffing the three shared
  files shows only comments and `./key-provider` vs `./key-provider/index`.
  That is the good case, and it will not last: two identical copies stay
  identical only until someone fixes a bug in one.

## Out of scope

- **Key rotation and re-encryption.** Nothing here re-wraps a DEK or rotates
  a master key. Worth its own spec; this one must not change a single stored
  byte.
- **Changing the envelope format.** The format is the compatibility contract
  with every row already encrypted in production. It is pinned by test here,
  not modified.
- **Adding Google Cloud or Azure.** The point is to make that one file. Doing
  it now would mean shipping a provider nobody has credentials to test.
- **`public-link-token.ts`.** It lives in the same directory and is not
  envelope encryption: HMAC-signing a share token, reading
  `PUBLIC_LINK_TOKEN_SECRET` and `apps/web`'s own env helpers. It stays in
  `apps/web`, and the spec says so because "move the crypto directory" would
  otherwise sweep it along.
- **The tenant-scope or storage packages.** Untouched.

## Proposed solution

**`packages/crypto`**, holding the whole envelope: the `KeyProvider`
interface, the three providers, the selection logic, the Scaleway KMS client,
and the content helpers (`encryptContent`, `decryptContent`,
`encryptMessages`, `decryptMessageContents`, `decryptDocument*`, thread-key
generation and unwrapping).

**Broader scope than the providers alone, deliberately.** The narrow version —
extract `KeyProvider`, leave the helpers — would leave
`encryptContent`/`decryptContent` in three copies. Those fifty lines _are_
the format: the 12-byte IV, the 16-byte tag, the concatenation order. A
divergence there is not a wrong number on a dashboard, it is ciphertext one
app cannot read. If anything belongs in one place, it is that.

**And not a shared `apps/*/src` import**, which the repo already rejects: an
app importing another app's source is the coupling ADR-21 removed.

**And not left as three copies with an architecture test comparing them**,
the shape used before ADR-33: that test can only say "they differ", after
someone has already shipped the difference, and it cannot express "the worker
is missing a whole provider".

**The AWS provider loads its SDK lazily.** `@aws-sdk/client-kms` is several
megabytes and the worker image ships without it today. A static import would
put it in every consumer's bundle to serve a provider most deployments do not
use. The provider therefore does `await import('@aws-sdk/client-kms')` on
first use and the SDK is an **optional peer dependency**, so a deployment
that never selects `kms` neither installs nor bundles it. The cost is that
provider construction cannot validate the SDK's presence synchronously —
covered under Failure modes.

**Package shape follows `@ragenai/platform-contracts` exactly** — same
`tsconfig`, same `main`/`types`/`build` fields — because that package is
already consumed by all three apps across three module systems (Next's
bundler, NestJS's `nodenext`, the worker's CJS Jest transform). Copying a
known-good shape is the whole reason to have a precedent.

## Core surfaces touched

| Surface                 | Change                                                                                                               | What catches a mistake                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `packages/crypto` (new) | the interface, three providers, the content helpers, the Scaleway client                                             | its own unit tests, plus each consumer's build                   |
| `apps/web`              | deletes `libs/crypto/{key-provider,thread-encryption,decrypt-*}` and `libs/encryption`; keeps `public-link-token.ts` | its suite; `npm run verify`                                      |
| `apps/api`              | deletes `src/crypto/*` except its spec files, which move                                                             | its Jest suite (ADR-21: separate implementation, separate tests) |
| `apps/worker`           | deletes `utils/crypto/*`; **gains the AWS provider**                                                                 | worker Jest suite; the behaviour change is called out below      |
| `packages/env`          | `encryption` fragment gains `AWS_KMS_KEY_ID` and the AWS endpoint/region                                             | package tests + each app's env parse                             |
| `prisma/schema.prisma`  | **none** — no column changes, no migration                                                                           | n/a                                                              |
| auth / tenant scoping   | none                                                                                                                 | n/a                                                              |

## Data model

**No schema change and no migration.** This is the property that makes the
whole thing safe, and it was verified rather than assumed: `encryptContent`
and `decryptContent` are byte-for-byte equivalent in the worker and in
web/api — same `aes-256-gcm`, same `IV_LENGTH = 12`, same
`AUTH_TAG_LENGTH = 16`, same `[iv, ciphertext, authTag]` packing, same
base64, even the same error string on a short payload. The wrapped-DEK format
in `local-provider.ts` is likewise identical between web and api.

So every `Thread.encryptedDek`, every encrypted message and every
`OrganizationSettings.encryptedPiiDek` written before this change is readable
after it, and vice versa. A partial rollout — one app on the package, two
still on their copies — is therefore safe, which is what lets the phases be
one app at a time.

## Failure modes

- **The AWS SDK is absent when `kms` is selected.** With a lazy import the
  failure moves from install time to first encrypt/decrypt. It must be one
  legible error naming the missing optional peer, thrown once, not an
  unhandled rejection inside a stream. Covered by test with the import mocked
  to reject.
- **The worker starts honouring `ENCRYPTION_PROVIDER=kms`.** This is a
  deliberate behaviour change, and worth stating plainly: on an AWS
  deployment, dual-content PII ingest goes from silently degraded to working.
  Documents ingested _before_ the fix stay masked-only — the originals are
  gone — so the change is not retroactive and nobody should expect the old
  documents to recover.
- **`isEncryptionConfigured()` disagrees between apps mid-rollout.** During
  Phases B–D one app answers with the package's logic and another with its
  own copy. Harmless while the answers agree, which they do for `scaleway`
  and `local`; the only value where they differ is `kms`, and that is the bug
  being fixed. Worth knowing before someone flips a deployment to AWS
  half-way through the rollout — so: do not.
- **The provider singleton.** Each copy caches its instance in a module-level
  `let`. One package still means one instance per process, not one per
  monorepo, which is correct — but the worker's `resetKeyProviderForTests()`
  is part of the public surface its tests use and has to survive the move.
- **A KMS call fails at runtime** (network, revoked key, throttling). Today
  every caller handles this differently; the package does not change that,
  and unifying error handling is explicitly not attempted here — it would mix
  a refactor with a behaviour change.
- **Two apps disagree about which provider is configured** because their env
  differs. Unchanged by this work, but the new `AWS_KMS_KEY_ID` validation
  will now make an AWS-configured deployment fail at boot in a service that
  lacks the variable, where before it failed at first use.

## Phases

Every phase leaves all four applications working, because the copies stay
until the last one.

### Phase A — the package, with no consumers

- [ ] **A1.** `packages/crypto` with the `KeyProvider` interface, the local
      and Scaleway providers, the Scaleway KMS client and the content
      helpers, ported from `apps/web` (the fullest copy). Tests move with
      them.
- [ ] **A2.** The AWS provider, with the lazy `import()` and the optional
      peer dependency.
- [ ] **A3.** A round-trip test pinned to a **fixed ciphertext vector**, not
      just encrypt-then-decrypt: a hardcoded base64 payload and DEK that must
      decrypt to a known string. Encrypt-then-decrypt passes even if the
      format changes on both sides at once, which is precisely the mistake
      that would strand production data.
- [ ] **A4.** `AWS_KMS_KEY_ID` (plus the endpoint and region the provider
      reads) join the `encryption` fragment in `@ragenai/env`.

### Phase B — `apps/web` uses it

- [ ] **B1.** Re-export from the old paths or update the imports, delete
      `libs/crypto/{key-provider,thread-encryption,decrypt-*}` and
      `libs/encryption`, keep `public-link-token.ts`.
- [ ] **B2.** Drop the phantom `@aws-sdk/client-kms` import; the package owns
      it now.

### Phase C — `apps/api` uses it

- [ ] **C1.** Same deletion. Its `thread-encryption.spec.ts` and
      `local-provider.spec.ts` move to the package rather than being deleted
      — they are the only tests of that code anywhere.

### Phase D — `apps/worker` uses it, and gains AWS

- [ ] **D1.** Replace `utils/crypto/*` with the package. `getKeyProvider()`
      and `isEncryptionConfigured()` gain the `kms` branch by construction,
      which closes the silent dual-content degradation.
- [ ] **D2.** A test at the `apply-dual-content-mode` level, not just the
      provider level: with `ENCRYPTION_PROVIDER=kms` set, it must **not** take
      the destructive fallback. That is the bug, stated where it was visible.

### Phase E — make it stay one copy

- [ ] **E1.** An architecture test failing on a `KeyProvider` declaration, an
      `aes-256-gcm` cipher construction, or a KMS client outside
      `packages/crypto`, in the shape of
      `shared-contracts-are-not-recopied.test.ts`.
- [ ] **E2.** A line in ADR-33's family, or a short ADR of its own, recording
      that the envelope format is now single-sourced and why.

## Testing

- **Unit** — the fixed-vector round trip (A3); the provider selection matrix
  over every `ENCRYPTION_PROVIDER` value **including `kms`** and every
  auto-detect combination; the lazy-import failure path; the short-payload
  rejection.
- **Integration** — one encrypt/decrypt through each app's own wiring, in
  each app's own suite, per ADR-21. A package test does not prove apps/api
  resolved the package under `nodenext`.
- **Worker** — D2, plus the existing `pii-encryption` tests moved.
- **Cross-version** — decrypt a payload produced by the _pre-change_ code.
  The fixed vector in A3 is exactly this, which is why it is a vector and not
  a round trip.
- **e2e** — none new. Thread encryption is already exercised by the chat
  path; if it broke, `smoke-*` would fail.

## Rollout and rollback

No migration, so **revert is `git revert` at every phase**, and a phase can
be reverted on its own: an app that goes back to its deleted copy reads the
same ciphertext, because the format is unchanged.

The one-way door is Phase E, which deletes the copies for good — by then B
through D have each been in production, so the risk is spent.

**Deploy order does not matter.** Unlike a schema change, two apps on
different sides of this can run against the same database indefinitely.

The single caveat, repeated from Failure modes because it is the only way to
get hurt: do not switch a deployment to `ENCRYPTION_PROVIDER=kms` while the
rollout is half-done, or the worker will still be the old copy that treats
AWS as unconfigured.
