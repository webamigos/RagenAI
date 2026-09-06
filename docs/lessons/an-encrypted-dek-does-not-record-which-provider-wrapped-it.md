---
title: 'An encrypted DEK does not record which provider wrapped it, so changing ENCRYPTION_PROVIDER silently orphans every existing thread'
modules: ['web', 'api', 'worker']
areas: ['architecture', 'security']
topics: ['encryption', 'kms', 'scaleway', 'key-manager', 'envelope-encryption', 'environment-variables', 'migrations']
---

# An encrypted DEK does not record which provider wrapped it, so changing ENCRYPTION_PROVIDER silently orphans every existing thread

**Context**: Thread messages use envelope encryption. A per-thread data
encryption key (DEK) is generated, wrapped by a key provider, and the wrapped
result is stored on the thread. `getKeyProvider()`
(`apps/web/src/libs/crypto/key-provider/index.ts`) picks one of three at
runtime — Scaleway Key Manager, AWS KMS, or a local master key — from
`ENCRYPTION_PROVIDER`, falling back to auto-detection by which credentials are
present.

The question that surfaced this was ordinary: how do we move encryption from
AWS KMS to Scaleway? It turned out both deployed environments were already on
Scaleway, so nothing needed moving. But the answer to "what would have
happened" is worth writing down, because nothing in the system would have
stopped it.

**Problem**: `Thread.encryptedDek` is a bare base64 string
(`prisma/schema.prisma:97`). It carries no record of which provider produced
it, and neither does anything beside it. So `decryptThreadKey()` hands the
wrapped key to whichever provider the environment currently names, with no
check that it is the one that did the wrapping.

Change `ENCRYPTION_PROVIDER` in an environment that already holds encrypted
threads and every one of them becomes undecryptable. There is no detection and
no guard rail:

- The provider selection reads only environment variables, never the data.
- `isEncryptionConfigured()` answers "is _a_ provider configured", not "is the
  provider that wrapped these keys configured".
- Nothing at boot compares the configured provider against what is in the
  database, so a deploy is green and the damage appears later, per thread, as
  a decryption failure on read.
- Auto-detection makes it worse: with `ENCRYPTION_PROVIDER` unset, merely
  _adding_ `SCW_KEY_MANAGER_KEY_ID` + `SCW_API_KEY` to an environment running
  on KMS switches the provider as a side effect of setting a variable that
  looks additive.

This is not the same hazard as the `AWS_`/`SCW_` credential collision in
[aws-prefixed-env-vars-are-scaleway-s3-not-bedrock](aws-prefixed-env-vars-are-scaleway-s3-not-bedrock.md).
There the wrong credentials produced a loud failure. Here the credentials are
valid and the provider is healthy — it is simply being asked to unwrap a key
it never wrapped.

**Rule**: Treat `ENCRYPTION_PROVIDER` as **immutable for the life of an
environment that holds encrypted data**. Choose it before the first thread is
encrypted.

Changing it afterwards is a data migration, not a configuration change: every
`encryptedDek` has to be unwrapped with the old provider and re-wrapped with
the new one, which requires both to be reachable at once. No such migration
exists in this repository today — write one before you need it, not during.

Two corollaries:

- Set `ENCRYPTION_PROVIDER` explicitly in every deployed environment, even
  where auto-detection would pick the right one. It converts a variable that
  changes behaviour by its presence into one that changes behaviour only when
  edited on purpose.
- When a lesson or ADR records a _rename_ of credential variables, the deployed
  environments do not rename themselves. Check each one; the code reads the new
  names and gets `undefined` from the old ones without complaint.

**Applies to**: `apps/web/src/libs/crypto/key-provider/`,
`apps/api/src/crypto/key-provider/`, `Thread.encryptedDek` and
`OrganizationSettings.encryptedPiiDek` in `prisma/schema.prisma`, and any
Railway environment where `ENCRYPTION_PROVIDER`, `SCW_KEY_MANAGER_KEY_ID`,
`AWS_KMS_KEY_ID` or `ENCRYPTION_MASTER_KEY` is set.
