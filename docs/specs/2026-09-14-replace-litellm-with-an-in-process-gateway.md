---
title: Replace the LiteLLM proxy with an in-process gateway package
status: in-progress
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
on AI SDK v7 providers.

Retired as a **dependency**, not as an option: the gateway's route table keeps a
variant for any OpenAI-compatible endpoint, which LiteLLM is. Attaching one
stays supported and costs nothing extra — as a router, not as a control plane,
since budgets and allowlists move into the application. See Q6.

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
- **Q2 — team usage starts from zero.** Confirmed 2026-09-14: no backfill. The
  `team_id` column is added nullable and populated going forward; rows written
  before it stay unattributed. A partial backfill from `Thread.teamId` was the
  alternative and is worse than none — it would cover chat turns only, so a
  team's total would silently exclude whichever of its work had no thread while
  looking complete.

- **Q3 — per-team rpm/tpm stay, and the proxy keeps enforcing them for now.**
  Confirmed 2026-09-14: keep them, so limits can be set later. Taken one step
  further than the words, on purpose. Stopping _all_ sync would have left two
  fields collected in the panel and enforced by nothing — the exact shape this
  phase exists to remove. So PR 7 stops syncing budgets and allowlists, which
  the application now owns, and **keeps syncing `tpm`/`rpm`**, which only the
  proxy enforces. Behaviour is unchanged and no field goes dead.

  That makes it a bridge with a deadline. LiteLLM is to disappear entirely, so
  **Phase B must reimplement per-team rate limiting before the proxy is
  removed**, or the removal quietly takes a feature with it. Redis is already a
  dependency — rate limiting is the one thing it is used for — so a token
  bucket has somewhere to live. Held by
  `tests/architecture/only-rate-limits-reach-the-proxy.test.ts`, which fails
  both ways: if a budget goes back to the proxy, and if the rate limits stop
  going there while nothing has replaced them.

- **Q4 — a breaking major, with no migration path.** Confirmed 2026-09-14:
  there are no other installations. Phase B therefore does **not** need the
  migrator that reads `infra/litellm/config.yaml` and writes equivalent model
  records — `create-ragen-app` simply stops writing LiteLLM configuration, and
  the upgrade notes carry the manual step. Building a migration path into a
  transitional state that is itself being deleted would be work that outlives
  nothing.

- **Q6 — LiteLLM stays usable, as one variant of an OpenAI-compatible seam.**
  Confirmed 2026-09-14. The question was whether retiring the proxy as the
  default also ends support for running one. It does not, and keeping it is
  nearly free: LiteLLM is OpenAI-compatible, which is the same shape B1 already
  builds for Scaleway. Re-attaching it is registering a route — an
  OpenAI-compatible provider, a `baseURL`, a key — not writing an adapter. It
  is what `chat-completion-factory.ts` does today with
  `createOpenAI({ baseURL })`, except as one upstream among several rather than
  the only road.

  What is supported is therefore **any OpenAI-compatible endpoint**, not
  "LiteLLM". One mechanism then covers vLLM, Ollama, TGI and AI Gateway too,
  and nothing loads in-process, so it does not reopen
  [ADR-38](../adrs/38-mcp-is-the-plugin-api-no-in-process-plugin-runtime.md).
  The shape already exists in `packages/env/src/provider-seams.ts`
  (`STORAGE_SEAM`, `ENCRYPTION_SEAM`, `RERANK_SEAM`, `MAIL_SEAM`), which is
  what the ADR 44/45/46 programme extends to runtime, vector store and parser.

  Three things have to hold, or the answer quietly becomes "no":

  1. **B1's route table is configuration, not a constant in TypeScript.** This
     is the whole decision. A table compiled into the package turns attaching
     an endpoint into a fork.
  2. **`ModelProvider` stops being a one-member union.** It is
     `export type ModelProvider = 'litellm'` in
     `packages/platform-contracts/src/llm/model-catalog.ts`. Renaming it to
     `'native'` after B6 moves the problem rather than solving it.
  3. **B4's flag becomes a seam variant.** `LLM_GATEWAY=litellm|native` is
     self-contradicting as written: B4 keeps the flag, B6 deletes
     `packages/litellm-client`, the e2e mock proxy and the promptfoo base URLs
     — after which the flag has one value. A dead field kept for its own sake
     is the exact shape Q3 exists to avoid.

  One case forces the seam regardless of this decision: `RERANK_SEAM`'s
  `cohere` variant is documented as routing through `LITELLM_PROXY_URL`, the
  variable B6 deletes. That variant needs a configurable base URL of its own or
  it stops working silently, so the endpoint has to become configuration either
  way.

  **Made concrete 2026-09-15.** [`docs/attaching-a-gateway.md`](../attaching-a-gateway.md)
  documents Portkey, LiteLLM, vLLM and Ollama as worked examples, which is the
  form this answer had to take to be true — Q6 was a decision, and until it was
  written down as a procedure nobody could act on it.

  Writing it exposed one gap: a connection could carry a base URL and a key and
  nothing else, and **Portkey routes on headers** (`x-portkey-provider`, or
  `x-portkey-config` for a saved routing config). So the promise held for
  LiteLLM and vLLM and quietly failed for the gateway most worth attaching.
  `LLM_<NAME>_HEADERS` closes it. This is also the answer to Q8: the reason not
  to build a proxy of our own is that attaching a better one is two lines of
  configuration.

  **Virtual keys are not part of the offer.** B5 drops `Team.litellmTeamId`,
  `Team.litellmKeyToken` and `OrganizationSettings.litellmApiKey` because the
  application takes over budgets. Anyone attaching their own LiteLLM gets a
  **router, not a control plane** — limits, allowlists and billing stay in
  Ragen. B7's ADR should say so outright, or the first self-hoster will set a
  budget in LiteLLM and be surprised that Ragen ignores it.

## Open

- **Q7 — should the gateway have an OpenRouter provider family?** Raised
  2026-09-15 while B2c was running. The short answer is that the gateway is not
  *missing* OpenRouter relative to the proxy, because **nothing routes to
  OpenRouter today, on either path**:

  | where | what is there | reachable? |
  | --- | --- | --- |
  | `infra/litellm/config.yaml` | no entry at all | no |
  | `getModelProvider()` (apps/web `config.ts`) | returns `'litellm'` unconditionally | the `\|\| 'openrouter'` fallback in `assistant-stream.ts` is dead code |
  | `OrganizationSettings.openrouterApiKey` | stored, encrypted, decrypted, returned | nothing consumes it for a model call |
  | `docs/model-routing.md` | six `OPENROUTER_*` env vars | **appear in zero TypeScript files** |
  | `ai-pricing.ts` | an `openrouter` price block | priced, never billed |

  So adding it is **new capability, not parity** — which is a different
  decision and worth taking deliberately.

  If it is taken: OpenRouter is OpenAI-compatible, so it already works as
  `provider: openai-compatible, connection: openrouter` with no package change
  at all. What that *cannot* express is the part
  [`docs/model-routing.md`](../model-routing.md) calls critical — the EU base
  URL, `provider.order`, `data_collection: deny` and ZDR-only routing are
  OpenRouter-specific fields in the request body, and a generic
  OpenAI-compatible client will not send them. Silently not sending them is the
  bad outcome: the deployment believes it has zero data retention and does not.
  That is the same argument that made `openai` its own family rather than a
  base URL — the quirks are the point.

  Recommended shape: a fifth family whose `providerOptions` carry the routing
  preferences, gated the way `reasoning_effort` is. Not part of Phase B; it
  changes no existing behaviour, because there is none.

  **There is a first-party AI SDK provider for it** — `@openrouter/ai-sdk-provider`,
  v3.0.0, peer-depending on `ai: ^7.0.0`, which is the version this monorepo
  runs since B0c. So the fifth family is an adapter of the same three lines as
  the other four, not a hand-written client, and it lands in
  `PROVIDER_FACTORIES` beside `createOpenAI` and `createVertex`. Not installed
  here yet.

  The one thing to verify while implementing rather than assume: that the
  package exposes OpenRouter's `provider` routing preferences (order, ZDR,
  `data_collection`) through `providerOptions`. If it does not, the family is
  still worth having for the model catalogue, but the EU/ZDR guarantees remain
  unenforced — which is the part that has to be true before
  `docs/model-routing.md` can describe them as real.

  **Independently of the answer, `docs/model-routing.md` documents behaviour
  that does not exist** and should either be implemented or marked as not
  implemented. A reader today would configure `OPENROUTER_ZDR=true` and get
  nothing.

- **Q8 — is an in-process gateway the right shape, or should Ragen ship its own
  small proxy?** Raised 2026-09-15. The programme assumed "no separate service"
  and this reopens it on purpose, because the argument for one is real:

  - **One place for configuration and environment variables.** Today provider
    credentials have to reach *three* processes — web, api and worker — which
    is precisely the operational cost Q1 accepted when it allowed credentials
    into the application processes ("credential rotation stops being one
    container restart and becomes three").
  - **One place for the route table.** B1 mounts
    `infra/llm-gateway/routes.yaml` into four services to keep it
    configuration-not-code, and a guard counts the mounts because one missing
    mount makes that false again. A single owner would need no mount count.

  Against: it is another service to build, deploy, monitor and keep available —
  and a hop in front of every model call — which is most of what ADR-04 is
  being retired for. It also reintroduces the thing B2c is currently measuring
  away.

  Not a decision for Phase B. Worth noting that the two advantages are both
  about *where configuration lives*, not about the data plane, so they may be
  obtainable without a service — the route table moving to the database (which
  `loadRouteTable` already anticipates by taking parsed content) and
  credentials moving to ragen-token-vault (which `CredentialSource`'s `scope`
  already anticipates) would give one owner for both, with no new hop.

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
  proxy; Docling and Presidio are unaffected and stay Python. The
  [Mistral Document AI spec](2026-09-14-mistral-document-ai-as-a-second-parser.md)
  adds a hosted parser calling `/v1/ocr`, which LiteLLM does not proxy — so
  `MISTRAL_API_KEY` lives in the worker's environment as a `@ragenai/env`
  fragment and never reaches this control plane. If `packages/llm-gateway`
  later grows a provider passthrough, it is the right home for that key; until
  then this spec neither gains nor loses it.
- **The other footprint specs.** Three sibling specs each remove a
  different container — [BullMQ](2026-09-15-bullmq-is-the-worker-runtime.md)
  (Temporal), [pgvector](2026-09-14-pgvector-as-a-second-vector-store.md)
  (Qdrant) and the Mistral parser above (Docling). They are independent of this
  one, with a single point of contact: pgvector's Phase D3 provisions an
  embedding model in `infra/litellm/config.yaml`, the file Phase B here
  replaces. The model needs provisioning in whichever registry exists at the
  time; neither spec blocks the other.
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
wrapping AI SDK v7 providers (`@ai-sdk/azure`, `@ai-sdk/amazon-bedrock`,
`@ai-sdk/google-vertex`, `@ai-sdk/openai-compatible`) — v7, not v6, because B0c
upgrades the monorepo before B1 creates the package, so the gateway is built on
it from the first commit rather than migrated later. Consumed in-process by
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
- **Both `ai_usage` indexes are built non-concurrently.** A plain
  `CREATE INDEX` takes a lock that makes concurrent writes wait for the build,
  and `trackAiUsage` writes on every AI call — with its errors suppressed, so a
  blocked write does not fail loudly, it loses the usage row.
  `CREATE INDEX CONCURRENTLY` cannot go in a Prisma migration: migrations run
  inside a transaction and Postgres refuses it there. The options were a
  blocking build or out-of-band orchestration that leaves migration history
  claiming something ran that did not, and we took the blocking build — these
  are small tables and there is no production installation.

  **An installation with a large `ai_usage` can build them by hand first, but
  not by simply creating them.** Each `migration.sql` runs an unconditional
  `CREATE INDEX`, so an index that already exists fails the deploy, and one
  under a different name leaves Prisma building a second, blocking copy. The
  sequence is: create the index concurrently **under the exact name**, tell
  Prisma that migration is already done, then deploy. Both pairs, in this
  order:

  ```sh
  # 1. The ceiling index. This migration contains nothing else, so creating the
  #    index by hand is the whole of it.
  psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY "ai_usage_organization_id_created_at_idx" ON "ai_usage"("organization_id", "created_at");'
  npx prisma migrate resolve --applied 20260914000000_ai_usage_indexes_the_ceiling_query

  # 2. The team migration contains three statements, not one. `migrate resolve`
  #    marks the whole migration applied, so running it after creating only the
  #    index would skip the column and the foreign key — and every later write
  #    would fail on a column that does not exist. Do all three, in this order.
  psql "$DATABASE_URL" <<'SQL'
  ALTER TABLE "ai_usage" ADD COLUMN "team_id" TEXT;
  ALTER TABLE "ai_usage"
    ADD CONSTRAINT "ai_usage_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
    NOT VALID;
  ALTER TABLE "ai_usage" VALIDATE CONSTRAINT "ai_usage_team_id_fkey";
  SQL
  psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY "ai_usage_team_id_created_at_idx" ON "ai_usage"("team_id", "created_at");'
  npx prisma migrate resolve --applied 20260914120000_ai_usage_carries_its_team

  # 3. Everything else applies normally.
  npx prisma migrate deploy
  ```

  The rule behind step 2, since it is the one that bites: `migrate resolve`
  marks a **migration** applied, not a statement. Prebuilding one statement of
  a multi-statement migration and then resolving it silently drops the rest.

  The foreign key in the second migration needs no such handling: it is added
  `NOT VALID` and validated separately, so it never scans the table under a
  write-blocking lock.

  Raised by review on #1149, #1151 and #1155; the first migration is recorded
  rather than fixed in place, because editing an applied migration breaks its
  checksum.

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

**PR 4 — `feat(chatbot): enforce ceilings on the public surfaces, and drop the substring budget check`** — **merged (#1150)**
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

**PR 5 — `feat(api): enforce ceilings on the API paths`** — **merged (#1153)**
_Depends on PR 3. Parallel with PR 4._

- [x] `apps/web`: `api/v1/chat/route.ts` and `api/v1/chat/completions/route.ts`,
      beside the existing `checkApiRequestLimit` call.
- [x] `apps/api`: `chat.service.ts`, `chat-completions.service.ts` and
      `search.service.ts`, beside `ApiLimitsService.checkApiRequestLimit` —
      which is where the ported copy of this logic belongs, not in a new
      module.
- [x] The OpenAI-compatible surface returns the error in the shape a client
      expects, not a bare 500.
- [x] **The body names the ceiling here, unlike the chat surfaces.** The caller
      is an integration, not a person mid-sentence: it can act on the
      difference between "out of tokens" and "out of budget", and it has no
      panel to read it from. Same 429 shape `checkApiRequestLimit` already
      returns, so a client that handles one handles the other.
- [x] `apps/api` gets its own `checkUsageCeilings` on `ApiLimitsService` rather
      than a new module — that service already owns the API request ceiling and
      has the two dependencies. The two implementations have to agree, so the
      three things that are easy to get wrong (spend over every step, messages
      over chat turns only, the API quota staying out) are written down in both
      and tested in both.

**PR 6 — `feat(teams): team usage comes from AiUsage, not the proxy`** — **open**
_Q2 answered: no backfill._

- [x] Add `AiUsage.teamId` (nullable) with an index, and populate it wherever a
      team is resolved — `resolveLiteLLMKeyQuery` already knows it on the chat
      path.
- [x] **No backfill** (Q2). Rows written before the migration stay
      unattributed. Backfilling from `Thread.teamId` would cover chat turns and
      nothing else, so a team's total would silently exclude whichever of its
      work had no thread — a number that looks complete and is not.
- [x] `ON DELETE SET NULL`, not cascade: deleting a team must not delete the
      spend it incurred. The organization still paid, and the org-level totals
      behind the usage ceilings read the same rows.
- [x] Rewrite `get-team-usage-query.ts` and
      `api/organization/teams/[teamId]/usage-csv/route.ts` against `AiUsage`.
      Both currently swallow proxy errors and report zero usage — a database
      read should fail loudly instead.
- [x] After this, nothing in `apps/web` calls `/spend/logs`.

**PR 7 — `refactor(admin): the database is the only writer of budgets and allowlists`** — **merged (#1156)**
_Depends on PRs 3–5 being merged. The production-soak condition was lifted on
2026-09-14: there are no production deployments, so the gate is testing rather
than time._

- [x] `syncOrgToLiteLLM` is **deleted** — every one of its callers pushed a
      budget or an allowlist, and both are now the application's. The
      `*-litellm-team-command` files send rate limits only; team creation and
      key provisioning stay. `syncLiteLLMTeamBudgetCommand` goes with it, along
      with the call in onboarding.
- [x] Q3 landed as neither: `tpm`/`rpm` keep going to the proxy, because it is
      still the only thing enforcing them, and the columns stay live rather
      than becoming decoration. The replacement is now a Phase B precondition,
      held by an architecture test rather than a comment.
- [x] The admin limits and models actions no longer report a sync result they
      no longer perform; the audit entry records the database write.

**PR 8 — `refactor(admin): retire the proxy reconciliation page`** — **open**
_Depends on PR 7._

- [x] **Only `budgetHasDrifted` goes, not the file.** This step assumed all
      three checks were reconciliation and they are not. `budgetHasDrifted`
      compared two writers of the same value and has nothing left to compare;
      `findStrandedOrgs` and `findOfferableButUnserved` compare an
      organization's allowlist against what this deployment can actually
      serve, which is a live configuration error whoever writes budgets. They
      stay until the proxy does.
- [x] The "Spend against budget" table is rebuilt on `AiUsage` — the same
      month-to-date aggregate the guard reads before every request — with a
      status column that says in words whether an organization is being
      refused. The page shows what will happen rather than what a second
      system believes, and the per-organization `/team/info` fan-out goes with
      it: one grouped query instead of N HTTP calls.
- [x] Keep a health strip: reachability and which model is down stay useful
      until the proxy is gone in Phase B.
- [x] The operator-facing copy was corrected earlier, in #1147.

**PR 9 — `test(e2e): an organization at its ceiling is refused`** — **open**
_Depends on PRs 3–5. Can be written alongside them and merged last._

- [x] A `p0-*` spec — an org seeded over its cost ceiling gets the refusal, not
      a 500 and not an answer. `p1`–`p3` would not gate the PR that breaks it.
- [x] Seed support for an org with usage already recorded — done in the spec's
      own `beforeAll` rather than in the shared seed, so no other spec inherits
      an organization that cannot chat.
- [x] **The spec does not mock the chat stream.** Every other chat spec routes
      the threads API to a canned SSE response, which would sail straight past
      the guard under test.
- [x] Update `docs/regression-checklist.md`, and amend ADR-34's 2026-09-14
      update to say the gap it describes is closed.

**Gate.** Answer Q1 with PRs 1–9 in production. If credentials cannot move, stop
here, record it as an ADR amending 04, and close the spec as partially done.

### Phase B — the hold, and what measuring it changed (2026-09-14)

**Stopped before B1 shipped, on a prerequisite nobody costed: AI SDK 7 is
ESM-only, and two of the three apps that would use it are CommonJS.**

The blocking chain, found by attempting B1 rather than by reading about it:

| package                   | version | `@ai-sdk/provider` |
| ------------------------- | ------- | ------------------ |
| `ai` (this repo)          | 6.0.99  | 3.0.8              |
| `@ai-sdk/azure` (current) | 4.0.70  | 4.0.14             |
| `@ai-sdk/amazon-bedrock`  | 5.0.82  | 4.0.14             |
| `@ai-sdk/google-vertex`   | 5.0.81  | 4.0.14             |
| `ai` (current)            | 7.0.99  | 4.0.14             |

`@ai-sdk/provider` is the `LanguageModelV*` contract between a provider and
`streamText`; a model built by a provider on v4 is not the interface `ai@6`
accepts. No release of azure, bedrock or vertex in the last sixty is on
provider 3.x, so the gateway cannot wrap current providers without `ai@7`.

And `ai@7` publishes `type: module` with **no `require` export** — verified in
the published packages, not only in the migration guide. `apps/web` is ESM and
would be fine; `apps/api` and `apps/worker` are CommonJS and would not. So the
real chain is:

> remove LiteLLM → upgrade to AI SDK 7 → migrate `apps/api` and `apps/worker`
> to ESM

with the worker as the hard part: 146 relative imports without extensions, and
`workflowsPath: require.resolve('./workflows')` feeding Temporal's own workflow
bundler.

**Resumed the same day, because B0 was measured rather than estimated.** The
hold note above is right about the chain and wrong about its size, in a way
that only counting could show:

| app           | relative imports | already carrying `.js` | what the flip actually cost                        |
| ------------- | ---------------- | ---------------------- | -------------------------------------------------- |
| `apps/api`    | 824              | 821                    | three specs, one config, four real runtime defects |
| `apps/worker` | 499              | 0                      | unmeasured; plus Temporal's own workflow bundler   |

`apps/api` was already written as ESM in every respect but the declaration:
`module: nodenext` with `.js` on essentially every relative import, because
that is what `nodenext` demands of a CommonJS package too. Adding
`"type": "module"` is therefore a one-line change plus the fallout, and the
fallout is the interesting part — see B0a below. **The two apps are not one
task and should never have been costed as one.**

**Why it is on hold rather than abandoned.** The reason to remove the proxy was
dual ownership: a second copy of every budget and allowlist, a panel page whose
job was detecting the drift, and ceilings enforced nowhere. **Phase A removed
all of that.** What remains is one container that routes to four clouds, with
one obligation attached (per-team rate limits). That is not obviously worth an
ESM migration of two apps today — but it becomes nearly free the moment
`apps/api` or `apps/worker` moves to ESM for any other reason, and this spec is
ready to resume at that point.

**Two findings from B1 worth keeping**, because they will be true whenever it
resumes:

1. **Routing cannot live in `MODEL_REGISTRY`.** That module states in its own
   first paragraph that it is presentation metadata and "not the list of models
   a deployment serves"; its `origin` field groups the model picker and says
   nothing about who answers. The gateway needs its own table, keyed by the
   same ids, with an architecture test asserting every route has a registry
   entry. B1 below is corrected accordingly.
2. **The route table's content, ported from `infra/litellm/config.yaml`** —
   the part that cannot be derived and is expensive to get wrong:

   | exposed id                                                | provider                     | upstream id                                          |
   | --------------------------------------------------------- | ---------------------------- | ---------------------------------------------------- |
   | `gpt-5.4`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` | azure                        | same (the Azure _deployment_ names match the models) |
   | `claude-sonnet-4-6`, `claude-sonnet-5`, `claude-opus-5`   | bedrock                      | `eu.anthropic.<id>`                                  |
   | `gemini-3-flash-preview`, `gemini-2.5-flash`              | vertex                       | same                                                 |
   | `gpt-oss-120b`                                            | scaleway (openai-compatible) | same                                                 |
   | `mistral-small-3.2`                                       | scaleway                     | `mistral-small-3.2-24b-instruct-2506`                |
   | `bge-multilingual-gemma2` (embeddings)                    | scaleway                     | same                                                 |

   The `eu.` prefix on the Bedrock ids is not cosmetic: it selects the regional
   inference profile, and dropping it sends European customer documents to a US
   endpoint. Reranking needs no route — it already bypasses the proxy.

### Phase B — `packages/llm-gateway` replaces the proxy

- [x] **B0a.** `apps/api` → ESM. Done 2026-09-14. Small in diff and large in
      findings: every one of the four defects it surfaced typechecked, linted
      and tested green, and would have failed at runtime or — worse — not
      failed at all.

      1. **`instrument.ts` called `require()` fourteen times**, inside a
                             `try`/`catch` that logs and continues. Under ESM that is a
                             `ReferenceError` per boot, so the app would have started with no
                             traces, no metrics, no logs and one line in the startup log. A first
                             probe of this file *passed* — `node -e` leaks a `require` into scope,
                             so the check has to run with `--input-type=module`.
                          2. **OpenTelemetry's auto-instrumentation needs a loader hook under
                             ESM.** `registerInstrumentations` patches CommonJS `require` calls,
                             which the ESM loader never makes; without
                             `--import @opentelemetry/instrumentation/hook.mjs` the SDK reports
                             "OpenTelemetry initialized" and traces nothing. This one has no error
                             at all — an empty trace view looks exactly like a quiet service. The
                             flag now sits on all three start commands.
                          3. **`crypto-js` does not expose named exports to Node's ESM loader.**
                             `import { AES } from 'crypto-js'` compiled fine and threw on the first
                             module evaluation.
                          4. **Four files carried a `require()` workaround** for the opposite
                             problem — the import statement resolving to a package's ESM build
                             while tsc emitted CJS. ESM makes the workaround both wrong and
                             impossible, so they are plain imports again.

                          The tests stay CommonJS (`apps/api/tsconfig.spec.json`), which keeps 97
                          suites and every `jest.mock` working unchanged; typechecking still runs
                          under the app's real ESM settings. Guarded by
                          `tests/architecture/esm-apps-keep-their-runtime-contract.test.ts`, which
                          exists because three of the four defects above are silent.

- [ ] **B0b.** `apps/worker` → ESM. The real work: 499 relative imports with no
      extension, and `workflowsPath: require.resolve('./workflows')` feeding
      Temporal's own workflow bundler. Cost it separately before starting.
- [ ] **B0c.** Upgrade to AI SDK 7 across the monorepo, once B0b lands.
- [ ] **B1.** Create the package: AI SDK providers for Azure, Bedrock, Vertex
      and OpenAI-compatible (Scaleway), a `resolveModel(id)` reading the
      gateway's **own route table** (not `MODEL_REGISTRY`, which is
      presentation), and the two behaviours that currently live in
      `chat-completion-factory.ts` — the multimodal swap and `reasoning_effort`
      injection. No consumer yet; the app still runs on the proxy.
      **The route table is configuration, not a constant** — see Q6. An
      OpenAI-compatible entry has to be addable without editing the package,
      or attaching LiteLLM, vLLM or Ollama becomes a fork.
- [ ] **B2.** Switch chat and embeddings behind `LLM_GATEWAY=litellm|native`,
      defaulting to `litellm`. Run the retrieval evals under both per
      [ADR-20](../adrs/20-pause-and-measure-rag-quality.md) and record the
      comparison in `docs/`. The proxy arm is already measured:
      [the baseline](../rag-baseline-2026-09-14-before-the-gateway.md) —
      **20/24 median, and a four-question spread across identical runs.**
      Compare the arms **per question**, not per total: four is the noise
      floor, so a summary rate cannot tell a real difference from the same
      path measured twice. Run both arms in one sitting, on a project
      nothing else writes to.

      - [x] **B2a — the seam, in apps/web.** The flag, embedding resolution in
            the package, and `apps/web`'s chat and embeddings behind it.

            Two things had to change shape, and both are worth knowing before
            B2b repeats the exercise in `apps/api` and `apps/worker`.

            **Resolution is deferred to the first call.** The multimodal swap
            is model *selection* (B1), but the application's seam builds a
            model from options and never sees a message — so selecting on
            content was impossible at construction. `nativeChatModel` returns a
            `LanguageModelV4` that resolves inside `doGenerate`/`doStream`,
            where the prompt is. That also absorbs the async/sync mismatch —
            `resolveModel` is async because credentials will come from the
            vault — so **no call site changed**.

            **Both `encoding_format` workarounds are gone.** apps/web deleted
            the field (a LiteLLM/Bedrock-Cohere bug) and apps/worker forced it
            to `float` (Scaleway's vLLM). They contradict each other, both were
            the proxy's, and the AI SDK's OpenAI-compatible embedding model
            sends `float` natively.

            Not done here, on purpose: `LITELLM_PROXY_URL` is still required by
            the env schema under either mode. Both arms are measured on one
            machine with the proxy up, and relaxing it belongs with B4.

      - [x] **B2b — the same seam in `apps/api` and `apps/worker`.**

            `apps/api` is a mirror of `apps/web` and went across unchanged in
            shape. `apps/worker` differed in three ways worth recording.

            **Its getters were already `async`**, and it has no multimodal swap
            and no reasoning effort — so no deferred `LanguageModelV4` was
            needed there. The flag is a plain branch. (`getChatModel` and
            `getEmbeddingModel`, the two master-key variants, became `async`;
            they had no callers.)

            **`generateTextWithPdf` needed a second implementation, not a
            redirect.** It hand-builds a request carrying the PDF as an
            `image_url` holding a `data:application/pdf;base64,…` — not
            OpenAI's shape, and it only ever worked because LiteLLM recognised
            it and emitted a Bedrock Converse document block. This is the one
            call in the monorepo that depended on the proxy *rewriting* a
            request rather than forwarding it. The native path passes a real
            `file` content part to `generateText`, which `@ai-sdk/amazon-bedrock`
            turns into the same Converse block — so the bytes still never leave
            the configured AWS region.

            **`LITELLM_MASTER_KEY` is no longer required under `native`.**
            `isMasterKeyRequired` throws at import time, and a deployed worker
            would otherwise refuse to boot over a credential nothing on that
            path authenticates with — whose obvious workaround is to set a
            dummy key, which is how a boot check stops being believed.

            **Found on the way, not fixed here:** `PDF_MODEL`'s default
            `claude-haiku-4-5` is served by neither the proxy (commented out in
            `infra/litellm/config.yaml`) nor the route table, and the same is
            true of `availableModels.mini`/`.nano` (`gpt-5.4-mini`,
            `gpt-5.4-nano`). Those paths are already broken on the proxy today;
            the gateway fails them slightly earlier and more legibly
            (`UnknownModelError` rather than an upstream 400). Docling is the
            default parser, so only the fallback path reaches them, which is
            why it went unnoticed. Choosing replacements is a model decision
            with cost and quality consequences, not a refactor.
      - [x] **B2c — the gateway arm, per question.** Recorded in
            [the comparison](../rag-gateway-comparison-2026-09-15.md). Three
            runs per arm, one sitting, commit `269b13422`.

            **No retrieval regression.** Sixteen of twenty-four questions give
            the identical verdict in both arms across all six runs;
            same-language is 16/16 in every run of both; the control floor is
            0/23 throughout. Four questions flap *within* an arm — the noise
            floor the baseline described.

            **One question differs stably** — `xl-en2pl-refund-pct`, 0/3 native
            against 3/3 proxy — and it is **not** a retrieval failure. Both arms
            retrieve the right document, state the right figure and pass the
            rubric; the native arm additionally volunteers the sibling
            document's distractor figure, which trips `expectNone`. The change
            is in generation, not retrieval: the chain sends no temperature, so
            each path inherits its own client's defaults, and LiteLLM's
            OpenAI-compatible translation to Vertex is not the same request as
            `@ai-sdk/google-vertex` makes. Worth settling before B4.

            Totals were 88% proxy against 79% native — **wider than one
            question, narrower than this instrument's own spread**, which is why
            the comparison is per question. Cross-lingual went 5/8 to 3/8, a
            direction rather than a result on a corpus whose noise floor is four
            questions.

            Three real defects fell out of running it, all invisible to every
            static check and all now fixed: the gateway ignored
            `VERTEX_CREDENTIALS` (Google's libraries want a file path in
            `GOOGLE_APPLICATION_CREDENTIALS`, so Vertex could not authenticate
            at all); the route table had no per-route `location`, so
            `gemini-3-flash-preview` 404'd outside the `global` endpoint the
            proxy config pins it to; and the default route-table path resolved
            against the process's cwd, which no app in this monorepo shares with
            the repository root — the worker marked four documents FAILED rather
            than saying anything about configuration.
- [x] **B3.** Move speech and transcription
      ([openai-provider.ts](../../apps/web/src/libs/speech/openai-provider.ts))
      off `LITELLM_PROXY_URL`. Done 2026-09-15.

      Not a cleanup — **a fix.** Both providers preferred `LITELLM_PROXY_URL`
      over OpenAI's own endpoint, and `infra/litellm/config.yaml` registers no
      `/v1/audio/*` route and never has. Since the proxy URL is *required* by
      every app's env schema, the fallback to `api.openai.com` was unreachable
      in exactly the deployments that needed it: `SPEECH_PROVIDER=openai` meant
      a 404 per synthesis and per transcription, everywhere.

      Replaced by `SPEECH_BASE_URL` (default `https://api.openai.com`) and
      `SPEECH_API_KEY` (falling back to `OPENAI_API_KEY`), declared as
      `SPEECH_SEAM` in `provider-seams.ts` alongside storage, encryption,
      rerank and mail. That makes attaching a local vLLM — or a LiteLLM that
      *has* been given audio routes — configuration rather than the one
      hardcoded road, which is Q6's shape. Both values are read per call, not
      in the constructor, because `index.ts` caches the provider for the life
      of the process.

      A missing key now throws naming both variables instead of sending
      `Authorization: Bearer ` and letting the upstream return a 401 that reads
      like a wrong key rather than an absent one.

      Two stale documents fixed alongside: `.env.example` claimed speech
      auto-detects OpenAI from `OPENAI_API_KEY` or `LITELLM_PROXY_URL` — it
      never has, and deliberately still does not, because speech bills per
      request and that key is there for chat; and `apps/docs/docs/open-models.md`
      recommended the proxy path as the way to keep speech on-premise, which
      was the broken one.
- [x] **B4.** Flip the default to `native` in one environment (demo) for a
      week, then everywhere. The flag stays — but as a seam variant naming an
      endpoint, not as `litellm|native`, which B6 reduces to one value. Q6.

      **Repo side done 2026-09-15; the flip itself is a dashboard change**
      (ADR-47) and has not been made. [The runbook](../runbooks/llm-gateway-cutover.md)
      is the procedure, including rollback.

      Preparing it found the blocker that would have taken demo down:
      **no runtime image contained the route table.** All three Dockerfiles
      copy `.next/standalone`, `dist` and `packages`, and none copied `infra/`.
      `docker-compose.fullapp.yml` mounts the directory into all four services
      — and the guard that exists to keep the "configuration, not code"
      promise honest counted *those mounts*, so it was green while the only
      exposed environment could not read the file at all. Under
      `LLM_GATEWAY=litellm` nothing reads it, so the absence was invisible; the
      flip is what would have found it, in the most expensive place. Each image
      now copies it, and the guard checks both deployment shapes.

      `npm run gateway:preflight -- --probe` resolves every model the
      deployment is configured to use and makes one real call each. It encodes
      the B2c lesson — presence is not usability — and it already reports the
      known `PDF_MODEL` gap as advisory rather than blocking, since that model
      is equally unserved on the proxy path.

      **Demo flipped 2026-09-15** and reports it — `/api/healthcheck` answers
      `{"status":"ok","llmGateway":"native"}`, which is the claim worth
      trusting rather than what was set in the dashboard.

      `DEFAULT_GATEWAY_MODE` is now `native` (2026-09-15), which is the "then
      everywhere" half. Two consequences were deliberately taken on with it:
      a deployment that never set `LLM_GATEWAY` moves to direct provider calls
      on its next deploy and needs provider credentials in web, api and worker;
      and local development would do the same, so the minimum `.env.local` in
      `AGENTS.md` now pins `LLM_GATEWAY=litellm` — `docker compose up` starts a
      proxy, and the shipped route table names providers a fresh clone has no
      credentials for.

      Still open, and the reason this is not yet B6: `create-ragen-app`
      scaffolds a LiteLLM-shaped installation — `DEFAULT_MODEL_PROVIDER`, a
      generated `LITELLM_MASTER_KEY`, a written proxy config — from the single
      OpenAI or Anthropic key it asks for. It now writes `LLM_GATEWAY=litellm`
      into the generated `.env.local` rather than inheriting the default, since
      the shipped route table names providers a fresh install has no
      credentials for. So a scaffolded install is explicitly on the proxy,
      which is coherent, but it is the opposite of what a deployment gets.
      Closing that gap means generating a route table pointing the default
      models at the one provider the user actually gave us.
- [x] **B5.** Remove virtual keys: `resolveLiteLLMKeyQuery`, the remaining team
      commands, the three columns. Done 2026-09-15.

      **It could not be done as written, and the guard is what said so.**
      `only-rate-limits-reach-the-proxy.test.ts` held Q3's obligation: budgets
      and allowlists had moved into the database, `tpm`/`rpm` had not, and the
      proxy was the only thing enforcing them — so it failed if the forwarding
      stopped while nothing had replaced it. Removing the virtual keys removes
      the vehicle, so the guard fired exactly as designed. The answer was to
      build the replacement, not to delete the guard:
      `checkTeamRateLimitQuery`, a Redis token bucket over the same two fields,
      called before every turn, with its own `chain-errors.rate-limit-exceeded`
      in all fifteen locales. It fails **open** when Redis is absent, because
      Redis is optional here and the hard stop is the monthly ceiling in
      Postgres.

      **Team attribution survived the removal.** `resolveLiteLLMKeyQuery`
      decided two things at once — which key to charge and, as a side effect,
      which team `AiUsage.teamId` recorded. Deleting it wholesale would have
      made the teams UI silently report nothing, so its second half is now
      `resolveUsageTeamQuery`: same precedence, same membership check (the
      active team arrives in a cookie), no key.

      Also gone: `apps/admin`'s `syncOrgMemberToLiteLLM`, whose whole purpose
      was keeping proxy team membership in step with the database, and the
      `litellmProvisioned` banner in team settings, which reported a state that
      no longer exists.

      The migration drops `organization_settings.litellm_api_key`,
      `teams.litellm_team_id` and `teams.litellm_key_token`. Deploy ordering is
      one-way: the application stops selecting them in the same release, so a
      rollback to an older image would fail against the new schema. Roll the
      migration back with it, or roll forward.

      `Team.budgetUsdCents`, `budgetDuration`, `rpmLimit`, `tpmLimit` and
      `allowedModels` are deliberately kept — those are Ragen's own settings,
      read from the database, and now enforced from there.
- [ ] **B6.** Remove the infrastructure: `infra/litellm/`, the compose service
      and its Postgres, the Helm values, the devcontainer wiring, the e2e mock
      proxy, the promptfoo configs' base URLs, `packages/litellm-client`,
      `create-ragen-app`'s YAML splice, and the upgrade runbook. Re-point
      `RERANK_SEAM`'s `cohere` variant at its own base URL in the same PR —
      it routes through `LITELLM_PROXY_URL` today and fails silently without
      it. Q6.
- [~] **B7.** Write the ADR superseding ADR-04 and reducing ADR-34. Add an
      architecture test asserting nothing imports a LiteLLM symbol. Add the
      lesson: _a query that computes a limit is not a limit until something
      calls it._

      **ADR written 2026-09-15**:
      [ADR-49](../adrs/49-the-application-calls-model-providers-itself.md).
      ADR-04 is marked superseded, ADR-34 reduced. It records what this phase
      decided *and* what it deliberately did not — the flip everywhere, an
      OpenRouter family (Q7), and where the route table lives long-term.

      **The lesson already existed** and said the exact sentence this line
      asks for — `enforcement-moved-to-a-dependency-left-its-query-behind.md`,
      written when Phase A found the five-month gap. Rather than duplicate it,
      it gained the second half this phase supplied: **a guard that fails
      because its subject moved is right, and the change is incomplete.** B5
      removed the virtual keys that per-team rate limiting was enforced on,
      `only-rate-limits-reach-the-proxy.test.ts` fired exactly as designed, and
      the answer was to build the replacement rather than delete the guard.

      **The architecture test waits for B6**, which is the change that makes it
      true — asserting nothing imports a LiteLLM symbol cannot pass while the
      proxy path is the default and `packages/litellm-client` still ships.

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

**Phase B** is flag-gated end to end. `LLM_GATEWAY=litellm` was the default
through B1–B3; demo flipped first in B4 and the default followed; production
follows after a week with no error-rate or eval regression. Rollback until B5 is one environment variable
and a restart, which is why B5 and B6 are separate steps from B4 and must not
land in the same release.

Column drops come last, in their own migration, at least one release after the
code that read them is gone — a rolled-back deploy must not meet a dropped
column. The `litellm-postgres` volume is retained for 30 days after B6
regardless of the Q2 answer, since deleting it is the one irreversible step in
the whole spec.
