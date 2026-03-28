# ADR-02: Per-Organization AWS KMS Keys

**Status:** Deferred
**Date:** 2026-03-28

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
