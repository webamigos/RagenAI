---
title: assistant_id is optional on the OpenAI-compatible surface
status: in-progress
areas: [api, auth, knowledge-base, rag, docs]
adrs: [13, 21, 33, 36]
---

# assistant_id is optional on the OpenAI-compatible surface

## TLDR

`POST /v1/chat/completions` requires `assistant_id`, a field the OpenAI wire
protocol has no slot for, so no OpenAI-compatible client — n8n's OpenAI nodes,
the OpenAI SDKs, anything pointed at a custom base URL — can call Ragen at all.
This moves the choice onto the API key, using the `KnowledgeScope` vocabulary
the chat UI already offers per thread, and turns `assistant_id` into a field the
key must agree with. The non-obvious part: **the key's scope is a boundary, not
a default** — a key bound to assistant A rejects a request for assistant B
rather than obliging it, which is stricter than the API is today.

## Answered

Decided 2026-09-17, before any code was written.

- **Q1 — the non-assistant scope is the knowledge base**, not "every document in
  the organization". In this codebase that level already has a name:
  `KNOWLEDGE_BASE` in
  [`packages/platform-contracts`](../../packages/platform-contracts/src/retrieval/knowledge-scope.ts),
  which resolves to the `metadata.project_id IS NULL` branch
  [`buildMetadataFilter`](../../apps/api/src/chains/basic-rag/initialize-basic-rag.service.ts)
  already builds and the web chat already uses. No retrieval code changes, so
  [ADR-20](../adrs/20-pause-and-measure-rag-quality.md)'s measurement gate does
  not apply. A fourth level meaning "every project at once" is a different
  feature; see [Out of scope](#out-of-scope).
- **Q2 — no backfill story is needed.** There are no API keys in production —
  there is no production; demo is the only deployment. Demo's keys are recreated
  by hand as part of the rollout.
- **Q3 — `GET /v1/models` is a separate spec and a separate PR.** It exists in
  neither app. It was recorded here as "likely the second blocker for n8n", and
  that was wrong — checked against the node's source afterwards: n8n's
  `LmChatOpenAi` declares `model` as a `resourceLocator` with a `list` mode that
  calls `GET /v1/models` **and an `id` mode that is a plain string**, and the
  list is filtered by a case-insensitive substring rather than an allowlist. So
  a missing route degrades the picker and blocks nothing. It is still worth
  building — `list` is the default mode, and an error there reads as a broken
  integration — but it is a convenience, and by the [README](README.md)'s own
  test a different capability wearing the same name.
- **Q4 — `model` means a model.** No `model: "asst-<id>"` escape hatch. With Q5
  answered as a boundary, an override channel would only let a caller ask for
  something the key is going to refuse.
- **Q5 — the key's scope is a permission boundary.** A key bound to assistant A
  answers for A and 403s on an `assistant_id` naming anything else; a
  `KNOWLEDGE_BASE` key answers from the knowledge base and 403s on any
  `assistant_id` at all. This is a deliberate tightening: an API key today
  carries the whole organization, so any `assistant_id` in the org is accepted.

Three decisions follow from those answers rather than standing on their own, and
are called out because a reviewer could reasonably have expected the opposite:

- **The key reuses `KnowledgeScope`; no new enum.** The first draft of this spec
  invented an `ApiKeyScope { ASSISTANT, GLOBAL_KB }`, which is
  [ADR-33](../adrs/33-shared-platform-contracts-package.md)'s failure mode
  exactly — a second vocabulary for a concept that already has one, in a repo
  with `shared-contracts-are-not-recopied.test.ts`. `KnowledgeScope` is already a
  Prisma enum, already crosses the wire, and already ships
  `scopeRequiresProject()`, whose docstring states the fail-closed rule this
  spec needs: _"`ASSISTANT` with no project is rejected, never quietly widened
  to the knowledge base."_
- **All three endpoints change, not just the OpenAI one.** The earlier reading
  was that `/v1/chat` and `/v1/search` keep `assistant_id` required, being ours
  and having no protocol problem. A boundary makes that untenable: a
  `KNOWLEDGE_BASE` key rejects every `assistant_id`, so those endpoints would be
  unreachable for it. One resolver, one rule, three endpoints — plus
  `/v1/threads`, which already has the fallback and gains the boundary check.
- **`MODEL_ONLY` is not offered as a key scope yet.** The enum has the value and
  the panel offers it per thread, but `apps/api`'s chain does not honour it:
  unlike [apps/web's `initializeBasicRag.ts`](../../apps/web/src/app/api/threads/services/initializeBasicRag.ts),
  `InitializeBasicRagService` takes no `knowledgeScope` and never calls
  `scopeRetrieves`. Offering it on a key would mean a key that promises not to
  retrieve and retrieves anyway. See [Out of scope](#out-of-scope).

## Problem

Verified in code, not documentation, on 2026-09-17:

- `assistant_id` is required in three DTOs —
  [`create-chat-completion.dto.ts:75`](../../apps/api/src/chat-completions/dto/create-chat-completion.dto.ts),
  [`chat.dto.ts:21`](../../apps/api/src/chat/dto/chat.dto.ts),
  [`search.dto.ts:20`](../../apps/api/src/search/dto/search.dto.ts). Only the
  first speaks a protocol someone else defined.
- The global validation pipe runs with `forbidNonWhitelisted`, so an OpenAI
  client's body is a 400 before it reaches a handler. There is no header or
  query parameter that would let the field be supplied out of band.
- The fallback this needs **already exists and is dead code**.
  [`ThreadsService.resolveAssistantId`](../../apps/api/src/threads/threads.service.ts)
  falls back to `context.projectId`;
  [`ApiKeyGuard`](../../apps/api/src/common/guards/api-key.guard.ts) populates it
  from `ApiKey.projectId`; the column exists; and
  [`createApiKeyCommand`](../../apps/web/src/features/organizations/services/commands/create-api-key-command.ts)
  takes a `projectId` argument and writes it. But the server action
  [`createApiKey`](<../../apps/web/src/app/[locale]/(panel)/organization/api-keys/actions.ts>)
  calls it as `createApiKey(name, debugMode)` and the panel form has no
  assistant picker, so **nothing in the monorepo has ever written a non-null
  `ApiKey.projectId`**. Every key is unscoped; the threads fallback resolves to
  `undefined`; `Thread.projectId` is nullable, so the result is a thread with no
  project and no error anywhere.

That last point is the failure mode [Core surfaces](../../AGENTS.md) already
names — a rule that is computed and never called — and it earns a line in
[`docs/lessons.md`](../lessons.md) on its own.

## Out of scope

- **`GET /v1/models`** — Q3. Separate spec, separate PR. Not a blocker: n8n's
  model field takes a typed id as well as a list.
- **`MODEL_ONLY` as a key scope.** It needs `knowledgeScope` threaded through
  `InitializeBasicRagService` and the three API services first — a port of what
  apps/web does at `initializeBasicRag.ts:101` and `:175`. Worth doing (a key
  that is "our routing and limits, no retrieval" is a real n8n use), but it is a
  chain change, not a key change. The column added here already has the value,
  so the follow-up is a UI option and a chain parameter, not a migration.
- **A scope meaning "every project in the organization".** A new retrieval
  filter (dropping the `project_id` clause) and a measurement under ADR-20.
- **Editing the scope of an issued key.** Keys are created with a scope and
  otherwise deleted and recreated, which is how the panel already works for
  everything but `debugMode`.
- **Per-project MCP connector filtering for `KNOWLEDGE_BASE` keys.**
  [`loadMcpToolsForApiRequest`](../../apps/api/src/mcp/load-mcp-tools.service.ts)
  narrows connectors by project only `if (projectId)`, so a knowledge-base key
  loads every connector the org has enabled. That is today's behaviour for a
  no-project turn and this spec does not change it — but it means such a key is
  _wider_ in tools than any assistant key, which the documentation must say.
- **A cross-org leak found while writing this spec, fixed ahead of it.**
  `FilesService.list` and `.get`
  ([files.service.ts:49](../../apps/api/src/files/files.service.ts),
  [:73](../../apps/api/src/files/files.service.ts)) filter `userFile` by
  `projectId: context.projectId` and **nothing else** — no `organizationId`.
  Since no key has ever had a project, Prisma receives `undefined`, drops the
  clause, and `GET /v1/files` lists every file row in every organization to any
  valid key. `remove` is scoped correctly and there is no content-download
  route, so this is metadata (file names, sizes, timestamps) rather than
  content. It is a live defect on `main`, independent of this spec, and it ships
  as its own PR first — step **A0** only records the dependency. See the
  `ragen-tenant-scope-audit` skill.

- **The public API reference.** Docs live in the `ragen-docs` repository since
  2026-09-15. This PR updates the in-repo Swagger decorators and leaves a note.
- **`apps/web`'s internal `/api/v1/chat/completions`.** It has its own copy of
  this resolution (`context.projectId || body.assistant_id`, key-first, at
  [route.ts:161](../../apps/web/src/app/api/v1/chat/completions/route.ts)) and no
  caller since apps/api was cut over. Deleting it is its own cleanup.

## Proposed solution

One resolver, owned by `apps/api`, consulted by every endpoint that names an
assistant:

```
resolveAssistantScope(assistant_id | undefined, ApiContext)
  → { projectId: string | null }   // throws 403 otherwise
```

| key scope                    | `assistant_id` in body | result                        |
| ---------------------------- | ---------------------- | ----------------------------- |
| `ASSISTANT` → `A`            | absent                 | `A`                           |
| `ASSISTANT` → `A`            | `A` or `asst-A`        | `A`                           |
| `ASSISTANT` → `A`            | `B`                    | **403**                       |
| `ASSISTANT` → `A`            | unknown / another org  | **403** (not 404 — see below) |
| `ASSISTANT`, project deleted | anything or absent     | **403**, naming the cause     |
| `KNOWLEDGE_BASE`             | absent                 | `null` → knowledge base       |
| `KNOWLEDGE_BASE`             | anything               | **403**                       |

Three details that are decisions, not details:

- **403, not 404, for an id the key may not use.** Today `ChatCompletionsService`
  answers `404 Assistant not found` and `ThreadsService` answers `400`. Under a
  boundary the interesting case is "your key may not ask this", which is a 403
  whether or not the project exists — one shape for every rejection, and no
  probing for which ids are real.
- **Precedence is "the key decides".** This matches the internal web route's
  key-first order and inverts `ThreadsService`'s current body-first behaviour, so
  it is a contract change on a shipped endpoint, not only on the new path.
- **The deleted-project case is `scopeRequiresProject`, not a local check.** The
  relation is `onDelete: SetNull`: delete the project and an assistant-scoped key
  keeps `knowledgeScope = ASSISTANT` with `projectId = null`. The contract
  function already says that combination is rejected rather than widened; the
  resolver calls it rather than re-deciding.

Alternatives rejected:

- **`assistant_id` optional but a free override (Q5 option a).** Zero breakage
  and no column, but a key "bound" to an assistant guarantees nothing, and an
  integrator handed that key can read every other assistant in the org.
- **A new `ApiKeyScope` enum.** ADR-33; see [Answered](#answered).
- **`model: "asst-<id>"` (Q4).** Under a boundary the key already fixes the
  answer, so a second way to ask adds a syntax and no capability.
- **Encoding the scope in the key string.**
  [ADR-13](../adrs/13-opaque-api-keys.md) settled it: keys are opaque and carry
  no context.

## Core surfaces touched

| Surface                                   | Change                                                                  | What catches a mistake                                       |
| ----------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| `prisma/schema.prisma`                    | `ApiKey.knowledgeScope` column on the existing `KnowledgeScope` enum    | migration + `npm run verify` (regenerates all three clients) |
| `packages/platform-contracts`             | consumed, not changed — `scopeRequiresProject` gains a second caller    | package tests; `shared-contracts-are-not-recopied.test.ts`   |
| `ApiKeyGuard` / `ApiContext`              | carries `knowledgeScope` alongside `projectId`                          | `api-key.guard.spec.ts`                                      |
| `src/lib/auth-guards.ts` / tenant scoping | none — the resolver narrows inside the existing org scope, never widens | resolver unit tests; `tenant-scope-guard` untouched          |

No new package, no env var, no new service, so `packages/create-ragen-app` is
untouched — nothing a fresh install needs changes.

## Data model

```prisma
model ApiKey {
  // …
  knowledgeScope KnowledgeScope @default(KNOWLEDGE_BASE) @map("knowledge_scope")
  projectId      String?        @map("project_id") @db.Uuid
}
```

The enum already exists and already has this name on `Thread`. Invariant:
`knowledgeScope = ASSISTANT` ⟺ `projectId IS NOT NULL` at creation, enforced in
`createApiKeyCommand` and re-asserted by the resolver at read time, because
`onDelete: SetNull` can break it afterwards without anyone writing a row.

`MODEL_ONLY` is representable and rejected at both ends — the creation form does
not offer it and `createApiKeyCommand` refuses it — until the chain honours it.

Migration: additive, one column with a default that matches
`DEFAULT_KNOWLEDGE_SCOPE`. Every existing row has `projectId IS NULL` and takes
`KNOWLEDGE_BASE`, which is correct for it. No backfill (Q2).

## Failure modes

- **Project deleted under an assistant-scoped key** — `ASSISTANT` with no
  project → 403 naming the deleted assistant. Never a silent widening.
- **`KNOWLEDGE_BASE` key in an org that keeps everything inside projects** —
  `project_id IS NULL` matches nothing and the turn answers with no context.
  Retrieval returning zero chunks is an existing, handled path; the creation form
  must say what the scope reaches so this is not discovered at runtime.
- **`assistant_id` equal to the key's own project, prefixed or raw** — accepted
  both ways via `stripPrefix`. One test each: "it matches" quietly becoming "it
  403s" is the regression this table exists for.
- **Integrations that send `assistant_id` with an unscoped key** — those keys are
  `KNOWLEDGE_BASE` after this change and the call 403s. No production keys (Q2);
  demo's are recreated. This is the one breaking change, and it is deliberate.
- **A request racing the deletion of its key's project** — one side of the
  `SetNull` resolves, the other 403s. No partial state, no cross-org read.
- **`ASSISTANT` written with no project by a future caller of
  `createApiKeyCommand`** — thrown at write time, not discovered at request time.
- **MCP connectors for a knowledge-base key** — every enabled connector loads,
  unfiltered. Known, unchanged, documented; see [Out of scope](#out-of-scope).

- **An `ApiContext` built without a key** — `SessionAuthService`
  ([session-auth.service.ts:73](../../apps/api/src/common/services/session-auth.service.ts))
  constructs the same type for session-authenticated internal callers and has no
  key scope to put in it. An absent scope means "no key boundary applies", not
  `KNOWLEDGE_BASE`; the resolver must say so explicitly, or the day one of those
  controllers adopts it, every session caller 403s.
- **The scope UI landing before the boundary does** — a form that says "this key
  reaches only assistant A" while no endpoint enforces it is a false security
  claim for the length of a deploy window. This is why the UI is the last phase,
  not the first.

## Phases

Each phase leaves the application working. The UI comes last on purpose: until
the boundary is enforced, a form offering one would be describing a guarantee
that does not exist.

### Phase A — the key can carry a scope

- [x] **A0.** _(separate PR, [#1236](https://github.com/webamigos/RagenAI/pull/1236) — green, awaiting review; this branch already carries the same clause so the rebase resolves to one file.)_ Scope `FilesService.list` and `.get`
      by `organizationId`. Not this feature, but a blocker for it: Phase A writes
      the first non-null `ApiKey.projectId` in the product's history, which
      changes what those two queries return, and doing that on top of a missing
      org clause turns a leak into a moving target.
- [x] **A1.** `ApiKey.knowledgeScope` in `prisma/schema.prisma` + migration;
      `npm run generate:types`. Nothing reads the column yet.
- [x] **A2.** `createApiKeyCommand` takes `knowledgeScope` + `projectId`, enforces
      the invariant, rejects `MODEL_ONLY`, and records both in the audit log and
      security event it already writes. Unit tests per branch.
- [x] **A3.** `createApiKey` server action passes them through, after
      `requireOrgAdmin`, checking that `projectId` is a project in the caller's
      org — the action is the trust boundary, not the form.

### Phase B — one resolver, with the boundary

- [x] **B1.** `ApiKeyGuard` puts `knowledgeScope` into `ApiContext`, optional, with
      "absent means no key boundary" written down where `SessionAuthService` can
      be read alongside it. Guard spec updated.
- [x] **B2.** `AssistantScopeService` in `apps/api` implementing the table above,
      built on `scopeRequiresProject`, with a unit test per row and one for the
      scope-less context.
- [x] **B3.** `ThreadsService` uses it instead of its private
      `resolveAssistantId`. The 400 → 403 and body-first → key-first changes land
      here; `threads.service.spec.ts` asserts the new contract rather than edits
      around it.

### Phase C — `assistant_id` becomes optional

- [x] **C1.** `/v1/chat/completions`: optional in the DTO, resolved through the
      service; the project lookup and its instructions become conditional
      (`mergeProjectInstruction` already accepts null).
- [x] **C2.** Widen the `projectId: string` parameters that assume an assistant —
      `LoadMcpToolsParams` and `PersistApiThreadService.createApiThread` — to
      `string | null`. `AiUsageService.track` already handles a missing project.
- [x] **C3.** The same for `/v1/chat` and `/v1/search`, through the same service.
      A knowledge-base key can now reach every endpoint.

### Phase D — the boundary covers the rest of the key's reach

Without this phase the boundary is chat-only, and the argument used to reject a
"scope is just a default" design — that an integrator handed a scoped key can
still read every other assistant — would still be true of
[`assistants.controller.ts`](../../apps/api/src/assistants/assistants.controller.ts)
and [`files.controller.ts`](../../apps/api/src/files/files.controller.ts). Both
are `ApiKeyGuard` and both are org-wide today.

- [x] **D1.** `/v1/assistants` list/retrieve/update/delete respect the key's
      scope: an assistant-scoped key sees and touches its own assistant only.
- [x] **D2.** `/v1/files` the same, on top of A0's org clause: an assistant-scoped
      key lists that assistant's files, a knowledge-base key lists the files with
      no project.

### Phase E — the panel, and saying so

- [x] **E1.** Key-creation form: scope choice (knowledge base / a specific
      assistant) plus an assistant select, with copy saying what each reaches,
      and the scope shown in the key list. Component test.
- [x] **E2.** Swagger on all four DTOs: the field is an override the key must
      agree with, and a mismatch is a 403. `create-thread.dto.ts`'s current text
      ("Defaults to the API key project") becomes wrong under key-first
      precedence and is rewritten, not appended to.
- [x] **E3.** A line in [`docs/changelog-notes.md`](../changelog-notes.md).
- [x] **E4.** Extended A0's
      `a-tenant-filter-that-only-works-when-an-optional-value-is-set.md` rather
      than writing a near-duplicate, as `lessons.md` asks: the leak was one half
      of that column, and the fallback nothing ever reached — which made a scope
      look implemented — is the other.
- [ ] **E5.** _(hand-off, other repository.)_ Note for `ragen-docs`: the endpoints, what each key scope reaches,
      and the MCP-connector asymmetry.

## Testing

- **Unit (`apps/api`)** — `AssistantScopeService`, one case per row of the table,
  including the deleted-project row and the scope-less `ApiContext`. This file is
  the contract.
- **Unit (`apps/api`)** — `ApiKeyGuard` carrying the scope; each service calling
  the resolver instead of its own lookup; `FilesService.list`/`get` refusing to
  return another organization's rows (A0, and it stays green through D2).
- **Unit (`apps/web`)** — `createApiKeyCommand`'s invariant and its `MODEL_ONLY`
  rejection; the server action's org check.
- **Component (`apps/web`)** — the creation form: an assistant choice submits a
  `projectId`, a knowledge-base choice submits none.
- **E2E (`p0-*`)** — `p0-28-api-key-scope`: the dialog offers the scope, defaults
  to the knowledge base, and reveals an assistant picker filled from the seeded
  org. Only `smoke-*` and `p0-*` gate a PR, so the surface that must not break
  belongs in this tier. **Creating a key is deliberately not exercised**, which
  is narrower than this section first claimed: `createApiKeyCommand` writes the
  secret to ragen-token-vault on :3100, which the suite does not run, so that
  test would fail for a setup reason rather than a code one — the failure mode
  `ragen-e2e-triage` exists to untangle. The write path is covered by the
  command's and the form's unit tests. The API matrix stays in Nest unit tests;
  no e2e harness speaks to `apps/api`.
- **Manual, once** — point n8n's OpenAI node at the API with a scoped key and
  complete a turn. It is the reason this exists and nothing here covers a
  third-party client.

## Rollout and rollback

- Additive migration with a default; `prisma migrate deploy` runs ahead of the
  app as usual. No feature flag — the behaviour change is the feature, and a flag
  would mean maintaining both contracts across four endpoints.
- **Demo:** existing keys become `KNOWLEDGE_BASE` and will 403 on `assistant_id`.
  Recreate them from the panel with an explicit scope as part of the deploy, and
  check the embedded chatbot's key first — it is the one most likely to be
  sending `assistant_id` today.
- **Rollback:** revert the PR. The column is additive and unread by the reverted
  code, so it can stay; dropping it is a follow-up migration, not a rollback step.
