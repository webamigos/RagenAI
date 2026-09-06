---
title: A demo environment for prospective clients
status: draft
areas: [ops, auth, admin, api, worker]
adrs: [33, 35, 37]
---

# A demo environment for prospective clients

## TLDR

A showcase installation a salesperson can hand a prospect without giving them a
production tenant or a machine that can be run up a bill. The non-obvious part
is that "demo" is not one switch: `TARGET_ENV` already enumerates six
environments and the question "is this a real deployment?" is written out
separately in four places, so adding a seventh value without first
consolidating that predicate produces an environment that silently skips the
config validation the other deployments get.

## Open Questions

<!--
Delete this block once every question is answered. While it is here, the spec
is not ready to implement and no code should be written from it.
-->

- **Q1. One capability or two?** Consolidating the deployed-environment
  predicate (`packages/env`, `packages/storage`, `apps/web`'s email base URL and
  its `is…TargetEnv` helpers all carry their own copy of `staging`/`production`)
  is useful on its own, ships in a day, and is a prerequisite for everything
  else here. Split it into its own PR ahead of this spec, or carry it as Phase A?

- **Q2. What does "read-only" forbid?** It cannot mean "no writes" — chatting
  writes threads and messages, which is the thing we are demonstrating. Which
  of these is the line?
  - (a) Chat works; everything that mutates *configuration or corpus* is
    refused — document upload/delete, member invites, connector setup, API
    keys, org settings.
  - (b) Everything works, and the whole tenant is reset on a schedule.
  - (c) (a) plus a scheduled reset of the chat history.

- **Q3. Where is the restriction enforced — the process or the organization?**
  This decides which package owns it and cannot be deferred.
  - (a) **Process-level**: `TARGET_ENV=demo` makes the whole deployment a demo.
    Simple, but adds a fifth copy of an environment predicate, and the
    restrictions cannot be exercised by a local dev or a test without faking
    the env var.
  - (b) **Org-level**: a demo organization carries the restrictions via the
    existing four-layer feature resolution
    ([`features.ts`](../../packages/platform-contracts/src/features/features.ts)),
    and the separate Railway deployment is *only* isolation and cost
    containment. Testable locally, reuses machinery that exists.
  - (b) is my recommendation; (a) is what "a demo environment" sounds like it
    means, which is why this needs an explicit answer rather than an assumption.

- **Q4. How does a prospect get in?** Determines whether we need signup gating,
  seeded accounts, or per-prospect provisioning — and, critically, whether two
  prospects in the demo at once can see each other's conversations.
  - (a) One shared demo account, published credentials.
  - (b) Self-serve signup on the demo deployment, each signup its own org.
  - (c) Sales provisions an account per prospect from the admin panel.

- **Q5. Does the demo tenant reset, and to what?** A seeded sample corpus
  implies a fixture set and an ingest run; a reset implies a scheduled job
  (Temporal, per `apps/worker`) and a decision about what "reset" means for
  Qdrant collections and uploaded files. Never resetting is also a valid
  answer, but it makes Q2(a) load-bearing.

- **Q6. What stops the demo from becoming a bill?** A public LLM surface is an
  abuse target. Reuse `OrganizationSettings.allowedModels` plus rate limiting,
  a LiteLLM key with a hard budget, or the credits system already planned?

## Problem

<!-- To be written once Q1–Q6 are answered. -->

## Core surfaces touched

Recorded early because the answer to Q3 changes this table, and it is the
cheapest place to notice that.

| Surface                         | Change                                                              | What catches a mistake                       |
| ------------------------------- | ------------------------------------------------------------------- | -------------------------------------------- |
| `packages/env`                  | a seventh `TARGET_ENV` value; a shared `isDeployedEnv()` predicate    | package tests, plus every app's env parse     |
| `packages/platform-contracts`   | if Q3 = (b), the restriction lives here beside the feature flags      | package tests + `shared-contracts` arch test  |
| `packages/storage`              | drop its private copy of the deployed-env check                       | package tests                                 |
| auth / tenant scoping           | if Q4 = (a), one org holding many concurrent visitors                 | guard tests, `p0-*` e2e                       |
| `prisma/schema.prisma`          | unknown until Q3 and Q5 are settled                                   | migration + `npm run verify`                  |

## Phases

<!-- To be written once Q1–Q6 are answered. -->
