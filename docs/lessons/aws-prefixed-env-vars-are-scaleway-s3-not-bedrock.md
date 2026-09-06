---
title: 'AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY in local .env.local are Scaleway S3 credentials, not AWS Bedrock ones'
modules: ['web', 'worker', 'infra']
areas: ['integration']
topics: ['env-vars', 'aws', 'scaleway', 'bedrock', 'litellm', 'reranker', 'storage']
---

# AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY in local .env.local are Scaleway S3 credentials, not AWS Bedrock ones

> **Resolved 2026-09-04** (PR #873): the storage side of this collision moved
> off the `AWS_` prefix entirely — `packages/storage` now reads
> `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`, so `AWS_ACCESS_KEY_ID`/
> `AWS_SECRET_ACCESS_KEY` are exclusively AWS Bedrock/KMS credentials from
> here on. See
> [ADR-27's Update section](../adrs/27-storage-abstraction-local-by-default.md#update-aws_access_key_idaws_secret_access_key-renamed-to-s3_access_key_ids3_secret_access_key).
> Note the ADR-27 file itself only exists on that PR's branch until it merges.
> The rest of this lesson is historical — kept because the _method_
> (`git log -S`-style collision-checking before assuming expired creds) still
> applies to the KMS provider, which was deliberately left on the old names
> and is the same latent bug class if anyone ever runs `ENCRYPTION_PROVIDER=kms`
> alongside S3-compatible storage from a non-AWS provider.
>
> **Deployment-side corollary, learned the slow way**: renaming the variables
> in code renames nothing in a deployed environment. `packages/storage` reads
> `S3_*` and gets `undefined` from a leftover `AWS_S3_*` without a word of
> complaint — `STORAGE_PROVIDER=s3` still looks correctly set, the service
> boots green, and the first upload is what fails. An environment whose files
> are rarely touched can sit in that state for months. After a credential
> rename, check every deployed environment for the new names, and do not read
> the presence of the old ones as evidence of anything.

**Context**: Testing whether Cohere Rerank v3.5 (the true cross-encoder ADR-12
argued for) beats the Scaleway bi-encoder that's actually the shipped default,
`infra/litellm/config.yaml`'s `cohere-rerank-v3-5` entry was uncommented
locally (a config-only change, reverted after). `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY` were both present and non-empty in `.env.local`, so the
Bedrock credential prerequisite looked satisfied.

**Problem**: the rerank call failed with a flat AWS 403 — `"The security
token included in the request is invalid."` — not a permissions or region
error, a "these credentials don't exist" error. `.env.example:275-278` explains
why: those same two variable names are already spoken for, right next to
`AWS_ENDPOINT_URL=https://s3.pl-waw.scw.cloud` — Scaleway's S3-compatible
object storage (`packages/storage`, ADR-27), which reuses the AWS SDK's env
var names because its API is S3-compatible. Two unrelated integrations
(storage's Scaleway S3, LiteLLM's Bedrock model list) read identically-named
variables expecting two different credential sets, and only one is actually
configured in local dev. `claude-sonnet-4-6`'s Bedrock entry in the same config
file reads the same two variables and would fail the same way if exercised
locally — nobody normally hits it because `gemini-3-flash-preview` is the
actual chat default.

**Rule**: before spending time on an AWS Bedrock rerank/embedding/chat path
locally, check what `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` are actually
wired to in this environment — grep `.env.example` for `AWS_ENDPOINT_URL` and
`AWS_S3_BUCKET_NAME` nearby before assuming a non-empty value means working
Bedrock access. A 403 "security token invalid" (not a permissions-denied or
region error) _can_ mean the credentials are real but for a different service
— that was the cause here — but it isn't proof by itself: the same message
also covers expired or deactivated keys, and temporary/STS credentials used
without their session token. Rule out the collision first with the grep above
(cheap, specific to this repo), then check the credential's source, whether
it's still active, and whether it needs a session token before concluding
it's a permissions or Bedrock-access problem.

**Applies to**: any local test of a Bedrock-routed model in
`infra/litellm/config.yaml` (`claude-sonnet-4-6`, `cohere-rerank-v3-5`,
`cohere-embed-multilingual-v3`) — and to anyone considering renaming one side
of this collision, which would need coordinating both the storage config and
the LiteLLM config together, plus whatever sets these on Railway.
