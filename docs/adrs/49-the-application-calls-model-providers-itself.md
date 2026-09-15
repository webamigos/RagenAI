# ADR-49: The Application Calls Model Providers Itself

**Status:** Accepted. Supersedes [ADR-04](04-litellm-unified-llm-gateway.md);
reduces [ADR-34](34-shared-litellm-client-package.md). Implemented through
Phase B of
[the retirement spec](../specs/2026-09-14-replace-litellm-with-an-in-process-gateway.md)
— B0–B5 done, B6 (removing the infrastructure) pending the demo cutover week.
**Date:** 2026-09-15

## Context

[ADR-04](04-litellm-unified-llm-gateway.md) adopted a LiteLLM proxy in January
2025, and its reasoning was sound for what the application was then: one client
library instead of three provider SDKs, model management without a deploy,
Langfuse tracing for free, and per-organization model restrictions filtered
against the proxy's `/v1/models`.

Every one of those five reasons had migrated into the application by mid-2026,
mostly without anyone deciding that it should.

- **One client library** became true on its own. The AI SDK grew first-class
  providers for Azure, Bedrock and Vertex, so "three SDKs" stopped being the
  alternative — the alternative is three thin adapters over one SDK.
- **Model management without a deploy** was true of `config.yaml` and remains
  true of a route table. It never required a proxy, only a file.
- **Langfuse tracing** is emitted by the application as well, through
  [ADR-22](22-observability-opentelemetry.md)'s OTel pipeline. The proxy's copy
  duplicates it.
- **Per-organization restrictions** are `OrganizationSettings.allowedModels`,
  applied in the application before the call. The `/v1/models` filter narrows a
  list the application had already narrowed.
- **Budgets** were the one job genuinely left. They turned out to be the worst
  case of all.

That last point is what turned a tidy-up into a decision. `checkUsageLimitsQuery`
— the application's own ceiling check — **had no callers for five months**,
since `c35a3b4aa` handed enforcement to LiteLLM's virtual-key budget. The only
thing standing between an organization and an unbounded bill was a proxy
refusal recognised by matching the substring `'Budget has been exceeded'` in an
error message. Two of the three ceilings the settings UI collects —
`monthlyTokenLimit` and `monthlyMessageLimit` — were enforced by nothing at
all, in either place. ADR-34 had already been written on the assumption that
the application enforced its own limits, and was wrong about it; that ADR now
carries a correction.

So the proxy was not carrying four jobs. It was carrying one job badly, and
three the application had quietly taken back.

## Options considered

1. **Keep the proxy.** Cheapest today. Leaves every duplication in place, keeps
   a critical dependency with its own Postgres in the deployment, and keeps the
   admin panel's "proxy" page whose only purpose is to report the disagreement
   between the two copies of the truth.
2. **Build our own gateway service.** One place for credentials and one for the
   route table — the two real operational advantages. But it is another service
   to build, deploy, monitor and keep available, and a hop in front of every
   model call, which is most of what ADR-04 is being retired for.
3. **Call providers from the application**, with the routing table as
   configuration.

## Decision

**Option 3.** `packages/llm-gateway` turns a model id into an AI SDK model, and
the applications call providers directly.

Five provider families — `azure`, `bedrock`, `vertex`, `openai` and
`openai-compatible` — each a thin adapter taking a route and its credentials
and returning a model. No routing decisions live in the package.

**The route table is configuration, not a constant.** `infra/llm-gateway/routes.yaml`,
validated by a zod schema at load, with a JSON Schema generated from the same
zod schema for editor support. `LLM_ROUTES_PATH` points at a different file.
This is the load-bearing half of the decision, and the reason is
[Q6](../specs/2026-09-14-replace-litellm-with-an-in-process-gateway.md): a table
compiled into TypeScript would make attaching any other endpoint a fork of the
package.

**Credentials keep the proxy's variable names** — `AZURE_API_KEY`,
`AWS_BEDROCK_REGION`, `VERTEX_PROJECT`, `VERTEX_CREDENTIALS`, `SCW_API_BASE` —
so a deployment running the proxy needs no new secrets to try the gateway.
They are read through a `CredentialSource` interface with a `scope`, so
per-organization keys in ragen-token-vault ([ADR-13](13-opaque-api-keys.md),
[ADR-32](32-token-vault-and-mcp-stay-separate.md)) arrive as a second
implementation rather than as an edit to every call site.

### Attaching an external gateway stays supported

Retiring LiteLLM as the *default* does not end support for running one, and
what is supported is broader than LiteLLM: **any OpenAI-compatible endpoint**,
registered as a route with a `connection` name and two environment variables.
That covers [Portkey](https://github.com/portkey-ai/gateway), LiteLLM, vLLM,
Ollama and TGI. A connection can also carry extra headers
(`LLM_<NAME>_HEADERS`), because gateways that route on headers — Portkey
selects its upstream with `x-portkey-provider` — cannot be expressed by a base
URL and a key alone.

The procedure is [`docs/attaching-a-gateway.md`](../attaching-a-gateway.md).
**Portkey is the first choice** among them: it is TypeScript and Node, the same
stack as this repository, so it is deployable and patchable by whoever
maintains Ragen without a second language runtime in the deployment.

**What an attached gateway gets is a router, not a control plane.** Limits,
allowlists and usage accounting stay in Ragen. Anyone setting a budget inside
Portkey or LiteLLM will find Ragen ignores it.

### Nothing loads in-process

This does not reopen
[ADR-38](38-mcp-is-the-plugin-api-no-in-process-plugin-runtime.md). A route
names an endpoint; no third-party code is loaded into the application.

## What moved, and where it went

| Was the proxy's | Is now |
| --- | --- |
| provider adapters | `packages/llm-gateway`'s five families |
| model list for the picker | `gateway.availableModels()`, credential-aware |
| monthly cost / token / message ceilings | `assertWithinUsageLimits` on every chat surface, `checkUsageCeilings` on API surfaces — Phase A |
| per-team `rpm` / `tpm` | `checkTeamRateLimitQuery`, a Redis token bucket, called before every turn |
| per-team and per-org virtual keys | **gone.** Budgets are the application's; the keys carried nothing else |
| spend logs | `ai_usage`, which the application already kept a better copy of |
| Langfuse tracing | app-level OTel only (ADR-22) |

## Consequences

**Provider credentials now live in three application processes** — web, api and
worker — rather than in one proxy container. This is the real cost, it was
accepted deliberately as Q1, and it is not hypothetical: credential rotation
stops being one container restart and becomes three.

**A missing credential surfaces later.** The proxy failed at its own boot; the
gateway fails on the first call that needs that provider. `npm run gateway:preflight -- --probe`
exists to pull that failure forward, and it makes one real call per configured
model because a check that only reads variables will call a misconfigured
deployment healthy — which it did, three times over, the first time this was
run for real.

**Retrieval is unchanged.** Both paths were measured over the same 24 questions,
three runs each, in one sitting:
[the comparison](../rag-gateway-comparison-2026-09-15.md). Sixteen questions
identical in both arms, same-language 16/16 in every run, control floor 0/23
throughout. One question differs reproducibly and it is answer composition
rather than retrieval — the native arm volunteers a distractor figure from a
sibling document.

**Answer wording can differ.** The chain sends no temperature, so each path
inherits its client's defaults, and LiteLLM's OpenAI→Vertex translation is not
the request `@ai-sdk/google-vertex` makes. This is a behavioural difference, not
a regression, and it is the reason the cutover runbook says a change in wording
is not a reason to roll back.

**The flag is temporary.** `LLM_GATEWAY=litellm|native` exists so the two paths
can be compared and so a cutover is a variable change rather than a release.
B6 reduces it to one value; what survives is the seam naming an endpoint, not
the choice between two implementations.

**A dependency with its own Postgres leaves the deployment**, along with the
admin panel page whose only job was to report where the two copies of the truth
disagreed.

## What this ADR does not decide

- **Whether the default flips everywhere.** Demo runs `native` from 2026-09-15
  for a week; the rest follows if nothing operational appears.
- **An OpenRouter provider family.** Nothing routes to OpenRouter today on
  either path, so adding one is new capability rather than parity — recorded as
  Q7. `@openrouter/ai-sdk-provider` exists and peer-depends on `ai: ^7`, so it
  would be a sixth adapter of the same shape.
- **Where the route table lives long-term.** `loadRouteTable` takes parsed
  content rather than reading the disk, so moving it to the database — with
  per-organization routing — needs no change to the package.

## The lesson worth keeping

**A query that computes a limit is not a limit. A limit is a call site.**
`checkUsageLimitsQuery` was complete, correct and tested, and enforced nothing
for five months because the one call to it had been deleted. Every static check
in this repository was green throughout. Grep a guard's callers before trusting
it — and when a guard fires because its subject moved, build the replacement
rather than deleting the guard: that is what happened when B5 removed the
virtual keys that per-team rate limiting was enforced on.
