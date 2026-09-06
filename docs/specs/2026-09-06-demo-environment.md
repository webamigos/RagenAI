---
title: A demo environment for prospective clients
status: approved
areas: [ops, auth, admin, worker]
adrs: [33, 35, 37]
---

# A demo environment for prospective clients

## TLDR

A showcase installation a salesperson can hand a prospect: real chat over a
real corpus, with the corpus and the configuration frozen and the LLM spend
capped. The non-obvious part is that almost none of this is new machinery —
the restrictions are expressed as feature flags the four-layer resolver
already understands, so "demo" is a *configured organization*, not a mode the
code branches on.

## Problem

Showing Ragen to a prospect today means one of three bad options: a screen
share (they never touch it), a production tenant (they can invite people,
wire connectors, upload confidential documents, and run up model spend on our
account), or a local instance on a laptop (nobody can reach it afterwards).

There is no installation we can hand out a link to and leave running.

## Out of scope

- **Self-serve signup on demo.** One shared account (Q4). Per-prospect
  provisioning from the admin panel is the obvious follow-up and is
  deliberately not here.
- **Resetting the corpus.** Only conversation threads are cleaned up. The
  seeded documents are permanent, which is what makes them safe to demo.
- **The credits system.** Spend is capped at the LiteLLM key (Q6), not by
  in-app accounting. When credits land, demo can move onto them.
- **Rate limiting.** It needs Redis, which is optional in this repo today;
  the budget key caps the bill without that dependency.
- **A `demo` value that changes application behaviour.** `TARGET_ENV=demo`
  describes the deployment (telemetry, base URL, storage warnings). What a
  visitor may do is answered per-organization, never by the environment.

## Proposed solution

**Restrictions are feature flags, resolved per organization** — not a branch
on `TARGET_ENV` (Q3).

The four-layer resolver in
[`features.ts`](../../packages/platform-contracts/src/features/features.ts)
already answers "is this organization allowed to X", is already rendered and
editable in the admin panel, and already explains which layer decided. Three
of the restrictions we want are existing keys: `inviteMembers`,
`mcpConnectors`, `apiAccess`. The gap is document mutation and organization
settings, so we add keys for those rather than inventing a parallel concept.

**And not a `TARGET_ENV`-driven read-only mode, because:** it would add a
fifth private copy of an environment predicate (the four that already
disagree are the reason for the prerequisite PR below); it could not be
exercised by a unit test or a local dev without faking an environment
variable; and it would put "what a user may do" in a package whose job is
describing the process, splitting authorization across two homes.

**And not a single `demoMode` flag, because** a flag named after a
deployment tells no reader what it turns off, and the next environment that
wants "most of demo, but uploads on" has to either fork it or lie about
being a demo. Granular keys compose; a mode does not.

### Consequences we are accepting

Q4 chose one shared account, so **concurrent visitors share a thread list** —
prospect B sees prospect A's conversations until the nightly cleanup runs.
This is a deliberate trade (Q5), and it constrains what belongs in the seeded
corpus: nothing that would embarrass us in a transcript a stranger reads.

## Core surfaces touched

| Surface                       | Change                                                                 | What catches a mistake                        |
| ----------------------------- | ---------------------------------------------------------------------- | --------------------------------------------- |
| `packages/env`                | `demo` joins `TARGET_ENV`; deployed-env predicate consolidated (Phase A) | package tests + every app's env parse          |
| `packages/platform-contracts` | new `FEATURE_KEYS` entries and their defaults                            | package tests + `shared-contracts` arch test   |
| `packages/storage`            | drops its private copy of the deployed-env check                         | package tests                                  |
| `prisma/schema.prisma`        | **none** — `featureOverrides` is an existing JSON column                 | n/a                                            |
| auth / tenant scoping         | none; the demo org is scoped like any other                              | existing guard tests                           |
| `apps/worker`                 | the repository's first Temporal Schedule                                 | worker Jest suite                              |

## Data model

**No migration.** The demo organization is an ordinary row whose
`OrganizationSettings.featureOverrides` sets the new keys to `false` and whose
`allowedModels` names the budget-keyed model. Rows written before this change
are unaffected: new flag keys default to `true`, so every existing
organization keeps the behaviour it has today, and only the demo org opts out.

That is what makes rollback cheap — see below.

## Failure modes

- **Budget exhausted mid-conversation.** LiteLLM refuses; the prospect must
  see a plain "the demo is taking a break" message, not a stack trace or an
  empty stream. This is the most likely failure and the most visible one.
- **Nightly cleanup fails or is never scheduled.** Threads accumulate and a
  prospect's first screen is a wall of strangers' conversations. The job must
  alert on failure, not just log.
- **Cleanup fires mid-demo.** A live visitor's thread disappears under them.
  Delete by age, not "everything", and keep the window well clear of business
  hours in Europe/Warsaw.
- **Someone clears the flags on the demo org.** Demo silently becomes
  writable and the next visitor can upload a real document to a public
  account. The flags are visible in the admin panel with their source, which
  is the mitigation; there is no lock.
- **Demo deployment pointed at the production database.** Catastrophic and
  entirely a configuration mistake. Phase A's required-variable checks are
  what make a demo deploy state its own `DATABASE_URL` rather than inheriting
  one.
- **A seeded document turns out to be confidential.** Treat the corpus as
  published material from the moment it is uploaded.

## Phases

Each phase leaves the application working.

### Phase A — one predicate for "is this a real deployment" (separate PR)

Shipped ahead of the rest, per Q1: it is useful on its own and everything
below depends on it. Today `staging`/`production` is written out four times —
[`rules.ts:25`](../../packages/env/src/rules.ts),
[`storage/src/index.ts:47`](../../packages/storage/src/index.ts),
[`base-url.ts:26`](../../apps/web/src/app/emails/utils/base-url.ts) and
[`web/src/libs/utils/env.ts`](../../apps/web/src/libs/utils/env.ts) — so a
seventh environment would be waved through the config validation the others
get.

- [ ] **A1.** Export `isDeployedEnv()` from `packages/env`, with tests over
      every `TARGET_ENV` value.
- [ ] **A2.** Replace the four private copies with it; behaviour unchanged.
- [ ] **A3.** Add `demo` to `TARGET_ENV_VALUES` and an `isDemoTargetEnv`
      helper beside the others. Nothing reads it yet — that is the point.

### Phase B — the restrictions exist as flags

- [ ] **B1.** Add the keys covering document mutation and organization
      settings to `FEATURE_KEYS`, defaulting to `true`, with the resolver
      tests extended.
- [ ] **B2.** Gate document upload and delete on the new flag, in both
      `apps/web` and the internal API path that `apps/api` calls — a flag
      enforced on one surface is not enforced.
- [ ] **B3.** Gate organization settings mutation the same way.
- [ ] **B4.** Confirm the admin panel renders the new keys with their source
      (it iterates `FEATURE_KEYS`, so this should be free — verify rather
      than assume).

### Phase C — the demo organization

- [ ] **C1.** A seed script that creates the demo org, its shared account,
      the flag overrides and `allowedModels`, and ingests the sample corpus.
- [ ] **C2.** Run it against a demo deployment and walk the prospect's path
      by hand: sign in, ask a question, get a citation, fail to upload.

### Phase D — nightly thread cleanup

The repository has no Temporal Schedule yet, so this phase introduces the
pattern as much as the job.

- [ ] **D1.** A workflow that deletes demo-org threads older than a
      configured age, reusing the same deletion path as
      `DELETE /v1/internal/threads/:id` so encryption keys and citations are
      cleaned up the same way a user deletion cleans them.
- [ ] **D2.** Register it as a Temporal Schedule, and make a failed run
      alert rather than only log.

### Phase E — the deployment

- [ ] **E1.** Railway service with `TARGET_ENV=demo`, its own database and
      Qdrant collection.
- [ ] **E2.** A LiteLLM key with a hard budget, and a check of what the app
      actually renders when that budget is refused.

## Testing

- **Unit** — `isDeployedEnv()` across every `TARGET_ENV` value including
  `demo`; the resolver over the new keys, including that an explicit `false`
  override beats a `true` default.
- **Integration** — upload and settings mutation refused when the flag is
  off, allowed when on, on both the web surface and the internal API path.
- **e2e** — the prospect's path as `p0-*`, not `p1`+: a PR runs only
  `smoke-*` and `p0-*`, so a `p1` test would not gate the PR that breaks the
  demo. Sign in, ask, receive a cited answer, and see the upload control
  absent or refusing.
- **Worker** — the cleanup workflow against its Jest suite: deletes threads
  past the age, leaves fresher ones alone, and is idempotent on a re-run.

## Rollout and rollback

Phase A ships first and alone. B through E can follow in order; each is
independently revertable.

**Rollback is `git revert` at every phase**, which is only true because there
is no migration: the new flag keys default to `true`, so reverting them
restores exactly the behaviour every existing organization already had. The
demo organization is a row — deleting it removes the demo without touching
anyone else. The only piece that outlives a revert is the Temporal Schedule,
which has to be deleted from Temporal as well as from the code.
