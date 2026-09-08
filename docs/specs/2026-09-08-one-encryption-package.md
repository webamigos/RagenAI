---
title: One encryption package, so a new KMS provider is one file and not three
status: approved
areas: [security, api, worker, architecture]
adrs: [02, 06, 21, 26, 33, 37]
---

# One encryption package, so a new KMS provider is one file and not three

## TLDR

Envelope encryption exists three times — `apps/web/src/libs/crypto`,
`apps/api/src/crypto`, `apps/worker/src/utils/crypto` — and the copies drifted
twice without anyone noticing, because the way they fail is a `logger.warn`
and a fallback rather than an error. This extracts `@ragenai/crypto`. The two
known divergences are being fixed separately in #979, deliberately: with them
gone, this is a **pure move with no behaviour change**, which is the only kind
of refactor worth doing to code that holds the key to production data.

## Problem

Adding Google Cloud KMS or Azure Key Vault means writing the provider three
times, in three directories, with three sets of tests. That is the question
that prompted this spec. Checking whether it was a real risk or a theoretical
one produced two live bugs, which is the answer.

**The worker read the master key in an encoding nothing else uses.**
`.env.example` documents a 64-character hex string, `apps/web` and `apps/api`
require exactly that, and `inspect-environment.ts` repeats it. The worker
decoded base64 and required 32 bytes. A 64-character hex string is valid
base64 input and decodes to 48, so the documented key failed the _length_
check — the two forms were mutually exclusive and no single value satisfied
both apps. This affected `ENCRYPTION_PROVIDER=local`, the configuration a
self-hoster follows.

**The worker had no AWS KMS provider at all**, where web and api have had one
since before the monorepo merge.

Both failed the same way, and that shape is the real subject of this spec:
`isEncryptionConfigured()` is a predicate, not a guard, and
`apply-dual-content-mode.ts` wraps the provider call in a `try` whose `catch`
logs one line and returns the masked documents. So a provider the worker
cannot construct does not raise. It quietly drops the encrypted original from
every ingest while `OrganizationSettings.piiIngestionMode` still reads
`dual_content`, the admin panel still shows it, and nothing fails.

**Not permanent damage, and the distinction matters for how urgent this is.**
Masking happens in memory; the uploaded file survives ingest — only the local
scratch copy is removed (`parse-and-embed.ts` calls `deleteFileFromTmp`),
which is why `bulkReembedFilesAction` exists and works. So the encrypted
originals are absent from the chunks until an operator fixes the
configuration and re-embeds. It is a re-ingest, not a data-loss incident. An
earlier draft of this spec called it unrecoverable; that was wrong.

Both are fixed in **#979**, ahead of this work and independently of it.

Two more findings, recorded because the package has to carry them and because
they show the same second-class treatment:

- **`@ragenai/env`'s `encryption` fragment omits `AWS_KMS_KEY_ID`** — and
  `apps/worker`'s schema does not merge that fragment at all, so the worker
  validates none of these variables at boot.
- **The worker's Scaleway client is the better one.** It has a 10-second
  `AbortController` timeout with a legible "timed out after Xms" error and
  checks the returned DEK is 32 bytes. `apps/web`'s has neither, on the same
  network call. Any port must take the union, not the file with the most
  callers.

And the good news, which sets the scope: **web and api have not drifted in
logic at all.** Diffing all seven shared files shows only comments and
`./key-provider` vs `./key-provider/index`. Two identical copies stay
identical exactly until someone fixes a bug in one of them.

## Out of scope

- **Key rotation and re-encryption.** Nothing here re-wraps a DEK or rotates
  a master key.
- **Changing the envelope format.** It is the compatibility contract with
  every row already encrypted in production. Pinned by test here, not
  modified.
- **Adding Google Cloud or Azure.** The point is to make that one file.
- **Making the silent fallback loud.** `applyDualContentMode` degrades
  quietly on four distinct causes: encryption unconfigured, no DEK row, the
  DEK decrypt throwing, and a per-document encrypt throwing. #979 removes two
  _causes_; none of this removes the _silence_. Turning a degraded ingest
  into a failed one, or into something visible on the document, is a product
  decision about ingest behaviour and belongs in its own spec. Named here so
  this one is not read as fixing it.
- **`public-link-token.ts`.** It shares the directory and is not envelope
  encryption: HMAC-signing a share token with a 24-hour TTL, reading
  `PUBLIC_LINK_TOKEN_SECRET` and `apps/web`'s own env helpers. It stays.

## Proposed solution

**`packages/crypto`, published as `@ragenai/crypto`**, holding the whole
envelope: the `KeyProvider` interface, the three providers, the selection
logic, the Scaleway KMS client, and the content helpers (`encryptContent`,
`decryptContent`, `encryptMessages`, `decryptMessageContents`,
`decryptDocument*`, thread-key generation and unwrapping).

**Providers and helpers together, not providers alone.** The narrow version
would leave `encryptContent`/`decryptContent` in three copies. Those fifty
lines _are_ the format — the 12-byte IV, the 16-byte tag, the concatenation
order. A divergence there is not a wrong number on a dashboard, it is
ciphertext one app cannot read.

**And not three copies with an architecture test comparing them**, the shape
used before ADR-33: such a test can only say "they differ", after the
difference has shipped, and cannot express "the worker is missing a whole
provider" — which is the failure that actually happened.

**`@aws-sdk/client-kms` is a real dependency, not an optional peer.** An
earlier draft proposed an optional peer with a lazy `import()`, to keep
several megabytes out of images that use Scaleway. That would not have
worked: `apps/worker/Dockerfile` installs with
`npm ci --workspace=@webamigos/ragen-worker …`, which resolves the worker's
own manifest and not the root's, so an optional peer would be absent from the
image and the lazy import would throw `MODULE_NOT_FOUND` — inside the same
`try/catch`, producing the identical silent fallback with a different log
line. Worse, the test would have passed on a developer machine, where the
root hoists the SDK. #979 settles this by declaring it in `apps/worker`; the
package declares it too, and the cost is one lockfile line because the SDK is
already in the tree for `apps/api`.

**Package shape copies `@ragenai/platform-contracts` exactly** — same
`tsconfig`, same `main`/`types`/`build` fields — because that package is
already consumed by all three apps across three module systems (Next's
bundler, NestJS's `nodenext`, the worker's CJS Jest transform).

## Core surfaces touched

| Surface                  | Change                                                                                                               | What catches a mistake                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `packages/crypto` (new)  | the interface, three providers, content helpers, the Scaleway client                                                 | its own unit tests, plus each consumer's build                  |
| `apps/web`               | deletes `libs/crypto/{key-provider,thread-encryption,decrypt-*}` and `libs/encryption`; keeps `public-link-token.ts` | its suite; `npm run verify`                                     |
| `apps/api`               | deletes `src/crypto/*`; its two spec files move to the package                                                       | its Jest suite (ADR-21: separate implementation)                |
| `apps/worker`            | deletes `utils/crypto/*`                                                                                             | worker Jest suite                                               |
| `packages/env`           | `encryption` fragment gains the AWS variables **and a refinement**; the worker's schema merges the fragment          | package tests + each app's env parse                            |
| `apps/worker/Dockerfile` | the new workspace joins four hand-maintained lists                                                                   | `tests/architecture/dockerfile-package-build-order.test.ts`     |
| `lint-staged.config.mjs` | an entry for the new workspace                                                                                       | `tests/architecture/lint-staged-covers-every-workspace.test.ts` |
| `prisma/schema.prisma`   | **none** — no column changes, no migration                                                                           | n/a                                                             |
| auth / tenant scoping    | none                                                                                                                 | n/a                                                             |

The Dockerfile and lint-staged rows are not incidental. `apps/worker/Dockerfile`
enumerates every workspace package in four places — the manifest `COPY`, two
`npm ci` invocations and an ordered build chain — and its own comment warns
that missing one produces a build failure naming a package nobody touched.
`apps/mcp/Dockerfile` has the same shape.

## Data model

**No schema change and no migration.** This is what makes the whole thing
safe, and it was verified rather than assumed: `encryptContent` and
`decryptContent` are byte-for-byte equivalent in all three copies — same
`aes-256-gcm`, `IV_LENGTH = 12`, `AUTH_TAG_LENGTH = 16`, `[iv, ciphertext,
authTag]` packing, same base64, down to the same error string on a short
payload. The wrapped-DEK format in `local-provider.ts` matches between web
and api.

**The master-key encoding is the one decision the package inherits rather
than copies.** #979 makes the worker accept hex first and strictly, then
base64; the package takes that behaviour, because accepting both is what lets
a deployment configured either way keep working. Safe in both directions: the
worker only ever unwraps, so no wrapped DEK exists that was produced under an
encoding the package would now read differently.

Every `Thread.encryptedDek`, every encrypted message and every
`OrganizationSettings.encryptedPiiDek` written before this change is readable
after it, and vice versa — which is what lets the phases be one app at a
time.

## Failure modes

- **The new workspace is missing from a Dockerfile list.** The image build
  fails naming an unrelated package; the architecture test catches it first
  if it is run. This is the most likely way this work breaks a deploy.
- **A KMS call fails at runtime** (network, revoked key, throttling). Each
  caller handles this differently today and the package does not change that.
  Unifying error handling here would mix a refactor with a behaviour change.
- **The provider singleton.** Each copy caches its instance in a module-level
  `let`. One package still means one instance per process, which is correct —
  but the worker's `resetKeyProviderForTests()` is part of the surface its
  tests use and has to survive the move.
- **Mid-rollout disagreement.** During B–D one app answers with the package
  and another with its own copy. After #979 the answers agree for every
  provider value, which is precisely why that PR goes first; before it, they
  did not.
- **Test mocks pointing at deleted paths.** Six `apps/web` test files call
  `vi.mock('@/libs/crypto/…')`. Vitest does not error on a mock for a module
  nobody imports, so rewriting imports without updating them would silently
  start exercising real crypto in tests that think they stubbed it. This is
  why Phase B picks one migration strategy rather than offering two.
- **Boot validation lands where the bug is not.** Adding `AWS_KMS_KEY_ID` to
  the fragment adds an _optional_ field; nothing fails at boot without a
  `requiredForProvider(...)` refinement, and the worker does not merge the
  fragment at all. Both are explicit steps below, or A4 delivers validation
  only to the two apps that already work.

## Phases

Every phase leaves all four applications working, because the copies stay
until the last one. **#979 lands first** — it is not part of this spec, and
this spec is a pure move only because it does.

### Phase A — the package, with no consumers

- [ ] **A1.** `packages/crypto` (`@ragenai/crypto`) with the `KeyProvider`
      interface, the three providers, the selection logic and the content
      helpers. Ported as the **union** of the copies, not from whichever is
      longest: web's provider set, the worker's Scaleway timeout and 32-byte
      DEK check, and #979's master-key parser. Existing tests move with them —
      from `apps/web` (three files), `apps/api` (two spec files) and
      `apps/worker` (its key-provider and pii-encryption suites).
- [ ] **A2.** `@aws-sdk/client-kms` as a real dependency of the package.
- [ ] **A3.** A round-trip test pinned to a **fixed ciphertext vector** — a
      hardcoded base64 payload and DEK that must decrypt to a known string.
      Encrypt-then-decrypt passes even if the format changes on both sides at
      once, which is the mistake that would strand production data.
- [ ] **A4.** `lint-staged.config.mjs` gains the workspace, and the
      `encryption` fragment gains `AWS_KMS_KEY_ID`, `AWS_ENDPOINT_URL` and
      `AWS_DEFAULT_REGION`.
- [ ] **A5.** A `requiredForProvider(env, ctx, 'ENCRYPTION_PROVIDER', 'kms',
    ['AWS_KMS_KEY_ID'])` refinement, following the `STORAGE_PROVIDER`/`s3`
      precedent, **and** `.merge(fragments.encryption)` in
      `apps/worker/src/validateEnvVars.ts`. Without both, A4 is decoration.
      Note AGENTS.md's rule that `apps/web` must not exit at boot.

### Phase B — `apps/web` uses it

- [ ] **B1.** Update the imports at every call site — not re-export shims,
      which would leave the old paths alive and the move half-done. Delete
      `libs/crypto/{key-provider,thread-encryption,decrypt-*}` and
      `libs/encryption`; keep `public-link-token.ts`.
- [ ] **B2.** Repoint the six `vi.mock('@/libs/crypto/…')` calls, or those
      tests silently stop stubbing.

### Phase C — `apps/api` uses it

- [ ] **C1.** Same deletion. Its `thread-encryption.spec.ts` and
      `local-provider.spec.ts` move to the package in A1.
- [ ] **C2.** One encrypt/decrypt test through apps/api's own wiring, so its
      suite still proves the package resolves under `nodenext` (ADR-21).

### Phase D — `apps/worker` uses it

- [ ] **D1.** Replace `utils/crypto/*` with the package. A pure move: #979
      has already given the worker both the hex parser and the AWS provider,
      so nothing about its behaviour changes here.
- [ ] **D2.** The Dockerfile's four lists, and the same check for
      `apps/mcp/Dockerfile` if it ends up depending on the package.

### Phase E — make it stay one copy

- [ ] **E1.** An architecture test failing on a `KeyProvider` declaration or
      an `aes-256-gcm` cipher construction outside `packages/crypto`. It needs
      its allowlist decided here, not during implementation: test fixtures
      build ciphers directly (`apps/worker/.../__tests__/key-provider.test.ts`),
      and the unrelated `crypto-js` AES used for organization API keys
      (`hashApiKey.ts` and its three siblings) must not match.
- [ ] **E2.** `docs/thread-encryption.md` — the Task Router's entry for this
      area — describes the provider set and needs the new home recorded.

## Testing

- **Unit** — the fixed-vector round trip (A3); the provider selection matrix
  over every `ENCRYPTION_PROVIDER` value including `kms`, plus every
  auto-detect combination; both master-key encodings; the short-payload
  rejection; the Scaleway timeout.
- **The gate invariant**, carried over from #979: for every provider,
  `isEncryptionConfigured()` returning true must mean `getKeyProvider()`
  constructs, and false must mean it throws. A gate that says no for a
  provider the factory supports is a silent fallback, and that is how both
  original bugs hid.
- **Integration** — one encrypt/decrypt through each app's own wiring, in
  each app's own suite. A package test does not prove `apps/api` resolved the
  package under `nodenext`.
- **Cross-version** — decrypt a payload produced by the pre-change code. A3
  is exactly this, which is why it is a vector and not a round trip.
- **e2e** — none new. Thread encryption is already exercised by the chat
  path.

## Rollout and rollback

No migration, so **revert is `git revert` at every phase**, and a phase can be
reverted alone: an app that goes back to its deleted copy reads the same
ciphertext.

The one-way door is Phase E, which deletes the copies for good. By then B
through D have each been in production.

**Deploy order does not matter** — unlike a schema change, two apps on
different sides of this can run against the same database indefinitely. That
holds only because #979 landed first; before it, `local` and `kms` meant
different things in different apps.
