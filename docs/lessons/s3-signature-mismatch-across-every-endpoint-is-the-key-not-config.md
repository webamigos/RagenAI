---
title: 'A SignatureDoesNotMatch that survives every endpoint/bucket/region combination is the credential pair, not a config typo'
modules: ['storage', 'worker']
areas: ['integration']
topics: ['s3', 'scaleway', 'credentials', 'signature-does-not-match', 'local-development']
---

# A SignatureDoesNotMatch that survives every endpoint/bucket/region combination is the credential pair, not a config typo

**Context**: setting up a real-storage load test for `apps/worker` (see
[the concurrency load-test lesson](worker-concurrency-load-test-2026-09-05.md)),
`packages/storage`'s `S3StorageProvider` failed uploading to the local dev
environment's Scaleway bucket with `SignatureDoesNotMatch`. `.env.local`'s
`S3_ENDPOINT_URL` (`https://ragen-local.s3.pl-waw.scw.cloud`) also didn't match the
generic form `.env.example` documents (`https://s3.pl-waw.scw.cloud`), which looked
like the obvious suspect.

**Problem**: it wasn't. A standalone script hit the real Scaleway API directly with
`@aws-sdk/client-s3`, varying endpoint, bucket name, and region independently across
five combinations (the `.env.local` config as-is, the `.env.example` generic endpoint,
treating the endpoint's leading segment as the real bucket name, and two other Scaleway
regions entirely). Every single combination returned the identical
`SignatureDoesNotMatch` with the identical message. A config mismatch would be expected
to succeed for *some* combination, or fail with a different error for others (wrong
region typically gives a redirect or a different code) — getting the same error
regardless of what's varied on the client side, with everything else held constant,
points at the one thing that wasn't varied: the access key ID / secret pair itself.

Confirmed after the user rotated the key: the new pair worked on the very first
combination tried (the exact `.env.local` config, unchanged) — proving the endpoint
oddity was cosmetic, not the cause.

**Rule**: when an S3-compatible provider (Scaleway, MinIO, R2, AWS itself) returns
`SignatureDoesNotMatch`, don't start by auditing endpoint/region/bucket-name config —
vary them independently in an isolated script first. If the same error survives every
combination, it's the credential pair, and no amount of config archaeology will fix it.
S3-compatible providers deliberately return this same error for a wrong secret, a
deleted/revoked access key, and an expired one — the vagueness is intentional (it avoids
confirming to an attacker which half of a stolen credential pair is the wrong one), so
don't expect the message to tell you which of those three it is. That has to be checked
in the provider's own console.

**Applies to**: any `SignatureDoesNotMatch` (or provider-equivalent) against
`packages/storage`'s S3 provider, and generally to diagnosing credential errors against
any S3-compatible API — the isolation technique (vary one thing at a time against the
real endpoint, outside the app) is faster than reasoning about the app's config in the
abstract.
