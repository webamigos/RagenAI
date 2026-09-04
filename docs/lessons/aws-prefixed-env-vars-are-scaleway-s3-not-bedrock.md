---
title: 'AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY in local .env.local are Scaleway S3 credentials, not AWS Bedrock ones'
modules: ['web', 'worker', 'infra']
areas: ['integration']
topics:
  ['env-vars', 'aws', 'scaleway', 'bedrock', 'litellm', 'reranker', 'storage']
---

# AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY in local .env.local are Scaleway S3 credentials, not AWS Bedrock ones

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
region error) is the tell that the credentials are real but for a different
service, not that they're expired.

**Applies to**: any local test of a Bedrock-routed model in
`infra/litellm/config.yaml` (`claude-sonnet-4-6`, `cohere-rerank-v3-5`,
`cohere-embed-multilingual-v3`) — and to anyone considering renaming one side
of this collision, which would need coordinating both the storage config and
the LiteLLM config together, plus whatever sets these on Railway.
