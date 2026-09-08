---
title: A demo environment for prospective clients
status: in-progress
areas: [ops, auth, admin, api, worker]
adrs: [33, 34, 35, 37]
---

# A demo environment for prospective clients

## TLDR

A showcase installation a salesperson can hand a prospect: real chat over a
real corpus, with the corpus and the configuration frozen and the LLM spend
capped. The non-obvious part is that almost none of this is new machinery —
the restrictions are feature flags the four-layer resolver already
understands and the spend cap is a per-organization limit that already syncs
to LiteLLM, so "demo" is a _configured organization_, not a mode the code
branches on.

## Problem

Showing Ragen to a prospect today means one of three bad options: a screen
share (they never touch it), a production tenant (they can invite people,
wire connectors, upload confidential documents, and run up model spend on our
account), or a local instance on a laptop (nobody can reach it afterwards).

There is no installation we can hand out a link to and leave running.

## Decisions taken up front

These were settled before the phases were written; they are recorded here
because each one changes the shape of the work.

1. **Restrictions are per-organization, not per-process.** A demo
   organization carries them through the existing feature resolution. The
   separate deployment is isolation and cost containment only.
2. **"Read-only" means the chat works and the configuration and corpus are
   frozen.** Chatting writes threads and messages — that is the thing being
   demonstrated, so it cannot mean "no writes".
3. **One shared demo account**, with credentials sales can hand out.
4. **Conversation threads are deleted on a schedule**, because of what (3)
   implies — see Consequences.
5. **Spend is capped at LiteLLM**, not by in-app accounting.
6. **Demo holds the showcase organization and nothing else.** Added
   2026-09-06, when the team retired the `staging` environment and demo took
   its place on Railway. That raised the obvious question — does demo now also
   serve as pre-production testing? — and the answer is no: the team tests
   locally. Worth recording because the two purposes contradict each other. A
   staging environment is somewhere you write freely; this one is deliberately
   frozen, and if it had to be both, Phase B's restrictions would have blocked
   the team's own work. The per-organization enforcement chosen in (1) is what
   would make the two coexist if that ever changes: a restricted demo
   organization beside unrestricted ones. Nothing here depends on that today.

## Out of scope

- **Self-serve signup on demo.** Per-prospect provisioning from the admin
  panel is the obvious follow-up and is deliberately not here.
- **Resetting the corpus.** Only conversation threads are cleaned up. The
  seeded documents are permanent, which is what makes them safe to demo.
- **The credits system.** When it lands, demo can move onto it.
- **Rate limiting.** It needs Redis, which is optional in this repo today.
  Note this is a real gap, not a solved problem — see Failure modes.
- **A `demo` value that changes application behaviour.** `TARGET_ENV=demo`
  describes the deployment (telemetry, base URL, storage warnings, config
  validation). What a visitor may do is answered per-organization.

## Proposed solution

**Restrictions are feature flags, resolved per organization.**

The four-layer resolver in
[`features.ts`](../../packages/platform-contracts/src/features/features.ts)
already answers "is this organization allowed to X", is already rendered and
editable in the admin panel, and already explains which layer decided. Three
of the restrictions we want are existing keys: `inviteMembers`,
`mcpConnectors`, `apiAccess`. The gap is document mutation and organization
settings, so we add keys for those rather than inventing a parallel concept.

**And not a `TARGET_ENV`-driven read-only mode, because:** it would add yet
another private copy of an environment predicate (there are already seven —
see Phase A); it could not be exercised by a unit test or a local dev without
faking an environment variable; and it would put "what a user may do" in a
package whose job is describing the process, splitting authorization across
two homes.

**And not a single `demoMode` flag, because** a flag named after a
deployment tells no reader what it turns off, and the next environment that
wants "most of demo, but uploads on" has to either fork it or lie about
being a demo. Granular keys compose; a mode does not.

### Consequences we are accepting

One shared account means **concurrent visitors share a thread list** —
prospect B sees prospect A's conversations until the nightly cleanup runs.
This constrains what belongs in the seeded corpus: nothing that would
embarrass us in a transcript a stranger reads.

It also means **no per-visitor rate limit is possible** — they are one user.
The spend cap is the only backstop, so a scripted visitor can exhaust the
month's demo budget in an afternoon and the demo is then down until someone
notices. Accepted for now; the mitigation is monitoring the cap, not
preventing the exhaustion.

## Core surfaces touched

| Surface                       | Change                                                                        | What catches a mistake                       |
| ----------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| `packages/env`                | a seventh `TARGET_ENV` value; a shared `isDeployedEnv()`                      | package tests + every app's env parse        |
| `packages/platform-contracts` | new `FEATURE_KEYS` entries and their defaults                                 | package tests + `shared-contracts` arch test |
| `packages/storage`            | drops its private copy of the deployed-env check                              | package tests                                |
| `apps/web`                    | flag gates on the mutation commands; its own env helpers cleaned up           | unit + `p0-*` e2e                            |
| `apps/api`                    | flag gates on its **own** file and project write paths (ADR-21 ported copies) | api tests                                    |
| `apps/worker`                 | the repository's first Temporal Schedule                                      | worker Jest suite                            |
| `apps/mcp`                    | reads `TARGET_ENV`; inventoried in Phase A, otherwise untouched               | its env tests                                |
| `prisma/schema.prisma`        | **none** — every field this needs already exists                              | n/a                                          |
| auth / tenant scoping         | none; the demo org is scoped like any other                                   | existing guard tests                         |

## Data model

**No migration.** The demo organization is an ordinary row:

- `OrganizationSettings.featureOverrides` (`Json?`, schema line 289) holds the
  new keys set to `false`.
- `OrganizationSettings.monthlyCostLimitCents` (`Int?`, line 275) holds the
  spend cap; `syncLiteLLMTeamBudgetCommand` already pushes it to the org's
  LiteLLM team as `max_budget` with a 30-day duration.
- `OrganizationSettings.allowedModels` (`String[] @default([])`, line 279)
  narrows the picker to one cheap model. **It caps nothing** — it restricts
  _which_ models are selectable, not how much they may cost. The cap is
  `monthlyCostLimitCents` alone.

Rows written before this change are unaffected: new flag keys default to
`true`, so every existing organization keeps today's behaviour, and only the
demo org opts out. That is what makes rollback cheap.

## Failure modes

- **Budget exhausted mid-conversation.** LiteLLM refuses; the prospect must
  see a plain "the demo is taking a break" message, not a stack trace or an
  empty stream. Most likely failure, most visible.
- **Budget exhausted by a scripted visitor.** No rate limit exists (see
  Consequences). The demo stays down until someone reads the LiteLLM spend.
- **Nightly cleanup fails or is never scheduled.** Threads accumulate and a
  prospect's first screen is a wall of strangers' conversations.
- **Cleanup fires mid-demo.** A live visitor's thread disappears under them.
  Delete by age, not "everything", and keep the window clear of European
  business hours.
- **Someone clears the flags on the demo org.** Demo silently becomes
  writable and the next visitor can upload a real document to a public
  account. The flags are visible in the admin panel with their source; there
  is no lock.
- **Demo deployment pointed at the production database.** Catastrophic, and
  **nothing in this spec prevents it.** `DATABASE_URL` is already required in
  every environment, and requiring a variable to be _set_ says nothing about
  what it is set to. The only real mitigation is operational: give demo its
  own Railway **project**, not another service inside the production one, so
  there are no shared variables to inherit by accident.
- **A seeded document turns out to be confidential.** Treat the corpus as
  published material from the moment it is uploaded.

## Phases

Phases A and B are independently useful and ship as their own PRs — neither
mentions demos, and both would be worth doing if this spec were abandoned.
C, D and E are the demo.

### Phase A — one predicate for "is this a real deployment" (separate PR)

The repository has **seven** places that decide whether an environment is a
real deployment, in three mutually inconsistent shapes:

| Where                                                                                           | Shape                                                  |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [`packages/env/src/rules.ts:25`](../../packages/env/src/rules.ts)                               | allowlist: `staging \|\| production`                   |
| [`packages/storage/src/index.ts:47`](../../packages/storage/src/index.ts)                       | allowlist: `staging \|\| production`                   |
| [`apps/web/.../emails/utils/base-url.ts:26`](../../apps/web/src/app/emails/utils/base-url.ts)   | denylist: not `local\|test\|e2e\|ci`                   |
| [`apps/worker/src/services/llm/provider.ts:15`](../../apps/worker/src/services/llm/provider.ts) | denylist: not `local\|test` — **omits `e2e` and `ci`** |
| [`apps/api/src/app.module.ts:32`](../../apps/api/src/app.module.ts)                             | `local` / `ci` / `test` branch for throttling          |
| [`apps/web/src/libs/utils/env.ts`](../../apps/web/src/libs/utils/env.ts)                        | four equality constants — **not this predicate**       |
| [`apps/worker/src/utils/env.ts`](../../apps/worker/src/utils/env.ts)                            | byte-identical copy of the row above                   |

The worker's variant already misbehaves: a CI run takes its "deployed"
branch and demands `LITELLM_MASTER_KEY`.

**`isDeployedEnv()` is defined as a denylist** — true unless the value is
`local`, `test`, `e2e` or `ci`. `TARGET_ENV` is a closed zod enum, so the two
formulations are exhaustive over the same set today and differ only in which
side a _new_ value lands on. Denylist is the fail-safe one: a new environment
is treated as real and gets the config validation, rather than silently
skipping it. This makes `demo` acquire the full required-variable set, which
is the point.

- [x] **A1.** Export `isDeployedEnv()` from `packages/env`, with tests over
      every `TARGET_ENV` value.
- [x] **A2.** Replace the copies in `packages/env`, `packages/storage`,
      `apps/web`'s email base URL and `apps/worker`'s LLM provider. Behaviour
      is unchanged for every existing value; the worker's `e2e`/`ci` bug is
      fixed as a side effect, which is a change and should be called out in
      the PR rather than buried.
- [x] **A3.** Treat `apps/web/src/libs/utils/env.ts` and its worker twin
      **separately — they are not this predicate.** `isProductionTargetEnv`
      gates Google Tag Manager and the Pino log level; folding it into
      `isDeployedEnv()` would fire GTM on staging and downgrade staging logs
      from `debug` to `info`. Delete `isStagingTargetEnv` (zero consumers),
      leave the production-only checks alone, and de-duplicate the two files
      against each other.
- [x] **A4.** Leave `apps/api`'s throttling branch alone. **Decision:
      `demo` keeps the production limits**, because the reasoning that
      questioned them does not survive contact with the code.

      The premise was that a shared account many prospects hit at once is
                  exactly where production limits are wrong. But `ThrottlerGuard` is
                  registered with no custom tracker, so it keys on **IP, not on the
                  account** — the multiplier in `apps/api/src/app.module.ts` raises limits
                  only for `local` (1.5x) and `ci`/`test` (100x), and prospects arriving
                  from different networks never share a bucket.

                  The residual risk is narrower and accepted: several people behind one
                  office NAT do share one, and `expensive` allows 10 requests a minute,
                  so a three-person demo from one meeting room could trip it. Revisit if
                  that is ever observed — the fix is one branch in the multiplier, not a
                  design change. Not pre-emptively raised, because a limit loosened
                  without evidence is a limit nobody can reason about later.

- [x] **A5.** Add `demo` to `TARGET_ENV_VALUES`. Also update
      [`.env.example:7`](../../.env.example) (which documents the list) and
      [`inspect-environment.ts`](../../apps/web/src/features/setup/services/queries/inspect-environment.ts)
      (whose operator-facing example reads `local / staging / production`).
- [x] **A6.** Note that `NEXT_PUBLIC_TARGET_ENV` is a separate, **build-time
      inlined** mirror read by `instrumentation-client.ts`, `web-vitals.ts`
      and `clientLogger.ts`. The demo image must set it at build time, not
      runtime.

### Phase B — per-organization write restrictions (separate PR)

Independently shippable and worth shipping regardless: "an operator can turn
off document mutation and settings changes for any organization" is exactly
ADR-35's self-hosted-operator case.

This is **larger than it looks**: `apps/api` is not a proxy to `apps/web`
(ADR-21), so the two hold ported copies of the same write paths and each
needs its own gate.

- [x] **B1.** Add the keys to `FEATURE_KEYS`, defaulting to `true`, with
      `DEFAULT_FEATURES` and `FEATURE_LABELS` extended and the resolver tests
      widened. The admin panel iterates `FEATURE_KEYS`, so its UI follows for
      free — verify, do not assume.
- [x] **B2.** Gate `apps/web`'s write paths via `isFeatureEnabledQuery`. The
      commands, not the routes: `upload-file-command`, `delete-file-command`
      and `delete-folder-command` cover the internal API routes for free.
      Then the paths that bypass those commands — `processUrl` (URL scrape
      into a new document), `saveMarkdownWithMeta`, and the three Google
      Drive import/sync commands.
- [x] **B3.** Gate `apps/api`'s own writes via
      `SubscriptionsService.isFeatureEnabled`: `files.service` upload and
      remove, `documents/files.service` `createDocument` and
      `importFileToProject`, and `projects.service`'s cascade delete.
- [x] **B4.** Gate organization settings mutation.
- [x] **B5.** The paths a flag does not cover, answered. Every command under
      `features/documents/services/commands/` was checked for the guard and
      each ungated one traced to its callers, because "no gate here" and
      "reachable without a gate" are different claims: - `deleteProjectAction` — **already covered.** The original entry was
      wrong: `ProjectsService.deleteProject` in `apps/api` gates on
      `manageProjects`, and the web action only forwards to that route. The
      API comment gives the same reasoning this spec does — deleting a
      project cascades to its documents, so it would otherwise walk around
      the `manageDocuments` gate one level up. - `generate-document` — **no gate needed.** It already fails cleanly
      with "Google Drive is not connected", and the demo cannot connect one
      because `mcpConnectors` is off. That is the second branch of the
      choice this spec offered, taken. - **rollback and apply-suggestions — were genuinely open, now gated.**
      Both rewrite a document's active content and re-index it while
      touching neither upload nor delete. So did authoring a markdown
      document (`saveMarkdownWithMeta`, `updateDocument`), which this list
      did not mention. All four now assert `assertCanManageDocuments`
      before the tenancy lookup, with tests that a refusal leaves the write
      uncalled. - `create-document`, `update-document-*`, `delete-document-from-db`,
      `create-file` — **internal, correctly ungated.** They are reached only
      through `lib/services/document.ts` from the ingest chain and the
      website loader, or from the already-gated delete commands. Gating a
      helper as well as its entry point buys nothing and makes the entry
      point's gate look optional. - **re-embed — still open, deliberately.** `reembedFileCommand` and
      `reembedFolderWithPolicyCommand` are reachable, but their server
      actions check `requireOrgAdmin` — a **role**, not a flag — and the
      shared demo account is an org owner, so it passes. Re-embedding
      changes no content; the argument for gating it is model spend, which
      `monthlyCostLimitCents` already bounds. Left for its own change so
      that argument gets written down rather than assumed.
- [x] **B6.** Hide the corresponding controls client-side with
      `useOrgFeature`, so the demo does not present buttons that refuse.
      Cosmetic, but it is the half a prospect sees.

### Phase C — the demo deployment

Before the seed, so that nothing is ever run against an ambient
`DATABASE_URL`.

- [x] **C1.** Built as a Railway **environment inside the existing project**,
      not as a separate project as written above. It has its own Postgres and
      its own Qdrant, `TARGET_ENV=demo` and `NEXT_PUBLIC_TARGET_ENV=demo` at
      build time, and serves `demo.ragen.ai`.
- [x] **C2.** Done, and it changed the plan: `apps/web` had **no environment
      contract at all** — it imported `@ragenai/env` for `isDeployedEnv()` and
      validated nothing, so the thing C2 asked us to confirm was not true for
      the one app a visitor touches. It has one now, and unlike the other
      services it reports rather than exiting, because it serves the setup
      page that explains the failure.

**What the "separate project" line was protecting against, and what actually
happened.** The reasoning was that environments in one project can inherit
each other's variables. They can, and it bit exactly once: cloning production
carried its LiteLLM database credentials into demo, so LiteLLM could not
authenticate and hung until its healthcheck gave up — with no log line of its
own, because it never got far enough to print one. Fixed by pointing the
variable at a Railway service reference (`${{postgres.DATABASE_URL}}`), which
resolves per environment and cannot be cloned wrong again. A separate project
would have avoided that one incident; a reference avoids **that variable's**
class of cloning error.

It does not remove the isolation risk, and this section should not be read as
saying so. Nothing verifies that `DATABASE_URL` or `QDRANT_URL` on the app
services point at demo resources — `@ragenai/env` validates URL _syntax_, not
target — and the Phase D seed builds its Prisma client straight from
`process.env.DATABASE_URL` with no check of its own, so pointing it at
production with a slug that exists there would freeze a paying customer's
organization. **A fail-closed preflight belongs on the seed before Phase D is
closed:** refuse to run unless `TARGET_ENV` is `demo`, with an explicit
override for the rare case that is deliberate. Until that exists the
separate-project boundary is the only thing standing between a mistyped
variable and the wrong database.

**Five other things broke before this environment would start**, none of them
predicted here, all of them in Docker where `npm run verify` cannot see them:

- three Dockerfiles copied files by a path that did not match their build
  context (`infra/litellm`, and latently `infra/docling` and
  `infra/presidio/analyzer`);
- `apps/worker` built `@ragenai/storage` before `@ragenai/env`, which it had
  started depending on in Phase A — now guarded by
  `tests/architecture/dockerfile-package-build-order.test.ts`;
- `apps/web` ran a bare `npm ci`, so package `prepare` hooks fired in a stage
  with no sources, and then — once that was fixed with `--ignore-scripts` —
  `bcrypt`'s native binding stopped being built;
- two services carried a Custom Start Command from the cloned environment
  (`npm run start`), overriding what `railway.toml` and the Dockerfile `CMD`
  both said and crash-looping on a `package.json` the runtime image does not
  contain.

The general lesson, worth acting on before Phase D: **adding a dependency to a
shared package reaches Dockerfiles that no gate in this repo builds.** Three of
the five were consequences of one Phase A change.

### Phase D — the demo organization

- [ ] **D1.** Write the seed script: the org, its shared account, the flag
      overrides, `monthlyCostLimitCents`, `allowedModels`, and the sample
      corpus. Writing it is safe anywhere; it is not run in this step.
- [ ] **D2.** Run it against the Phase C deployment, and walk the prospect's
      path by hand: sign in, ask a question, get a citation, fail to upload.
- [ ] **D3.** Extend `e2e/seed/e2e-seed.ts` with a flag-restricted
      organization, without which the Phase B e2e test has nothing to assert
      against.
- [x] **D4.** A fail-closed target check in the seed, before it writes
      anything. It builds its Prisma client from `process.env.DATABASE_URL`
      and resolves an organization by slug, so nothing stops it from applying
      the demo's restrictions to a production organization whose slug happens
      to match. `@ragenai/env` will not catch it — it validates URL syntax,
      not which database the URL points at. Refuse unless `TARGET_ENV` is
      `demo`, with an explicit opt-out for the deliberate case, and say in the
      error which environment it found.

      Done. `assertDemoSeedTarget` lives in
          `features/subscriptions/services/`, not beside the script, because
          `apps/web/tsconfig.json` excludes `src/scripts` — a guard written there
          could reference a renamed export and still ship. Unset `TARGET_ENV`
          counts as "not demo"; the override is `--not-really-demo` and the script
          warns loudly when it is used. Backed by a unit test for the decision and
          an architecture test for the wiring, since the script itself is neither
          typechecked nor runnable outside a full app environment.

### Phase E — nightly thread cleanup

The repository has no Temporal Schedule, so this introduces the pattern as
much as the job.

- [ ] **E1.** Decide how the worker identifies the demo organization. It
      **must not** be `TARGET_ENV`, which would contradict this spec's own
      rule. Proposal: a `DEMO_ORGANIZATION_ID` variable naming the org — it
      is operational config rather than a behaviour branch, and it needs no
      migration. Trade-off: cleanup then serves exactly one organization,
      and a second demo org would need this revisited.
- [ ] **E2.** A workflow deleting that org's threads older than a configured
      age. It **cannot** reuse `DELETE /v1/internal/threads/:id`: that route
      sits behind `SessionAuthGuard` and needs a user's bearer token, which
      the worker has no way to mint. A scoped `deleteMany` in the worker is
      equivalent — `DocumentCitation`, `ThreadShare` and `ThreadPublicLink`
      cascade on delete, and `Thread.encryptedDek` is a column on the row
      being removed, so there is no separate key to clean up. Say this in the
      code, because "reuse the API path" is the obvious wrong instinct.
- [x] **E4.** (added 2026-09-08) The same nightly run re-applies the demo
      restrictions. The shared account holds the org-admin role, so "someone
      clears the flags on the demo org" (Failure modes) was a real gap with no
      lock. `DEMO_FEATURE_OVERRIDES` and the spend cap moved to
      `@ragenai/platform-contracts` so the seed and the worker write the same
      object; the worker upserts exactly those two columns and leaves
      `allowedModels` — the operator's choice — alone.
- [x] **E5.** (added 2026-09-08) The shared *account* is frozen as well as the
      tenant: name, password and session revocation are refused by a Better
      Auth `hooks.before` in `lib/auth.ts` for the address in
      `NEXT_PUBLIC_DEMO_EMAIL`, and the forms disable themselves for it. Keyed
      on the published address, not on `TARGET_ENV`, for the reason in
      `libs/demo-credentials.ts`.
- [ ] **E3.** Make a failed run visible. `apps/worker` has **no alerting** —
      only OTel and Langfuse — so this is a new capability, not a checkbox.
      Either add one, or scope this to "the run logs an error and a
      dashboard shows it", and say which.

## Testing

- **Unit** — `isDeployedEnv()` across every `TARGET_ENV` value including
  `demo`; the resolver over the new keys, including that an explicit `false`
  override beats a `true` default.
- **Integration** — every gated write refused when the flag is off and
  allowed when on, in `apps/web` **and** `apps/api` separately, because they
  are separate implementations.
- **e2e** — the prospect's path as `p0-*`, not `p1`+: a PR runs only
  `smoke-*` and `p0-*`, so a `p1` test would not gate the PR that breaks the
  demo. Depends on D3.
- **Worker** — the cleanup workflow: deletes threads past the age, leaves
  fresher ones alone, idempotent on a re-run, and scoped to one organization.

## Rollout and rollback

A and B ship first, in that order, each on its own. C through E follow.

**Rollback is `git revert` at every phase**, which is only true because there
is no migration: the new flag keys default to `true`, so reverting them
restores exactly the behaviour every existing organization already had. The
demo organization is a row — deleting it removes the demo without touching
anyone else. Two things outlive a revert: the Temporal Schedule, which must
be deleted from Temporal as well as from the code, and the Railway project.

## Known documentation drift to fix in passing

`packages/env/src/fragments.ts:67` says `TARGET_ENV` is "read by all five
apps". There are six workspaces under `apps/`, and `apps/mcp` reads it in
three places.
