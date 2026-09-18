---
title: GET /v1/models, so an OpenAI client can fill its model picker
status: in-progress
areas: [api, docs]
adrs: [13, 21, 33, 49]
---

# GET /v1/models, so an OpenAI client can fill its model picker

## TLDR

Neither app serves `GET /v1/models`, so an OpenAI-compatible client pointed at
Ragen shows an error where its model list should be. This adds the endpoint to
`apps/api`, answering with the same set the panel's own picker shows: the
catalogue, narrowed to what this deployment can actually serve and to what the
organization is allowed. It is a convenience, not a blocker — n8n's model field
takes a typed id as well as a list — and it is deliberately smaller than the
question "which models exist", which three different things already answer.

## Problem

- No route: `grep -rn "'models'" apps/api/src apps/web/src/app/api` finds
  nothing. An OpenAI SDK's `client.models.list()` 404s.
- n8n's `LmChatOpenAi` declares `model` as a `resourceLocator` whose default
  mode, `list`, calls this endpoint and whose other mode, `id`, is a plain
  string. So the cost of not having it is an error in the default mode and a
  manual step — not a blocked integration. The claim that it blocked n8n
  appeared in
  [the assistant_id spec](2026-09-17-assistant-id-optional-on-the-openai-surface.md)
  and was corrected there after the node's source was read.
- Three things already answer a version of "which models": `MODEL_REGISTRY` in
  `@ragenai/platform-contracts` (presentation), `infra/llm-gateway/routes.yaml`
  (what an upstream serves, per [ADR-49](../adrs/49-the-application-calls-model-providers-itself.md)),
  and `OrganizationSettings.allowedModels` (what an admin permits). The endpoint
  is the intersection, and the risk here is answering with one of the three.

## Decisions

No structural questions were held open for this one — it is a read-only
endpoint over data that already exists — but six choices are worth stating,
because a reviewer could reasonably expect the opposite of each.

1. **The list is catalogue ∩ route table ∩ org allowlist**, exactly what
   `getAvailableModelsForOrganization` gives the panel picker. Listing a model
   the organization may not use, or one no upstream serves, buys the caller a
   400 on first use instead of an absence they can see.
2. **The route table's fallback is mirrored, not tightened.** When the table
   cannot be read, or intersects the catalogue emptily, apps/web logs and falls
   back to the whole catalogue rather than serving an empty picker. The
   endpoint does the same, for the same reason and with the same warning: an
   empty list reads as "this product is broken", and the call itself still
   fails loudly per model.
3. **Invisible catalogue entries stay out** (`visible: false` — `gpt-5.4-nano`
   and the other internal tiers). They remain _callable_ by a caller who names
   them in `model`, and that is not a contradiction: this endpoint advertises
   what a picker should offer, not what the chat endpoint accepts.
4. **`owned_by` carries the catalogue's `origin`** (`openai`, `google`,
   `anthropic`, `mistral`) rather than the literal `ragen`. It is the one field
   an OpenAI client shows next to the id, and the vendor behind the model is
   more use to a person choosing one than our own name repeated on every row.
5. **`created` is `0`.** We do not record when a model was published, and the
   field is required by the OpenAI `Model` type. A constant epoch — which some
   compatible servers copy from OpenAI's own response — is a plausible-looking
   date that is simply false; `0` is visibly not a date.
6. **The key's `knowledgeScope` does not narrow this.** A scope says which
   documents a key answers from; models are not assistants. The organization
   is the only boundary here, as it is for the catalogue itself.

## Out of scope

- **Serving the model list from anything but the three sources above.** No
  live probe of each provider, no cache invalidation: `gateway:preflight`
  already exists for "do the credentials work", and it makes real calls.
- **`apps/web`'s internal `/api/v1`.** Nothing calls a models route there.
- **Model _capabilities_ in the response** (context window, modality, pricing).
  OpenAI's own payload does not carry them, so a client has nowhere to put
  them, and inventing fields is how an "OpenAI-compatible" surface stops being
  one.

## Core surfaces touched

| Surface                       | Change                                                               | What catches a mistake       |
| ----------------------------- | -------------------------------------------------------------------- | ---------------------------- |
| `packages/platform-contracts` | consumed, not changed — `selectableModels` gains a second app caller | package tests                |
| `prisma/schema.prisma`        | none — `OrganizationSettings.allowedModels` already exists           | —                            |
| `apps/api` `AppModule`        | one more module in the graph                                         | `chat.module.wiring.spec.ts` |

## Failure modes

- **Route table missing or unreadable** — falls back to the full catalogue with
  a logged warning (decision 2), never an empty list.
- **An organization whose allowlist names only models no route serves** — the
  intersection is empty and the response is an empty list. That is correct and
  legible: an admin restricted the org to something this deployment cannot
  serve, and the picker showing nothing is the honest report of it.
- **`GET /v1/models/{id}` for a model that exists in the catalogue but is not
  allowed** — 404, the same as one that does not exist. The allowlist is a
  configuration detail of another organization's tier; a 403 would confirm the
  id is real.

## Phases

One phase; the endpoint is not useful in halves.

- [x] **A1.** `getAllowedModels(orgId)` on apps/api's
      `OrganizationSettingsService`, reading the column apps/web already reads.
      Unit test, including the empty-array-means-no-restriction case that has
      bitten this column before.
- [x] **A2.** `ModelsModule` — service resolving catalogue ∩ routes ∩ allowlist,
      mapper to the OpenAI `Model` shape, controller behind `ApiKeyGuard` with
      `GET /v1/models` and `GET /v1/models/:id`. Unit tests per decision above.
- [x] **A3.** Register in `AppModule`; the wiring spec compiles the real graph.
- [x] **A4.** Fix `model-catalog.ts`'s own docstring, which still says the
      served set is "read at runtime from the proxy's `/v1/models`" and points
      at `infra/litellm/config.yaml` — a file B6 deleted. It is the module this
      endpoint is built on, and the sentence now describes the opposite of how
      the product works.
- [x] **A5.** A line in [`docs/changelog-notes.md`](../changelog-notes.md). The
      `ragen-docs` note is a hand-off to that repository, not a file here.

## Testing

- **Unit (`apps/api`)** — the service: each of the three narrowings, the
  fallback when the route table is unreadable, an empty intersection, and
  `visible: false` staying out.
- **Unit (`apps/api`)** — the mapper: the OpenAI `Model` shape, `owned_by` from
  `origin`, `created: 0`.
- **Unit (`apps/api`)** — `getAllowedModels`: empty array means no restriction,
  not "nothing allowed".
- No e2e: no harness speaks to `apps/api`, and the manual n8n check in the
  assistant_id spec covers the only client that matters here.

## Rollout and rollback

Additive, read-only, no migration, no env var, no flag. Revert the PR.
