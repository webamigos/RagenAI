---
title: Ragen as an on-premises appliance
status: in-progress
areas: [llm-gateway, rag, auth, admin, install, worker, guardrails]
adrs: [21, 27, 31, 35, 37, 38, 49, 50]
---

# Ragen as an on-premises appliance

## TLDR

Ragen installed on one dedicated machine (a GPU workstation or server) with
local models, so an organization can run it with no outbound traffic.
Every piece of such an install exists today, but only as configuration.
Nothing installs it, proves it, sizes it or looks after it once it is
running, and the open edition has no company sign-in.
This spec turns the configuration into a product, in a fully local and a
hybrid profile, in four phases. Phase 0 is a repeatable demo with no new
product code; Phases A–C build the rest.

## Decisions

Answered 2026-10-17. These were the structural questions; the sections below
are written from them.

- **D1. Company sign-in is in the open edition.** A generic OIDC provider in
  this repository, Apache 2.0. The comment at `apps/web/src/lib/auth.ts:233`
  that calls Google sign-in "an enterprise-edition feature" is replaced by
  the PR that implements B1, not by this spec. SAML and SCIM stay for later.
- **D2. One organization per machine is the expected case, not a
  constraint.** Sizing, the first-run wizard and branding assume one
  organization per install. Nothing removes multi-org (ADR-35); an install
  serving several works, it is just not what the tables are measured for.
- **D3. The hybrid variant is a supported profile.** Documents, search,
  embeddings, parsing and PII masking stay on the machine; only chat-class model
  calls go to one configured EU endpoint. Phase A ships two profiles,
  `appliance-local` and `appliance-hybrid`, and the egress check has a mode
  for each.
- **D4. Remote access has two roles on one support channel:** first-line
  support with limited access, and the maintainer as second line with full
  access. The organization's admin switches the channel on and off, and every
  session is in the audit log.
- **D5. Branding is a runtime setting**, stored per install and edited in
  `apps/admin`. No per-install image.
- **D6. A company sign-in joins one organization.** `OIDC_JOIN_ORGANIZATION`
  names it, by id or slug. New SSO users become members (not admins), and
  only they skip closed registration; the identity provider and the allowed
  domains are the gate. Decided while building B1, and up for review in its
  PR.

## Problem

Ragen cannot be delivered as a self-contained local install today, for five concrete reasons:

1. **No install path for a local model.** `create-ragen-app` offers only cloud
   providers (`packages/create-ragen-app/src/llm-provider.ts`). Compose has no
   Ollama, vLLM, embeddings or reranker service, and the only GPU reservation
   is basal's (`docker-compose.yml`, `profiles: ['basal']`). A local install
   means editing `infra/llm-gateway/routes.yaml` by hand, as
   [`attaching-a-gateway.md`](../attaching-a-gateway.md) describes.
2. **"Private" has never been proven.** The README's "Next" list says the
   pieces for an air-gapped install "are all there today", but there is no
   script that shows zero outbound traffic. Known leaks are recorded only in
   code:
   - `apps/api/src/chains/moderation-instance.ts:22` throws when there is no
     OpenAI key. It calls OpenAI directly and bypasses the route table
     (ADR-49).
   - If Docling fails, the legacy PDF path sends the file to a cloud model
     unless `DOCLING_STRICT=1` is set (`apps/worker/src/consts.ts`).
   - Some model ids are hardcoded: `GENERATOR_MODEL` in
     `api/knowledge/optimize/route.ts`, the SRT segmenter, the image
     description model, and `POLICY_JUDGE_MODEL`. Each one fails, or goes to
     the cloud, unless a local route reuses the same key.
   - basal's entrypoint downloads model weights from Hugging Face the first
     time it starts.
3. **A local model does not appear in the model picker.**
   `checkAvailableProviders.ts` filters `model-catalog.ts`, and
   `ModelOrigin` is `'openai' | 'google' | 'anthropic' | 'mistral'`. A route
   called `bielik-11b` or `qwen3-32b` is served but not offered. The only
   workaround is to map a cloud catalogue id onto a local upstream. That
   mislabels the model in the UI and in usage reports.
4. **No company sign-in.** The open edition has email and password plus magic
   link only (`apps/web/src/lib/auth.ts`). Company sign-in is the first
   thing an organization asks for.
5. **Nobody can size it or support it.** There is no sizing guide (README,
   "Later"). There is no in-app model health check: the setup page checks
   env vars, Docling and basal, but makes no live model call. There is no
   offline update path, and no way to see from the panel that an install is
   healthy.

An install that needs an engineer editing YAML on site, with no proof of
what it sends out, is not something that can be handed over and left
running.

## Out of scope

- **Fleet management.** No central console for many installs, no remote
  licensing, no phone-home. Each install is standalone. The C3 support channel
  is opened by the organization one session at a time. It is not a permanent
  link. A fleet console is a
  separate product decision, and it contradicts "nothing phones home"
  ([`security-and-privacy.md`](../security-and-privacy.md)).
- **SAML, SCIM, LDAP.** Phase B delivers OIDC (Entra ID and Google Workspace
  both speak it). Directory sync comes after.
- **Microsoft 365 connectors** (SharePoint, OneDrive, Teams). They are on the
  README roadmap. They are their own
  spec: connector work, not appliance work.
- **Fine-tuning or training models on customer data.**
- **Local voice** beyond pointing `SPEECH_BASE_URL` at a Whisper-compatible
  server, which already works.
- **Commercial terms.**

## Proposed solution

Treat the appliance as **one compose profile, one route-table file and one
env template** that are versioned with the release and tested in CI. It is
not a fork, a separate image or a mode flag. Everything below composes
existing seams: the route table (ADR-49), `@ragenai/env` fragments (ADR-37),
the setup page, and `create-ragen-app`.

### Model tiers

The appliance ships named **model tiers**, so an installer picks a tier rather than a model:

| Tier | Hardware class (indicative) | Chat model class | Embeddings | Reranker |
|---|---|---|---|---|
| S | 64–128 GB unified memory workstation | 8–14B, Q4 | local, ~1B | off |
| M | 1× GPU, 24–32 GB, or 128 GB unified memory | 12–24B | local | local, small |
| L | 1–2× 48 GB GPU | ~30B class | local | local |
| XL | 2–4× 80–96 GB GPU | 70B+ class | local | local |

These numbers are placeholders until Phase A3 has measured them. **No tier is
offered before its row has been measured on real hardware.**

### Inference server

**Ollama for S/M, vLLM for L/XL**, both through the existing `openai-compatible`
provider.

- *Ollama only* was rejected: it serves concurrent users badly, and L/XL exist
  for concurrency.
- *vLLM only* was rejected: it needs CUDA, and the S tier includes
  unified-memory machines.
- *A bundled custom server* was rejected: it duplicates what ADR-49 already
  keeps out of the application.

### Model catalogue

**Open the catalogue to local models through data, not code.**

- *Mapping cloud ids onto local upstreams* was rejected: the model name
  shown to users is then wrong, and so is the cost line in usage reports.
- *Editing `model-catalog.ts` per install* was rejected: it needs a build.

The proposal: add `origin: 'local'` to `ModelOrigin`, and let a route in
`routes.yaml` carry `display` and `capabilities` (`chat`, `vision`). The
chat picker then offers a served route that has
`display` **and** the `chat` capability, even when the compiled catalogue does
not know it. A route without `chat` (an embedding or reranker route) is never
offered, whatever else it declares, and a route with no `capabilities` is
treated as having none. A described route also replaces a catalogue entry
with the same id, which is what gives the Phase 0 aliases their real names.
`structuredOutputs` stays its own route field rather than a capability, since
it already exists and means exactly that; `contextWindow` was dropped because
nothing reads one yet. Pricing for a
`local` origin is zero tokens-cost. Hardware cost is not a per-token number,
and pretending it is would mislead the usage page.

### Two profiles (D3)

`appliance-local` sends nothing off the machine. `appliance-hybrid` is the same
stack with one difference: chat-class routes (`DEFAULT_MODEL`, deep thinking,
the guardrail judge) point at one EU `openai-compatible` endpoint. Ingest,
embeddings, rephrase, summaries, Brain extraction, parsing and PII masking
stay local in both, so document content leaves the machine only as the retrieved
fragments of a single answer, after PII masking. The profile name is shown on
the setup page, so nobody has to guess which one an install runs.

*A per-route free mix* was rejected: it must be possible to say in one
sentence what leaves the building, and two named profiles allow that.

### Proving there is no outbound traffic

A script brings the stack up on an internal-only Docker network
(`internal: true`), runs ingest, chat, Brain and the guardrail first pass,
and fails if any container attempted an outbound connection. A3 shipped the
ingest and chat pass; Brain and the guardrail pass are A3b.

Hybrid mode needs exactly one way out, and the gateway is in-process
(ADR-49), so model calls leave from web, api and worker. They cannot be
given an external network without giving it to everything they do. The
topology is:

- every application and data container stays on the `internal: true`
  network only;
- one extra container, `llm-egress`, a forwarding proxy, is the only one
  attached to both the internal network and a second, external network;
- the hybrid chat routes' `baseURL` points at `llm-egress`, and the proxy
  forwards to exactly one configured upstream host, refusing any other
  destination.

A3 checks all three: that no container other than `llm-egress` has an
external attachment, that the proxy rejects a request for any other host,
and that a full chat turn still succeeds through it.

The check reads one source of truth: the network's own refusal. A container
that tries to leave fails, and the script reports which container and which
host. *A list of allowed domains* was rejected, because a list goes out of
date while it stays green.

### Company sign-in

Better Auth's generic OIDC plugin, configured per install by env (issuer,
client id, secret, allowed email domain). It is the library's own API, so
Ragen does not write to Better Auth's tables
(see [Core Surfaces](../../AGENTS.md)).

*Per-provider social plugins* were rejected: OIDC covers Entra ID, Google
Workspace and Keycloak with one code path.

### Branding

Instance settings: product name, logo and primary colour, read by the panel
shell and the email templates.

- It applies to the whole install, not per org, because one install
  normally serves one organization (D2).
- The colour is constrained to the semantic tokens
  ([`panel-ux-rules.md`](../panel-ux-rules.md)). The install picks the
  `primary` token. The literal-colour guard keeps passing.

## Core surfaces touched

| Surface | Change | What catches a mistake |
|---|---|---|
| `infra/llm-gateway/routes.yaml` | new `routes.appliance.yaml` beside it; schema gains `display`, `contextWindow`, `capabilities` | `gateway:preflight -- --probe`, llm-gateway package tests |
| `packages/platform-contracts` | `ModelOrigin` gains `'local'`; picker accepts route-described models | package tests + `shared-contracts-are-not-recopied` |
| `packages/env` | `applianceRules` fragment (local embeddings need `VECTOR_SIZE`; `DOCLING_STRICT=1` required) | `provider-fragments-carry-their-rules` |
| `packages/create-ragen-app` | a "local model (appliance)" option | its own tests + manifest-is-current guard |
| `src/lib/auth.ts` | generic OIDC plugin, off unless configured | `server-actions-are-guarded`, `test-e2e` sign-in specs |
| Better Auth tables | none written directly; accounts are created by the plugin | `tests/architecture/` |
| `prisma/schema.prisma` | `InstanceBranding` (single row); `SupportSession` (C3) | migration + `npm run verify` |
| `apps/api` moderation | route through the gateway or skip when unconfigured, as web already does | api tests |

Tenant scoping is not changed. Branding is instance-wide by design, and it
holds no tenant data.

## Data model

- `InstanceBranding`: one row with `productName`, `logoStorageKey`,
  `primaryToken` and `updatedAt`. An install with no row uses today's Ragen
  branding, so existing installs see no change.
- `SupportSession` (C3): `role` (`first-line` | `maintainer`), `person`,
  `openedAt`, `closedAt`, `expiresAt` and `openedBy` (the organization admin who
  switched the channel on). Instance-wide, like branding. Rows are kept for
  the audit log's lifetime.
- No change to models, threads or documents.
- OIDC accounts use the existing Better Auth `accounts` table through the
  plugin.

## Failure modes

- **Local model server down.** The setup page shows a red model check (B3),
  and chat returns the gateway's existing "model unavailable" error instead
  of hanging. An answer must never fall back to a cloud route. There is no
  cloud route in the appliance table, and the egress check enforces it.
- **Model too slow for the user count.** Measured in A3. The tier table
  records concurrency at an agreed time-to-first-token, not a guess.
- **Embedding model changed after ingest.** The vector size no longer
  matches. The setup check `embeddings-dimension-mismatch` must know the
  appliance embedding models' sizes, and today it knows only the default.
  Changing the model means a re-index, and the upgrade runbook says so.
- **Docling fails on a document.** `DOCLING_STRICT=1` makes it a visible
  ingest failure, not a silent cloud call.
- **Hybrid EU endpoint unreachable.** Chat fails with the gateway's
  "model unavailable" error. Search, ingest and the rest of the install keep
  working. There is no automatic switch to a local model, because a
  hybrid install is sized for embeddings, not for chat.
- **Support channel left open.** It closes at `expiresAt` (default 8 hours),
  and the panel shows that it is open the whole time.
- **First-line role used to read customer content.** The role reaches only
  the admin web UI and the supervisor's fixed list of actions. It has no
  shell, no Docker socket, no database and no document access, and its logs
  come with message content redacted. Two tests prove it: a role-scope test,
  because the rule is "admins must not read customer messages", and a test
  that the supervisor rejects any action outside its list.
- **OIDC issuer unreachable when the app first serves an auth request.**
  Better Auth fetches the discovery document once, when the auth instance
  initializes. If that fetch fails, the provider is skipped until the app
  restarts, the button stays but the sign-in fails, and the error goes to the
  log. Restarting the web container after the issuer is back fixes it. A
  self-hosted issuer such as Keycloak must start before Ragen.
- **OIDC issuer unreachable.** Password sign-in stays available for the
  local admin account, so a broken identity provider cannot lock the
  organization out of the install.
- **Offline update applied over a running stack.** The bundle runs
  migrations first (the `ragen-migrate` image), and the runbook shows how to
  return to the previous image set.
- **basal weights missing on first boot without internet.** The image bundle
  carries a pre-seeded `basal_models` volume. Without one the first pass is
  skipped: it can clear a turn, never block one.

## Phases

Each phase leaves the application working. Behind a feature key defaulting to
`false` where user-visible (ADR-50).

### Phase 0: a repeatable demo

There is no new product code in this phase. It turns what exists into a
repeatable demo, and records the gaps as tests.

- [x] **0.1.** `infra/llm-gateway/routes.appliance.yaml` maps the catalogue
  ids the application already asks for onto a local Ollama, so nothing
  hardcoded falls through to the cloud:
  - `DEFAULT_MODEL`, `REPHRASE_MODEL` and `SUMMARY_MODEL`
  - `gemini-2.5-flash` for the judge and the optimize generator
  - `gpt-5.4-nano` and `gpt-5.4-mini`
  - a local embedding route

  The display names were wrong here until A2; the table now names every
  route (see A2).
- [x] **0.2.** `infra/appliance/appliance.env.example` with every setting the install needs:
  - `DOCLING_STRICT=1`, `ENCRYPTION_PROVIDER=local` and SMTP
  - no moderation key and no PostHog, Langfuse or OTel endpoint
  - `VECTOR_SIZE` for the local embedding model
- [ ] **0.3.** A recorded run on one S-class machine: ingest a document set,
  ask questions, show citations and permissions, with the network cable
  unplugged. It ends with a list of every failure, and each failure becomes
  a step below.

  Still open: the run below was on a developer laptop with the network
  connected, so it proves neither the hardware class nor "unplugged". It
  still produced the failure list, which is the step's real purpose.

  **Partial run of 2026-10-17.** Hardware: a MacBook running Ollama on the host,
  with Postgres, Redis, Qdrant and Docling in Docker. web, api and worker
  ran from source with the appliance table and the env template. Every
  cloud key in the developer `.env.local` was set to empty. The branches
  for 0.1/0.2, A2, A4 and B3 were merged locally. Models:
  - `SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M` (chat)
  - `qwen2.5:7b-instruct` (small tier)
  - `bge-m3` (embeddings)

  What worked:
  - Four Polish markdown documents went through Docling and were embedded
    by `bge-m3`, with 1024-dimensional dense vectors in Qdrant.
  - The picker offered "Bielik 11B" (A2).
  - The setup checklist raised no model finding, because every probed model
    was pulled (B3).
  - A Polish question returned a correct answer with a citation.
  - Usage was recorded at zero cost.
  - Over about 25 minutes, `lsof`, sampled every second, saw no TCP
    connection from the web, api or worker processes to anything other than
    loopback.

  That sampling does not cover DNS or UDP, or the containers, and it can
  miss a connection shorter than a second. Closing that gap is A3, not this
  step.

  Failures, each one a step or an issue:
  1. **A per-app env file overrides the root one without saying so.**
     - `apps/worker/.env.local` set `REDIS_URL` to a different port, so the
       worker consumed a different queue from the one web wrote to.
     - The same file set `AWS_ENDPOINT_URL` to a cloud object store.
     - An appliance must have exactly one environment. The installer (C1)
       writes one, and the setup checklist should warn when per-app files
       exist.
  2. **An empty URL variable fails validation.** `LANGFUSE_HOST` and
     `MEILISEARCH_URL` both failed when left empty. The template must leave
     URL variables unset rather than empty. This needs a check against the
     env schemas.
  3. **The default locale loops for a signed-in user.** `/en` redirects to
     `/`, which redirects back to `/en`. The cause is `localePrefix: as-needed`
     against the root redirect in `proxy.ts`. It is not appliance-specific,
     but it is the first thing an English-speaking buyer would hit. It needs
     its own fix.
  4. **The thread header shows the route id (`local-chat`), not the display
     name.** `ThreadModelLabel` reads the static catalogue. This is the A2
     gap to close next.
  5. **The first answer took 3 minutes.** The laptop was running every
     service at once. The retrieval-usage transaction also exceeded Prisma's
     5-second timeout, which is non-blocking but recorded nothing. A5 has to
     measure this on target hardware before any tier is offered.
  6. **The picker offers a model that was never pulled** (`local-vision`).
     "Served" means configured, not present. The B3 probe could narrow the
     picker the same way it narrows the checklist.
  7. **apps/api in `start:dev` did not read the root `.env.local`.** It
     failed on `TARGET_ENV` and `SESSION_AUTH_SECRET` until given an
     explicit environment. This affects development only; the compose stack
     passes `env_file`.

### Phase A: a local install that is proven, not described

- [x] **A1.** `docker-compose.appliance.yml` on top of the two existing files,
  and it contains:
  - `ollama`, with its models on a named volume;
  - `ollama-models`, a one-shot job that pulls the models the appliance
    table routes and skips each one already present, so a restored volume
    needs no network. The apps wait for it.
  - the three apps pointed at the mounted appliance table, the compose
    Ollama and `DOCLING_STRICT=1`.

  `docker-compose.appliance.gpu.yml` adds the NVIDIA reservation, kept
  separate because Compose refuses a GPU reservation the host cannot meet.
  A guard checks that the pull list equals the table's models. How to run
  it is in `infra/appliance/README.md`.
- [ ] **A1b.** Still to do from the original A1:
  - the vLLM variant for L/XL
  - a local reranker service, reached through `RERANK_PROVIDER=cohere` +
    `RERANK_COHERE_BASE_URL`, with a test that the request shape matches
  - the `appliance-hybrid` profile (D3)

  None of them can be verified without a CUDA host.
- [x] **A2.** `origin: 'local'` and route-described models (`display`,
  `capabilities`) in the web picker and `GET /v1/models`. A described route
  replaces a catalogue entry of the same id, so the Phase 0 aliases keep
  their ids and get the right name. Zero token cost in usage reports, and
  the admin allowlist, are left for A2b: apps/admin does not read the route
  table today.

  The appliance table now uses it. The `local-*` chat routes carry a name
  and `chat` (`local-vision` also `vision`). `local-embed` and the aliases of
  hardcoded cloud ids carry a name and no capabilities, so the picker lists
  each local model once and the aliases only answer calls made by the cloud
  id. `the-appliance-route-table-covers-every-default-model` fails if a local
  chat route loses either field or an alias gains capabilities.
- [x] **A2c.** The thread header names the model the way the picker does.
  `ThreadModelLabel` used the static catalogue, so a local model showed its
  route id (`local-chat`) and an aliased cloud id showed the cloud name. It
  now uses the served list (one request per organization, the catalogue as
  fallback). Found by the 0.3 run.
- [x] **A2b (cost).** Usage tracking in web, api and worker prices a model
  whose route describes itself (`display`) at zero, through
  `routeDescribesItself` in `@ragenai/llm-gateway`: its cost is the
  hardware, and the cloud price of an id it aliases would be a bill nobody
  pays. Still open from A2b: local models on the admin allowlist, because
  apps/admin does not read the route table.
- [x] **A2d.** The picker and `GET /v1/models` hide a model whose server
  answered and does not have it (an Ollama model nobody pulled), using the
  B3 probe through `LlmGateway.missingModels`, cached for 30 seconds. A
  server that is down hides nothing, so a blip cannot empty the picker; the
  setup checklist reports it. Found by the 0.3 run (failure 6).
- [x] **A3 (local).** `npm run appliance:egress-check` runs the appliance
  on an `internal: true` network (`docker-compose.appliance.sealed.yml`),
  signs up an account through Better Auth, ingests one document and asks one
  question about it. tcpdump on the network's bridge sees every packet that
  is not addressed to another container, and the check names the container
  and the host it asked for. A canary that must be seen guards against a
  capture that sees nothing. It runs from a temporary directory with an
  environment generated from the appliance template, so no developer
  `.env.local` reaches it, and it swaps every model for `qwen2.5:0.5b` and
  `all-minilm` (`--full-models` keeps the real ones).

  The first runs found seven things leaving a stack that had passed every
  earlier check, plus a template that could not boot:
  - qdrant: `telemetry.qdrant.io`
  - Prisma, in api and in the migrate job: `checkpoint.prisma.io`
  - Ollama: `ollama.com`, for cloud models and model recommendations
  - Docling's Gradio UI: `api.gradio.app`, `raw.githubusercontent.com`
  - Docling: `huggingface.co`
  - onnxruntime inside Docling: `mobile.events.data.microsoft.com`
  - `appliance.env.example` named three of the eight secrets the
    installer generates, so api and the worker restart-looped.

  Each leak is switched off in `docker-compose.appliance.yml`. The template
  lists every secret, and
  `the-appliance-env-names-every-generated-secret` reads the installer's
  manifest to keep it complete. After that the check passes. It is
  verified on Docker 24; on Docker 26 and later an internal network's
  resolver may stop forwarding names, and the canary will say so.
- [ ] **A3b.** Still to do from A3:
  - Brain and the guardrail first pass in the scripted pass
  - hybrid mode, once the `appliance-hybrid` profile exists: only
    `llm-egress` on an external network, and the proxy refusing every host
    but its one
  - the check in CI on every change to the compose files, the route files
    or the worker's ingest
- [x] **A4.** Remove the known leaks, and make the rule a guard. What was
  found on a closer look:
  - Moderation in `apps/api` throws without a key, but the factory is lazy
    and a throwing factory is treated as "not configured" and lets the turn
    through (`run-input-guardrails.service.ts`). With no key there is no
    call, so it needed no change.
  - The hardcoded model ids are covered by routing them (0.1) and naming
    them (A2), with a guard that fails when one is added or renamed — once
    those land. Until 0.1's table is in use, those ids still resolve against
    the shipped cloud table. Making
    each one an env var would add settings without removing a path.
  - `apps/web`'s `openAIInstance`, an axios client to `api.openai.com`, had
    no callers. It was deleted.
  - `tests/architecture/model-providers-are-reached-through-the-gateway.test.ts`
    fails when a provider SDK is imported, or a provider endpoint is written
    into a string, outside `packages/llm-gateway`. Exceptions name the file
    and exactly the import or host they may use, with a reason; the rest of
    each excepted file is still checked.
- [ ] **A5.** Benchmark harness on the target hardware. For each tier:
  - tokens/s and time-to-first-token at 1, 5, 10 and 25 concurrent users
  - ingest throughput
  - answer quality on the existing retrieval eval (ADR-20) against the cloud
    baseline, **in Polish**

  The output is the sizing table in `docs/appliance-sizing.md`. This step
  replaces the placeholder tier table above.

### Phase B: what an organization checks first

- [x] **B1.** Company sign-in over OIDC, in the open edition (D1):
  - **Provider.** One generic provider (Better Auth `genericOAuth`, id
    `oidc`), configured by `OIDC_ISSUER`, `OIDC_CLIENT_ID`,
    `OIDC_CLIENT_SECRET` and the required `OIDC_ALLOWED_DOMAINS`. It uses
    discovery, PKCE, and a required ID-token verification against the
    issuer's JWKS.
  - **Domain gate.** An address outside the allowed domains is mapped to an
    empty email, so the callback refuses it before anything is created or
    linked. The provider's `email_verified` is passed through only for an
    allowed domain, so an issuer cannot take over a local account by
    asserting its address.
  - **Joining the organization (D6).** With `OIDC_JOIN_ORGANIZATION`, a new
    SSO user with a verified address passes closed registration and joins
    that organization as a member. If the organization does not exist, the
    sign-up is refused rather than given a personal one. Entra ID sends no
    `email_verified`, so `OIDC_TRUST_EMAIL=true` is the operator saying the
    tenant owns the allowed domains. Google's `email_verified` proves the
    address but not Workspace membership, so for Google's issuer the `hd`
    claim must also be an allowed domain. The pass applies only through the OIDC callback, never to a
    password sign-up at the same domain. Without it, SSO is one more door,
    with the registration rule and a personal organization like the others.
  - **Misconfiguration.** A partial configuration turns SSO off and appears
    on the setup checklist. Password sign-in is never affected.
  - **Tests.** `p0-38` runs against a mock issuer.
- [ ] **B2.** Instance branding (D5): name, logo and primary token, a runtime
  setting edited in `apps/admin`, behind feature key `instanceBranding`.
- [x] **B3.** Model probes on the setup page: one free `GET /models` per
  `openai-compatible` server behind `DEFAULT_MODEL`, `REPHRASE_MODEL`,
  `SUMMARY_MODEL` and `EMBEDDINGS_MODEL`, cached for 30 seconds. A server
  that does not answer and a model that was never pulled are two separate
  `recommended` findings, so sign-in never waits on them. Cloud routes are
  not probed: they have no free call, and their failure mode is
  credentials, which the env check already reads. The reranker probe and
  the admin health view are left for later; there is no local reranker yet
  (A1).
- [ ] **B4.** Per-organization retention for threads and messages (default
  off), because the first data-protection question is "how long do you keep
  it".

### Phase C: something that can be installed and maintained

- [ ] **C1.** `create-ragen-app` gains "appliance". It asks local or hybrid,
  then the tier (and for hybrid the EU endpoint), and writes the profile, the
  route file and the env.
  - [x] **C1a (local, default tier).** "Models on this machine" in the
    provider question, or `--appliance` (`--tier=`, `--gpu`). It asks no API
    key. It writes the profile as `COMPOSE_FILE` in `.env` (the standard
    files plus `docker-compose.appliance.yml`, and the GPU file on request).
    It copies `routes.appliance.yaml` over `routes.yaml` after checking that
    every route is `openai-compatible` on the local `ollama` connection and
    that every model the env selects is routed. The env is the template's
    model ids, `VECTOR_SIZE=1024` and `DOCLING_STRICT=1`. Storage, encryption
    and the worker runtime are answered with the on-machine choices, and the
    host setup is skipped because the containers migrate. Profiles and tiers
    are rows in `packages/create-ragen-app/src/appliance.ts`. The one tier,
    `default`, is the Phase 0/A1 Ollama set and is labelled as not yet
    measured. The installer CI job scaffolds an appliance on every PR, and
    `create-ragen-app-manifest-is-current` holds the tier to `infra/appliance/`
    and the route table. The `applianceRules` env fragment named under Core
    surfaces does not exist yet; the wizard writes what it would require.
  - [ ] **C1b.** Hybrid: offered once the `appliance-hybrid` profile exists
    (A1b), asking for the EU endpoint. Until then it is listed as not
    available and `--appliance=hybrid` is refused.
  - [ ] **C1c.** More tiers, each offered only after A5 has measured it. A
    tier is a row, not a code path. PII masking in the appliance container
    stack also waits: Presidio's URLs there must be service names in `.env`,
    which the wizard does not write yet.
- [ ] **C2.** Offline bundle: the release's images as a tarball, with a
  pre-seeded basal volume, the default tier's model weights and a checksum
  manifest. The bundle installs and upgrades with no network, and runs
  migrations first.
- [ ] **C3.** Support channel (D4): an outbound-only tunnel from the machine,
  so the organization opens no inbound port. Its admin switches it on and off
  in `apps/admin`, and it can be time-limited. It carries two roles:
  - **first line:** reaches only the `apps/admin` web UI through the
    tunnel, never a shell. It can see the health view and service status,
    read logs with message content redacted, and restart a service from a
    fixed allowlist (web, api, worker, Docling, the model server). Restarts
    go through a small supervisor sidecar that accepts those named actions
    and nothing else. The sidecar is the only component holding the Docker
    socket, and the admin app talks to it over an authenticated local
    endpoint, so no first-line action can mount a volume, run a container,
    open a database shell or read documents;
  - **maintainer (second line):** SSH to the host for upgrades and repairs,
    on a separate key that the organization's admin enables per session.

  Every session, with role, person and duration, goes to the audit log, and
  the organization sees active sessions in the panel. It is not part of the
  local-only egress check: when the channel is off, the install sends nothing.
  When it is on, the tunnel endpoint is the one allowed exception, and the
  check reports it.
- [ ] **C4.** `docs/appliance-runbook.md` covers install, upgrade, rollback,
  model swap with re-index, backup and restore of Postgres, Qdrant and
  storage, and a first-line checklist that first-line support works through
  with its role in C3 before escalating to us.

  Partly done: [the runbook](../appliance-runbook.md) covers the manual
  install, the egress check, backup and restore, online upgrade, rollback
  with the additive-migrations rule, model swap with a full re-index, and
  troubleshooting per failure mode. Still to do:
  - the offline upgrade, once C2 exists
  - the first-line checklist as a role, once C3 exists (a draft is there)
  - the install through `create-ragen-app`, once C1 lands

## Testing

- **Unit:**
  - the route-schema additions
  - the picker accepting route-described models
  - zero cost for the `local` origin
  - the `applianceRules` env fragment
  - the moderation skip path in api
  - the OIDC config parser
  - the branding fallback when no row exists
- **Architecture:** a guard that fails when a model id reaches a provider
  without the route table, so the moderation case cannot recur.
- **Integration:** A3's egress check in CI (CPU, small model) on every change
  to compose, the route files or the worker's ingest. Not yet: the CI job is
  A3b, and until then the check is run by hand.
- **E2E:** `p0-*` for OIDC sign-in against a mock issuer, because sign-in must
  gate the merge. `smoke-*` for the panel rendering with custom branding.
- **Measurement:** A5 numbers are committed with the hardware model, driver
  and model versions. A tier is not offered without them.

## Rollout and rollback

- Phase 0 and A1/A3 are additive files, so rollback is deleting them.
- A2 changes the picker only for a route that carries `display`. Only the
  appliance table does, and the shipped `routes.yaml` does not, so it needs
  no feature key: an install opts in by writing the field. Rollback is
  removing it.
- B1 is inert without OIDC env vars. Rollback means removing the vars, and
  the local admin password still works.
- B2 needs a migration that adds one table, and no existing table changes.
  Rollback means the feature key off, with the row ignored.
- C2 bundles carry the previous image tags, so going back on an install is
  re-tagging and restarting. Migrations are additive, so the older app runs
  on the newer schema. The runbook must state that rule, and every
  migration in this programme has to keep it.
- `create-ragen-app` changes (C1, plus the env fragment in A) are named in
  the PR description, per the post-task workflow.
