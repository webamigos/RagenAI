---
title: Replace the LiteLLM proxy with an in-process gateway package
status: draft
areas: [architecture, api, worker, admin, rag]
adrs: [04, 21, 22, 33, 34, 37, 39]
---

# Replace the LiteLLM proxy with an in-process gateway package

## TLDR

LiteLLM has been quietly reduced to four jobs — provider adapters for Azure,
Bedrock, Vertex and Scaleway; virtual keys; per-team rpm/tpm; and a spend log
the application already keeps a better copy of. Everything else it was adopted
for in [ADR-04](../adrs/04-litellm-unified-llm-gateway.md) now lives in the
application, in two places at once, and the admin panel has a whole page whose
only job is to report the disagreement. This retires the proxy in two phases:
first move the control plane into the database (worth doing whatever we decide
about the proxy), then replace the data plane with `packages/llm-gateway` built
on AI SDK v6 providers.

The non-obvious part: **the monthly cost, token and message ceilings are not
enforced anywhere in this codebase today.** `checkUsageLimitsQuery` has no
callers. The only thing standing between an organization and an unbounded bill
is LiteLLM's virtual-key budget, recognised by matching the substring
`'Budget has been exceeded'` in an error message. Phase A is therefore not a
refactor; it is the first implementation of a limit the settings UI has been
promising.

## Answered

- **Q1 — provider credentials may live in the application processes.**
  Confirmed 2026-09-14. Phase B is alive, and `packages/llm-gateway` is the
  target. The operational consequence is real and belongs in its rollout:
  credential rotation stops being one container restart and becomes three
  deployments that must roll together.
- **Q5 — the ceiling stays a hard block.** Not a new decision so much as
  keeping the one already shipped: LiteLLM's budget refuses with a 4xx today,
  and the teams UI already promises it ("this team's requests are blocked until
  the next reset"). The application now refuses _before_ the turn costs
  anything, which is strictly better than the mid-stream refusal it replaces.
  The proxy can still refuse mid-stream while it remains in the path — the
  spend of the turn in flight is not in `AiUsage` yet — so that rejection is
  mapped to the same typed error rather than being deleted early.

## Open Questions

<!--
While this block is here, the spec is not ready to implement and no code
should be written from it.
-->

- **Q2 — What happens to the spend history in `litellm-postgres`?**
  Narrower than it first looked: the organization AI-usage dashboard already
  reads `AiUsage`, and `getLiteLLMUsageDashboardQuery` turns out to have no
  callers at all. The only live readers of `/spend/logs` are **team** usage —
  the teams UI and the CSV export — and the admin proxy page. So the question is
  really about team history, and it has a data-model catch: `AiUsage` has no
  team dimension. Either add `teamId` and backfill it from `Thread.teamId`
  (which covers chat but not ingest-time embeddings), or accept that team usage
  restarts at the cutover. Archiving a `pg_dump` is orthogonal and cheap; do it
  regardless.
- **Q3 — Do per-team rpm/tpm limits survive?**
  `Team.rpmLimit` / `Team.tpmLimit` are collected in
  [TeamSettingsSection.tsx](../../apps/web/src/app/components/Teams/TeamSettingsSection.tsx)
  and forwarded to LiteLLM, which is the only thing that enforces them. Keeping
  them means implementing a Redis token bucket; dropping them means deleting
  two columns and two form fields. Do not answer "keep" without checking
  whether any customer has ever set one.
- **Q4 — Is there a migration path for existing self-hosted installs, or is
  this a breaking major?** `create-ragen-app` writes a LiteLLM `model_list`
  entry during setup; a Helm chart ships the proxy. Either we ship a migration
  that reads `config.yaml` and writes the equivalent model records, or we
  document a manual step and bump the major.

## Problem

### The proxy's job has shrunk to the point where the integration costs more than it saves

ADR-04 adopted LiteLLM for six reasons. Five of them are now satisfied by the
application itself:

| ADR-04 rationale                            | Where it lives today                                                                                                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One client library for all providers        | still true — `@ai-sdk/openai` against the proxy                                                                                                                              |
| Model management without app code changes   | `MODEL_REGISTRY` in `packages/platform-contracts`, plus `allowedModels` per org and per team in the database                                                                 |
| Langfuse tracing for all LLM calls          | `@langfuse/tracing` in `apps/web` and `apps/worker`, app-level, since #1117                                                                                                  |
| Provider failover and load balancing        | **deliberately disabled** — `router_settings` in [config.yaml](../../infra/litellm/config.yaml) records why, and the multimodal swap moved into `chat-completion-factory.ts` |
| Per-org model restrictions via `/v1/models` | `allowedModels` filtered in `getAvailableModelsForOrganization()`                                                                                                            |
| Cost and usage accounting                   | `AiUsage` + `ai-pricing.ts`, written from every call path                                                                                                                    |

What remains: provider adapters for four upstreams, virtual keys, rpm/tpm, and
`/spend/logs`.

### The duplication has already produced defects, and a page to find them

[ADR-34](../adrs/34-shared-litellm-client-package.md) documents two: a budget
written to a team no traffic passed through, and a set of proxy writes whose
failures were indistinguishable from success. The fix was a shared client — and
a new admin page,
[apps/admin/src/app/(dashboard)/proxy/page.tsx](<../../apps/admin/src/app/(dashboard)/proxy/page.tsx>),
whose entire purpose is reconciliation: `findStrandedOrgs`, `budgetHasDrifted`,
`findOfferableButUnserved`. That page is not a feature. It is the cost of two
systems each believing they own budgets, model allowlists and team membership.

### The limit the settings UI promises is not enforced

`OrganizationSettings` carries `monthlyTokenLimit`, `monthlyCostLimitCents` and
`monthlyMessageLimit`.
[check-usage-limits-query.ts](../../apps/web/src/features/ai-usage/services/queries/check-usage-limits-query.ts)
computes all three against `AiUsage` and returns `isAnyLimitExceeded`. **Until
PR 3 of this spec, nothing called it.** There was no executable call site
anywhere; the only references were its own definition and a comment in
`apps/admin/src/lib/litellm.ts` claiming, incorrectly, that the app enforces
cost limits with it.

The API request ceiling _is_ enforced, by `checkApiRequestLimit`, on the public
API path only. The chat path has nothing. So the ceiling an administrator sets
in the panel is applied by LiteLLM, to a virtual key, and surfaces as this:

```ts
// apps/web/src/app/api/chatbot/[token]/chat/budget-error.ts
export const BUDGET_MARKERS = ['Budget has been exceeded', 'ExceededBudget'];
```

An upstream reword of that message silently removes the last backstop, and no
test in this repository would notice.

### The operational surface is disproportionate

- A **second Postgres** (`litellm-postgres`) in `docker-compose.yml`, in the
  Helm chart, and in whatever backs up production.
- A **Python service** on the request path of every LLM call, in a monorepo
  that is otherwise TypeScript end to end.
- **Auto-migrations of someone else's schema on container boot**, which is why
  [the upgrade runbook](../runbooks/litellm-upgrade.md) opens with a mandatory
  `pg_dump` and a warning that `-stable` tags stopped existing after v1.90.
- A `socat` shim in [entrypoint.sh](../../infra/litellm/entrypoint.sh) to make
  the image work with Railway's IPv6 networking.
- `create-ragen-app` performs a **text splice into a hand-commented YAML file**
  ([litellm-config.ts](../../packages/create-ragen-app/src/litellm-config.ts))
  because round-tripping it through a YAML library would destroy the comments.

`AiUsage` is already the better record of the two: it covers reranking, which
bypasses the proxy entirely
([scaleway-reranker.ts](../../apps/web/src/libs/reranker/scaleway-reranker.ts)),
and it carries `projectId`, `threadId` and `step`, none of which `/spend/logs`
knows about.

It has also already won, without anyone recording it. The organization
AI-usage dashboard reads `AiUsage` through `getAiUsageDashboardQuery`, and the
478-line `getLiteLLMUsageDashboardQuery` beside it has **no callers** — a
second dead query in the same feature module as `checkUsageLimitsQuery`, and
the same shape of leftover. What still reads `/spend/logs` is narrower than the
file count suggests: team usage (the teams UI and the CSV export) and the admin
proxy page.

## Out of scope

- **Reranking and document parsing.** Scaleway rerank already bypasses the
  proxy; Docling and Presidio are unaffected and stay Python.
- **The public API's shape.** `apps/api` keeps its OpenAI-compatible surface
  exactly as it is. This spec changes what is behind it, not what it looks
  like.
- **Model selection or routing policy.** No model is added, removed or
  re-defaulted here. `DEFAULT_MODEL`, `REPHRASE_MODEL`, `SUMMARY_MODEL` and
  `EMBEDDINGS_MODEL` keep their current values; changing any of them is an
  ADR-20 exercise with its own measurement.
- **Prompt caching, semantic caching and guardrails.** LiteLLM's are disabled
  (`cache: false`, no guardrails configured). We are not gaining or losing
  them.
- **BYO provider keys per organization.** The five encrypted key columns on
  `OrganizationSettings` are a separate path that already bypasses the proxy
  and is untouched.
- **Two-phase commitment.** Phase A is independently deployable and
  independently valuable. Shipping A and stopping is an acceptable outcome —
  see Q1.

## Proposed solution

Two phases, in order, with a decision gate between them.

**Phase A — the control plane moves into the database; LiteLLM stays as a
router.** Budgets, allowlists and usage accounting become single-sourced in
Postgres. Limits get enforced by the application, before the provider call,
with a typed `UsageLimitError` rather than a matched substring. LiteLLM
teams degrade to a carrier for virtual keys and nothing else. The reconciliation
page goes away because there is nothing left to reconcile.

**Phase B — `packages/llm-gateway` replaces the proxy.** A workspace package
wrapping AI SDK v6 providers (`@ai-sdk/azure`, `@ai-sdk/amazon-bedrock`,
`@ai-sdk/google-vertex`, `@ai-sdk/openai-compatible`), consumed in-process by
`apps/web`, `apps/api` and `apps/worker`. The model catalogue moves from
`config.yaml` to `MODEL_REGISTRY`, which is already the thing every app reads.
Virtual keys, the second Postgres, the Python container and the upgrade runbook
all disappear with it.

### Alternatives considered

**Keep LiteLLM as it is.** Rejected as the default, but note what it actually
costs to keep: the reconciliation page, the dual accounting, the substring
budget check, the second database, and one upgrade runbook per year. Phase A
removes most of that _without_ removing LiteLLM, which is why it comes first.
If Q1 answers "credentials must stay isolated", this becomes the outcome — and
a considerably better version of it than today.

**`apps/llm-proxy` — the same thing as a separate service.** Rejected. The
arguments for a network hop are a shared cache, a shared rate limiter, non-TS
clients, and isolating provider credentials from application code. We have no
shared cache (LiteLLM's is off), no non-TS client, and an OpenAI-compatible
surface already exists in `apps/api`. That leaves credential isolation, which
is Q1 — and if Q1 says credentials must be isolated, keeping LiteLLM is
cheaper than writing a proxy to isolate them. A separate service would add a
deployment, a health check, an auth boundary, an on-call surface and a second
hop, in exchange for one property we can get by not moving.

**A managed gateway (OpenRouter, Vercel AI Gateway).** Rejected for the default
path: it re-introduces a third party on the request path for EU-resident
customer documents, which is the constraint
[docs/model-routing.md](../model-routing.md) exists to satisfy. OpenRouter stays
supported as a per-org BYO option, as today.

**Fork LiteLLM.** Rejected. Inherits the Python runtime, the schema and the
upgrade burden, and adds the fork's own merge cost.

## Core surfaces touched

| Surface                          | Change                                                                                                                             | What catches a mistake                                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`           | Phase B drops `Team.litellmTeamId`, `Team.litellmKeyToken`, `OrganizationSettings.litellmApiKey`; Q3 decides `rpmLimit`/`tpmLimit` | migration + `npm run verify`                                                                                                                |
| `packages/litellm-client`        | Phase A shrinks it to the read endpoints; Phase B deletes the package                                                              | its own tests, then consumers: web / api / admin                                                                                            |
| `packages/platform-contracts`    | `MODEL_REGISTRY` becomes the catalogue of record, not a mirror of `config.yaml`                                                    | `model-catalog.test.ts`, `shared-contracts-are-not-recopied.test.ts`                                                                        |
| **`packages/llm-gateway` (new)** | the provider adapters                                                                                                              | package tests + each consumer's build                                                                                                       |
| `packages/env`                   | `litellm` fragment retires; provider fragments gain their credentials, each merged with its rule                                   | `provider-fragments-carry-their-rules.test.ts`, per-app env schema tests                                                                    |
| `packages/create-ragen-app`      | `litellm-config.ts` and the YAML splice go; the manifest changes                                                                   | `create-ragen-app-manifest-is-current.test.ts`, `create-ragen-app-llm-examples-match-config.test.ts` (which itself dies with `config.yaml`) |
| `packages/rag-core`              | `embedding-contract.ts` references the proxy in comments only                                                                      | package tests                                                                                                                               |
| auth / tenant scoping            | none — limits are enforced with an org id already derived from the session                                                         | existing guard tests                                                                                                                        |
| `src/lib/auth-guards.ts`         | none                                                                                                                               | —                                                                                                                                           |

`infra/litellm/`, `docker-compose*.yml`, `deploy/helm/ragen`, `.devcontainer/`
and `.github/workflows/e2e.yml` all reference the proxy and all change in
Phase B. Five architecture tests read those files and will fail until they are
updated in the same commit: `devcontainer-agrees-with-the-repo`,
`docs-name-the-published-service-ports` (port 4000),
`env-example-starts-every-app`, `config-reference-is-generated` and
`create-ragen-app-knows-the-provider-seams`. That is the intended behaviour —
they are the list of places a half-finished removal would otherwise leave
behind.

## Data model

**Phase A — one index, and one column if Q2 says so.** The ceilings need no
new schema: `AiUsage` holds the aggregates, `OrganizationSettings` the limits,
`Team` the allowlist. PR 3 adds an index, since the guard aggregates that pair
before every chat turn:

```prisma
@@index([organizationId, createdAt])   // ai_usage — replaces the org-only index for this query
```

PR 6 adds `AiUsage.teamId` (nullable, indexed) so team usage can leave
`/spend/logs`. Rows written before it are backfilled from `Thread.teamId`
where a `threadId` exists; ingest-time embeddings and reranking have no thread
and stay null, which the teams UI must show as unattributed rather than fold
into a team's total. Skip the column only if Q2 answers "team usage restarts at
the cutover".

**Phase B — three columns retire, once nothing reads them:**

| Column                               | Disposition                                                     |
| ------------------------------------ | --------------------------------------------------------------- |
| `Team.litellmTeamId`                 | drop                                                            |
| `Team.litellmKeyToken`               | drop — encrypted virtual keys, worthless once the proxy is gone |
| `OrganizationSettings.litellmApiKey` | drop                                                            |
| `Team.rpmLimit` / `Team.tpmLimit`    | Q3                                                              |

Rows written before this change: `AiUsage` is unaffected and keeps accumulating
across both phases. The virtual-key columns are dropped, not migrated — there
is nothing to migrate them to. The spend history in `litellm-postgres` is Q2,
and the migration ordering depends on the answer: a backfill has to run
_before_ the container is removed.

## Failure modes

- **Provider is down.** Today LiteLLM returns the upstream error unchanged
  (fallbacks are off) and the app surfaces it. The gateway must do exactly the
  same — this is not the place to introduce a silent fallback; `router_settings`
  in `config.yaml` records why the last one was removed.
- **Vertex service-account token expires mid-request.** LiteLLM refreshes it
  today. `@ai-sdk/google-vertex` does too, but the failure is a 401 that looks
  like a credential error, so the gateway must distinguish "expired, retry
  once" from "wrong credentials, fail loudly". Covered by a unit test with a
  faked clock.
- **A stream crosses the cost ceiling halfway through.** Q5. Whatever we
  choose, the answer must be the same for the panel chat, the chatbot widget
  and the public API — three surfaces, one rule.
- **Two concurrent requests both pass the limit check.** The check is an
  aggregate read; nothing serialises it. Both proceed and the org ends the month
  slightly over. Acceptable, and cheaper than a lock — but it must be written
  down rather than discovered, and the overshoot is bounded by one request per
  concurrent caller, not by the model's price.
- **`AiUsage` write is fire-and-forget.** Several call sites use
  `void trackAiUsage(...)`. A crash between the provider response and the write
  loses the cost, which now also means it loses the enforcement input. Phase A
  should make the chat path await it, or accept and document the gap.
- **The limit check adds a query to every chat request.** An aggregate over
  `ai_usage` for the current month, per request. With the composite index this
  is cheap for a month of one org's rows; if it is not, cache it in Redis with
  a short TTL rather than skipping it.
- **The `ai_usage` index was built non-concurrently.** A plain `CREATE INDEX`
  takes a lock that makes concurrent writes wait for the build, and
  `trackAiUsage` writes on every AI call. `CREATE INDEX CONCURRENTLY` cannot go
  in a Prisma migration — migrations run inside a transaction and Postgres
  refuses it there — so the options were a blocking build in the migration or
  an out-of-band step that leaves migration history lying about what ran. We
  took the blocking build: the wait is the index build time on one month's
  partition of a small table, and `trackAiUsage` is mostly fire-and-forget, so
  a slow write delays no user.

  **An installation with a large `ai_usage` can build it by hand first, but not
  by simply creating it** — `migration.sql` runs an unconditional
  `CREATE INDEX`, so an index that already exists fails the deploy, and one
  under a different name leaves Prisma building a second, blocking copy. The
  sequence is: create it concurrently under the exact name
  `ai_usage_organization_id_created_at_idx`, then tell Prisma the migration is
  already done, then deploy.

  ```sh
  psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY "ai_usage_organization_id_created_at_idx" ON "ai_usage"("organization_id", "created_at");'
  npx prisma migrate resolve --applied 20260914000000_ai_usage_indexes_the_ceiling_query
  npx prisma migrate deploy
  ```

  Raised by review on #1149 and #1151; recorded rather than fixed in place,
  because the migration is already applied and editing an applied migration
  breaks its checksum.

- **Provider credential rotation.** Today one container restarts. After Phase B,
  three deployments read the same secrets and must roll together. Q1 territory.
- **Model id drift.** `config.yaml` names and `MODEL_REGISTRY` names can
  currently disagree; after Phase B there is one list, which removes the class
  of failure entirely. During the transition an architecture test must assert
  they agree.

## Phases

Each step leaves the application working.

### Phase A — the database owns the control plane

Nine pull requests. Each one leaves the application working and is reviewable
on its own; the dependency notes say which can run in parallel.

**PR 1 — `chore(ai-usage): delete the dead LiteLLM usage dashboard query`** — **merged (#1145)**
_No behaviour change. Independent of everything else; land it first to shrink
every diff after it._

- [x] Delete `get-litellm-usage-query.ts` — both exports
      (`getLiteLLMUsageDashboardQuery`, `getLiteLLMOrgUsageLimitsQuery`) have
      zero callers, and the organization dashboard has been served by
      `getAiUsageDashboardQuery` against `AiUsage` for some time.
- [x] Update the `byOrg: []` comment in `get-ai-usage-dashboard-query.ts`,
      which cites the deleted file as the reason the field still exists. Decide
      there whether `byOrg` goes too, or say why it stays.
- [x] Proof it was dead: `grep -rn getLiteLLMUsageDashboardQuery apps` returns
      the definition only, and there is no barrel in `features/ai-usage`.

**PR 2 — `feat(i18n): message keys for a blocked request`** — **merged (#1148)**
_Additive only: 15 locale files, no logic. Separate and early on purpose —
locale JSON is this repo's worst merge-conflict surface, so it should be in
`main` before three enforcement branches exist at once._

- [x] One key, `chain-errors.usage-limit-exceeded`, in all fifteen locales.
      Shipped as **one** key rather than one per ceiling: from the chat user's
      side the action is identical whichever ceiling it was, so the dimension
      goes to the log and the admin panel instead. "The start of next month" is
      exact without an ICU parameter, because the window is a calendar month in
      UTC (`getMonthStart`).
- [x] `i18n-keys-exist-in-both-locales` stays green.

**PR 3 — `feat(ai-usage): enforce the org ceilings on the panel chat path`** — **merged (#1149)**
_The core of Phase A. Depends on PR 2._

- [x] Add the guard — one exported function over `checkUsageLimitsQuery`,
      throwing `UsageLimitError` — a `ChainError`, so `SseExceptionFilter`
      forwards its code and the client renders the translated string. Not
      `LimitExceededException` from `src/libs/utils/errors.ts`: that one is a
      plain `Error`, and the SSE filter would wrap it as `UnknownChainError`
      and show "an unexpected error occurred". Everything after this reuses it.
- [x] Call it in `streamEvents` (`assistant-stream.ts`), where the removed
      check used to sit — after the settings/thread/key resolution around
      line 340, before the chain runs.
- [x] Migration: `@@index([organizationId, createdAt])` on `ai_usage`. The
      guard aggregates that pair on every turn.
- [x] Answers Q5 in code, for one surface. Whatever it decides about a stream
      that crosses the line mid-response is the answer PRs 4 and 5 copy.
- [x] Delete the note added above `checkUsageLimitsQuery` saying nothing calls
      it — this is the PR that makes it false.
- [x] Unit tests at the boundary (at, one under, one over, and all three
      ceilings null); integration test through the route.
- [x] **Two corrections the enforcement could not ship without**, both found
      while wiring it and both invisible while the query had no callers: - `monthlyMessageLimit` was counted as `_count` over **every** `AiUsage`
      row. One document ingest writes a row per embedded chunk, and the admin
      panel suggests 500 for this ceiling, so switching enforcement on would
      have refused chats because somebody uploaded a PDF. Now counted over
      `step = CHAT_COMPLETION`. - `isAnyLimitExceeded` includes the **API request quota**, which counts
      only rows tagged `source = 'API'`. Enforcing it on a panel turn would
      refuse a person typing in the browser because an integration used up
      the month. The guard takes the dimensions that apply, and
      `CHAT_USAGE_DIMENSIONS` excludes it.
- [x] The proxy's own budget rejection now carries the typed error too. It used
      to build a plain `Error` with a hand-written sentence that no reader ever
      saw: `SseExceptionFilter` wraps a non-`ChainError` as `UnknownChainError`,
      and the client renders `t(code)` and drops `message` once a code is
      present. Someone whose organization had hit its budget was told "an
      unexpected error occurred". The substring match stays until PR 7 stops
      the proxy enforcing — deleting a live signal early would only make it
      silent again.

**PR 4 — `feat(chatbot): enforce ceilings on the public surfaces, and drop the substring budget check`** — **open**
_Depends on PR 3._

- [x] Same guard in the chatbot route. **The guest-thread path needed nothing**
      — it calls `streamEvents`, so PR 3 already covers it. Worth recording
      rather than quietly skipping: the spec assumed two surfaces and there is
      one.
- [x] Deleted `budget-error.ts` and its test — replaced by `isUsageLimitRefusal`,
      which answers "is this organization over a ceiling" for both the
      application's own refusal and the proxy's. The proxy markers now exist in
      exactly one place; there were two (that file, and an inline pair of
      `includes` in `assistant-stream.ts`). The widget's `budget_exceeded`
      SSE event stays — it now fires from the typed exception, so the wire
      contract with the embedded widget does not change.

**PR 5 — `feat(api): enforce ceilings on the API paths`**
_Depends on PR 3. Parallel with PR 4._

- [ ] `apps/web`: `api/v1/chat/route.ts` and `api/v1/chat/completions/route.ts`,
      beside the existing `checkApiRequestLimit` call.
- [ ] `apps/api`: `chat.service.ts`, `chat-completions.service.ts` and
      `search.service.ts`, beside `ApiLimitsService.checkApiRequestLimit` —
      which is where the ported copy of this logic belongs, not in a new
      module.
- [ ] The OpenAI-compatible surface returns the error in the shape a client
      expects, not a bare 500.

**PR 6 — `feat(teams): team usage comes from AiUsage, not the proxy`**
_Depends on Q2. Independent of PRs 3–5; the only one with a schema change and
a backfill._

- [ ] Add `AiUsage.teamId` (nullable) with an index, and populate it wherever a
      team is resolved — `resolveLiteLLMKeyQuery` already knows it on the chat
      path.
- [ ] Backfill historical rows from `Thread.teamId` where a `threadId` exists.
      Rows with no thread (ingest embeddings, reranking) stay null; say so in
      the UI rather than attributing them to a team.
- [ ] Rewrite `get-team-usage-query.ts` and
      `api/organization/teams/[teamId]/usage-csv/route.ts` against `AiUsage`.
      Both currently swallow proxy errors and report zero usage — a database
      read should fail loudly instead.
- [ ] After this, nothing in `apps/web` calls `/spend/logs`.

**PR 7 — `refactor(admin): the database is the only writer of budgets and allowlists`**
_Depends on PRs 3–5 being live in production — this removes the proxy's copy of
a ceiling, so the application's must already be enforcing._

- [ ] `syncOrgToLiteLLM` and the `*-litellm-team-command` files stop pushing
      `max_budget`, `models`, `tpm_limit` and `rpm_limit`. Team creation and
      key provisioning stay.
- [ ] Q3 lands here: either a Redis token bucket for rpm/tpm, or the two
      columns and their two form fields are deleted.
- [ ] The admin limits and models actions no longer report a sync result they
      no longer perform; the audit entry records the database write.

**PR 8 — `refactor(admin): retire the proxy reconciliation page`**
_Depends on PR 7. Nothing left to reconcile once the database is the only
writer._

- [ ] Delete `proxy/analysis.ts` and its tests (`findStrandedOrgs`,
      `budgetHasDrifted`, `findOfferableButUnserved`).
- [ ] Keep a health strip: reachability and which model is down stay useful
      until the proxy is gone in Phase B.
- [ ] The operator-facing copy on that page currently says the app enforces
      cost limits itself. After PRs 3–5 that is finally true; check the wording
      says what it means.

**PR 9 — `test(e2e): an organization at its ceiling is refused`**
_Depends on PRs 3–5. Can be written alongside them and merged last._

- [ ] A `p0-*` spec — an org seeded over its cost ceiling gets the refusal, not
      a 500 and not an answer. `p1`–`p3` would not gate the PR that breaks it.
- [ ] Seed support for an org with usage already recorded.
- [ ] Update `docs/regression-checklist.md`, and amend ADR-34's 2026-09-14
      update to say the gap it describes is closed.

**Gate.** Answer Q1 with PRs 1–9 in production. If credentials cannot move, stop
here, record it as an ADR amending 04, and close the spec as partially done.

### Phase B — `packages/llm-gateway` replaces the proxy

- [ ] **B1.** Create the package: AI SDK v6 providers for Azure, Bedrock,
      Vertex and OpenAI-compatible (Scaleway), a `resolveModel(id)` reading
      `MODEL_REGISTRY`, and the two behaviours that currently live in
      `chat-completion-factory.ts` — the multimodal swap and `reasoning_effort`
      injection. No consumer yet; the app still runs on the proxy.
- [ ] **B2.** Switch chat and embeddings behind `LLM_GATEWAY=litellm|native`,
      defaulting to `litellm`. Run the retrieval evals under both per
      [ADR-20](../adrs/20-pause-and-measure-rag-quality.md) and record the
      comparison in `docs/`.
- [ ] **B3.** Move speech and transcription
      ([openai-provider.ts](../../apps/web/src/libs/speech/openai-provider.ts))
      off `LITELLM_PROXY_URL`.
- [ ] **B4.** Flip the default to `native` in one environment (demo) for a
      week, then everywhere. The flag stays.
- [ ] **B5.** Remove virtual keys: `resolveLiteLLMKeyQuery`, the remaining team
      commands, the three columns.
- [ ] **B6.** Remove the infrastructure: `infra/litellm/`, the compose service
      and its Postgres, the Helm values, the devcontainer wiring, the e2e mock
      proxy, the promptfoo configs' base URLs, `packages/litellm-client`,
      `create-ragen-app`'s YAML splice, and the upgrade runbook.
- [ ] **B7.** Write the ADR superseding ADR-04 and reducing ADR-34. Add an
      architecture test asserting nothing imports a LiteLLM symbol. Add the
      lesson: _a query that computes a limit is not a limit until something
      calls it._

## Testing

- **Unit** — the gateway's provider adapters, one per upstream, against
  recorded responses: streaming deltas, tool calls, the Vertex token refresh,
  Azure's `max_completion_tokens` rename. Also `checkUsageLimitsQuery`'s
  boundary behaviour at exactly the limit.
- **Integration** — the limit check on all three chat surfaces, including the
  mid-stream case from Q5. This is the part most likely to be right on one
  surface and missing on another.
- **e2e** — a `p0-*` spec: an org at its ceiling gets a refusal with the right
  message rather than a 500 or a successful answer. It has to be `p0`, not
  `p1`, or the PR that breaks it merges green.
- **Evals** — the three harnesses in `apps/web/evals`, before and after B2, per
  ADR-20. A retrieval delta is a blocker, not a footnote.
- **Architecture** — the model-id agreement test during the transition; the
  no-LiteLLM-imports test after B6.
- **Package tests** for `packages/llm-gateway` and the thin per-app bindings —
  the binding files are exactly the "five-line file that fails silently" case
  `AGENTS.md` calls out.

## Rollout and rollback

**Phase A** ships without a flag, one PR at a time. PR 3 is the one that
changes user-visible behaviour — requests are refused at the ceiling for the
first time — so it goes out with a note to any organization already over one.
Identify them from the existing AI-usage dashboard before it lands: an org that
has been over its ceiling for months will experience the fix as an outage.
Rollback for PRs 1–5 is a revert; PR 6's column is additive and its backfill
re-runnable; PRs 7 and 8 are only safe to revert while the proxy still holds the
budgets they stopped writing, which is why they land after PRs 3–5 are proven in
production.

**Phase B** is flag-gated end to end. `LLM_GATEWAY=litellm` is the default
through B1–B3; demo flips first in B4; production follows after a week with no
error-rate or eval regression. Rollback until B5 is one environment variable
and a restart, which is why B5 and B6 are separate steps from B4 and must not
land in the same release.

Column drops come last, in their own migration, at least one release after the
code that read them is gone — a rolled-back deploy must not meet a dropped
column. The `litellm-postgres` volume is retained for 30 days after B6
regardless of the Q2 answer, since deleting it is the one irreversible step in
the whole spec.
