---
title: A provider adapter is not configured until a real call goes through it
modules: [web, api, worker]
areas: [architecture, rag, testing]
topics:
  [llm-gateway, litellm, vertex, credentials, configuration, measurement, evals]
---

## Context

`packages/llm-gateway` shipped in B1 with 50 unit tests, five architecture
guards over the file it ships, a generated JSON Schema guarded against drift,
and a guard counting its compose mounts. B2a and B2b put three apps behind it,
each with its own seam test asserting the flag routes in both directions, plus a
mutation check that a dead seam fails those tests. `npm run verify` was green
throughout.

B2c then ran the thing against real providers for the first time.

## Problem

Three defects surfaced in the first twenty minutes. None was a typo; each was a
false assumption the tests shared with the code, which is why no test could
catch it.

1. **Vertex could not authenticate at all.** The credential source read
   `VERTEX_PROJECT` and `VERTEX_LOCATION` — the proxy's variable names, per the
   deliberate decision that "a deployment running the proxy needs no new
   secrets" — and left credentials to Google's application defaults. But the
   proxy's third variable, `VERTEX_CREDENTIALS`, holds the service-account JSON
   *itself*, while Google's libraries look for a **file path** in
   `GOOGLE_APPLICATION_CREDENTIALS`. Every Vertex route failed with "Could not
   load the default credentials". The package's own README asserted the
   opposite, in prose.

2. **The route table could not express where a model lives.** A route carried
   `provider`, `model` and `connection`. The proxy config pins
   `gemini-3-flash-preview` to `vertex_location: global`, hardcoded on that one
   entry, because Google serves preview models from the global endpoint only —
   so the gateway sent it to `VERTEX_LOCATION` and got a 404 while
   `gemini-2.5-flash` answered from the same region. The guard comparing the
   two files matched **model names**, which agreed perfectly.

3. **The default route-table path resolved against the process's cwd.**
   `'infra/llm-gateway/routes.yaml'` only resolves for a process started at the
   repository root, and no app here is: the worker runs from `apps/worker`, Next
   from `apps/web`, Nest from `apps/api`. The failure arrived as an ingest that
   marked four documents `FAILED` — not as anything mentioning configuration.

## Rule

**A provider adapter is unexercised until a real credential, a real endpoint and
a real model id meet in one call.** Everything upstream of that — schema
validation, mount counts, seam tests, drift guards — checks that the *shape* is
right, and every one of the three defects above had a correct shape.

Three specific corollaries, each of which cost a debugging cycle:

- **Adopting another system's variable names adopts its semantics too.** Reading
  `VERTEX_PROJECT` and ignoring `VERTEX_CREDENTIALS` is not "compatible with the
  proxy's configuration"; it is compatible with two thirds of it. When the
  promise is "no new secrets", enumerate the old ones and account for each.
- **A guard that compares names compares names.** If configuration carries
  behaviour beyond identity — a region, a version pin, an endpoint — the guard
  has to compare that too, or it will stay green across exactly the
  disagreements that matter. The location check now does.
- **A path constant is a cwd assumption.** Resolve shared configuration by
  walking up for the file, not by hoping the process starts where the author's
  shell did.

And the cheap habit that would have found all three in one minute: **before a
long measurement, make one real call per model in the stack under test.** A
twelve-line script resolving each model and asking it to reply "OK" turned three
silent misconfigurations into three error messages, before any of them could be
mistaken for a quality regression in a benchmark.

## Applies to

Any adapter package standing between this codebase and an external provider —
`packages/llm-gateway`'s provider and embedding factories, the reranker seams,
`packages/storage`'s S3 provider, `packages/crypto`'s KMS providers. Sharpest
wherever the package deliberately reuses another system's configuration, because
that is where "it is already configured" feels most true and is least tested.
