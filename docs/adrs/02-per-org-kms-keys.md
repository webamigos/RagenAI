# ADR-02: Per-Organization AWS KMS Keys

**Status:** Deferred — the question stands, but the single-`AWS_KMS_KEY_ID`
scheme it is asked against has been superseded; see the update at the end
**Date:** 2026-03-28

> "A single KMS key (`AWS_KMS_KEY_ID`)" and "No `AWS_KMS_KEY_ID` env var →
> encryption disabled" are **stale**. The key now comes from the provider seam
> in `@ragenai/crypto` (`ENCRYPTION_PROVIDER`: `scaleway`, `kms` or `local`), and
> a deployed process with no provider refuses to store plaintext. The deferral
> itself is unchanged. See
> [the update](#update-2026-10-04-the-single-aws-key-scheme-is-superseded-the-question-is-still-open).

## Context

The application uses AWS KMS envelope encryption for thread message content. Currently, a single KMS key (`AWS_KMS_KEY_ID`) generates unique Data Encryption Keys (DEKs) per thread via `GenerateDataKey`. The question is whether each organization should have its own KMS key.

## Current Architecture

- Single KMS key shared across all organizations
- Each thread gets a unique DEK (AES-256-GCM)
- DEK is encrypted by the shared KMS key and stored as `Thread.encryptedDek`
- No `AWS_KMS_KEY_ID` env var → encryption disabled (local development)

## Analysis

### Benefits of Per-Org KMS Keys

- **Hard revocation** — disable one org's KMS key and all their data becomes permanently unreadable, instantly. With a shared key, you'd need to delete individual DEKs or ciphertexts.
- **Independent rotation** — rotate one org's key without touching others.
- **Granular IAM/key policies** — restrict which services/roles can use which org's key.
- **Cleaner audit trails** — CloudTrail logs naturally segment by key.
- **Compliance checkbox** — some standards (SOC 2 Type II, certain HIPAA interpretations, enterprise contracts) explicitly want tenant-isolated encryption keys.
- **Better KMS throughput** — API rate limits are per-key, so more keys means more headroom.

### Costs

- ~$1/month per KMS key (minor, but scales with number of organizations).
- Code complexity — need a lookup from org → KMS key ARN on every encrypt/decrypt.
- Key lifecycle management (creation on org signup, cleanup on deletion).
- Migration effort for existing encrypted threads.

## Decision

**Deferred.** The current envelope encryption with per-thread DEKs under a single KMS key is cryptographically sound. Per-org keys become worth it when:

1. Enterprise contracts explicitly require tenant-isolated encryption keys.
2. Compliance audits (SOC 2 Type II, HIPAA) flag shared KMS keys as a finding.
3. Hard per-org revocation becomes a product requirement.

The security difference is marginal — the value is primarily operational and compliance-driven.

## Migration Path (When Needed)

1. Add a `kmsKeyArn` column to `InternalOrganization` (nullable, defaults to global key).
2. On org creation, generate a new KMS key and store its ARN.
3. Re-encrypt existing thread DEKs lazily on next access (decrypt with old key, re-encrypt with org key).
4. Batch migration for remaining threads via admin action (similar to `encryptAllThreadsAction`).

## Update (2026-10-04): the single-AWS-key scheme is superseded; the question is still open

This ADR was written when encryption meant one AWS KMS key named by
`AWS_KMS_KEY_ID`. It no longer does, and two sentences above are wrong as a
description of the system today. The ADR is left as it was written; this says
which parts to trust.

**What replaced it.** `@ragenai/crypto` has a key-provider seam, chosen by
`ENCRYPTION_PROVIDER` — `scaleway` (Scaleway Key Manager), `kms` (AWS KMS) or
`local` (a master key from `ENCRYPTION_MASTER_KEY`). Unset, it auto-detects from
whichever credentials are present, in that order. `AWS_KMS_KEY_ID` is what the
`kms` provider needs; it is not the switch that turns encryption on. How it
works: [`docs/thread-encryption.md`](../thread-encryption.md); the settings:
[the environment reference](https://docs.ragen.ai/configuration/environment-reference).

**"No `AWS_KMS_KEY_ID` env var → encryption disabled" is no longer true** outside
development. A process in a deployed environment with no provider configured
refuses to store content rather than writing plaintext, unless
`ALLOW_UNENCRYPTED=1` waives that on purpose; a provider that fails its boot
probe blocks the process and is not waivable. Plaintext without a configured
provider is what a development or test run does.

**Still true:** each thread has its own DEK (AES-256-GCM), wrapped by the
provider and stored as `Thread.encryptedDek`. Content that belongs to an owner
rather than a thread (a personal memory) has one DEK per (user, organization)
from the same provider ([ADR-42](42-thread-derived-content-is-encrypted-through-one-function.md)).

**The question this ADR asked — one KMS key per organization — is still open,
and the deferral stands.** The seam did not settle it: there is one provider and
one key per installation, and every DEK is wrapped under it. Nothing in
`@ragenai/crypto` selects a key by organization, and no `kmsKeyArn` column was
added. (`OrganizationSettings.encryptedPiiDek` is a per-organization *DEK*, for
PII, wrapped under that same installation key — not a per-organization KMS
key.) What changed is the shape of the work. The migration path below is
written for AWS ("add a `kmsKeyArn` column…"); a per-organization key would now
have to be expressible through every provider, not only KMS, so it is a change
to the seam's contract and not a column plus a lookup. The triggers listed under
Decision are unchanged.
