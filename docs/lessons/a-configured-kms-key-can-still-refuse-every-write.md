---
title: 'A configured KMS key can still refuse every write, and the app only finds out one message at a time'
modules: ['web', 'api', 'crypto']
areas: ['security']
topics:
  [
    'encryption',
    'scaleway',
    'key-manager',
    'iam',
    'boot-checks',
    'fail-late',
    'demo',
  ]
---

# A configured KMS key can still refuse every write, and the app only finds out one message at a time

**Context**: `demo.ragen.ai` answered questions for days and then stopped. The
toast said *"Wystąpił nieoczekiwany błąd podczas przetwarzania Twojego
zapytania"* — `unknown-error`, the catch-all `SseExceptionFilter` produces for
any non-`ChainError`. Nothing about the message suggested encryption, a key, or
a provider; the natural first suspects were the model gateway and the org's
spend ceiling, both of which the demo spec names as likely failure modes. The
logs said something else:

```
Scaleway Key Manager generate-data-key failed (403):
  {"details":[{"action":"encrypt","resource":"key"}],
   "message":"insufficient permissions","type":"permissions_denied"}
```

Every turn persists its message before the chain runs, and persisting encrypts.
No message could be written, so no question could be asked — the chat was not
degraded, it was dead, and no model was ever reached.

**Problem**: `isEncryptionConfigured()` answers whether the *variables are set*,
and every caller reads it as whether encryption *works*. `SCW_KEY_MANAGER_KEY_ID`
and `SCW_API_KEY` were both present, so the predicate said yes, the boot check
in `instrumentation.ts` logged nothing, `EncryptionRequiredScreen` never
rendered, and `isEncryptionEnabled()` stayed true — which means every write kept
calling a key it was not allowed to use and failing individually, forever. The
one screen built to explain exactly this class of failure was the one thing that
could not fire.

Three details make it easy to misread:

- **`SCW_API_KEY` is one IAM secret serving three unrelated Scaleway products** —
  object storage (`.env.example:332` says the S3 secret is the same value),
  inference through the gateway's `SCW_API_BASE`/`SCW_API_KEY` fallback
  (`credentials-from-env.ts`), and Key Manager (`.env.example:360`). They need
  different permission sets. Rotate or re-scope that key for one product and the
  other two can break while everything visibly "works".
- **Scaleway answers `permissions_denied` for more than a missing permission.**
  A key id belonging to another project, or a `SCW_KEY_MANAGER_REGION` that does
  not hold the key, produces the same 403 — so reading the IAM policy and seeing
  `KeyManagerKeyEncrypt` present proves less than it looks like it does.
- **Encrypt and decrypt are separate permissions.** A principal allowed to wrap
  but not unwrap writes messages nobody can ever read back, which is worse than
  failing and invisible to any check that only generates a key.

**Resolved by** issuing a new `SCW_API_KEY` and redeploying. Which of the three
had been true of the old one was not isolated before it was replaced — the
permission could have been absent, the key could have been scoped to a project
that does not hold the KEK, or the secret could have been revoked. That is the
point: they are one symptom, and the cheap move is to reissue the credential
rather than to diagnose which flavour of denial it was. It had worked for days
beforehand, so something outside the repository changed.

**Rule**: presence is not usability, for a remote provider as much as for a
local one. This package already knew that — `localMasterKeyIsUsable()` exists
because `ENCRYPTION_MASTER_KEY=x` made the predicate say yes and the factory
throw — and the remote providers simply had no equivalent. They do now:
`probeEncryptionProvider()` (`@ragenai/crypto`) wraps and unwraps one throwaway
data key at boot, and a *permanent* failure (any 4xx that is not 408 or 429, any
AWS refusal, a malformed response, a round trip that returns different bytes)
makes `getEncryptionStartupStatus()` return `'blocked'` — the blocking screen in
`apps/web`, `process.exit(1)` in `apps/api`. A transient failure (timeout, 5xx,
throttling, a socket that never opened) logs and continues, because blocking a
working deployment on one bad second at boot is the worse trade.

`ALLOW_UNENCRYPTED=1` does **not** waive this, and the reason is worth keeping
straight: it waives the *requirement*, not the provider. It does not make
`isEncryptionEnabled()` false, so writes would still call the broken key and
still throw. Answering `'bypassed'` would promise a plaintext fallback that does
not exist.

When this fires, the question to ask is not "does the policy list the
permission" but "can *these* credentials use *this* key id in *this* region" —
the three are separately wrong and fail identically.

**Applies to**: `packages/crypto` and every deployment that configures a remote
key provider. The worker has no boot probe yet — it runs the same
`@ragenai/crypto` providers through `require-master-key.ts`, so the same
misconfiguration surfaces there as a failing Temporal activity per document.
