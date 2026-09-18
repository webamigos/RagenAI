# apps/api, apps/mcp and ragen-sdk-ts against a prepared corpus

**Date:** 2026-09-18 · **Environment:** `scripts/test-env/` (offline, stub model
provider) · **Corpus:** five markdown documents, four Polish and one English

## What was done

A full local stack — Postgres 16, Redis, Qdrant 1.17, ragen-token-vault,
apps/api, apps/worker, apps/mcp — plus a corpus of five documents uploaded
through the public API and ingested by the worker into Qdrant (12 chunks, dense
384 + sparse). Then three suites, one per surface, each asserting that an answer
carries a fact that exists only in one specific document.

| Suite                                                                                   | Result    |
| --------------------------------------------------------------------------------------- | --------- |
| `test-api.mjs` — `/v1/search`, `/v1/chat/completions` streamed and not, auth            | **17/17** |
| `test-mcp.mjs` — MCP over HTTP-stream: tool discovery, all three tools, auth            | **11/11** |
| `test-sdk.mjs` — SDK 0.3.0 built from source: files, assistants, both chat APIs, errors | **12/13** |
| `ragen-sdk-ts` own unit tests (`vitest run`)                                            | **47/47** |

The one SDK failure is defect **F1** below, left failing on purpose.

### What the environment does and does not prove

There is no egress to Azure, Bedrock, Vertex, Scaleway or OpenAI from this
machine, and no provider credentials. Every model id is routed to a local
OpenAI-compatible stub (`scripts/test-env/stub-llm-server.mjs`): hashed
bag-of-words embeddings, and a chat model that answers by extracting the
sentences of the retrieved `<chunk>` elements that overlap the question.

So these results speak to the **plumbing**: ingest, chunking, the Qdrant
round-trip, hybrid retrieval, the access filters, the prompt assembly, the
streaming envelope, API-key auth through the vault, the MCP transport and the
SDK's wire handling. Because the stub can only answer out of the retrieved
context, a passing case does mean retrieval supplied the right source. It says
**nothing** about answer quality with a real model — that needs
`apps/web/evals` and a measurement run (ADR-20).

---

## Findings

### F1 — A document ingested through the public API is invisible to chat — FIXED

**Severity: high.** Upload a file via `POST /v1/files`, wait until the API
reports `status: processed`, then ask about it through `/v1/chat` or
`/v1/chat/completions`: the assistant does not have it. `/v1/search` returns it
correctly for the same key and the same query.

Reproduced from a clean ingest:

```
uploaded file id: fd5b9115-…      status: processed
qdrant points for file: 2         accessible_by = None   (both)

/v1/search  → PROBE9911 in context: True
/v1/chat    → PROBE9911 in answer:  False

… after `apps/web/src/scripts/backfill-accessible-by.ts` …

/v1/chat    → PROBE9911 in answer:  True
```

Two causes compound:

1. **The chat path never resolves the caller's membership scope.**
   `chat-completions.service.ts` calls `initializeRagChain({ orgId, userId,
projectId, … })` with no `scope` and no `userTeamIds`, so
   `initializeRagChain` applies its own default, `scope = 'member'`.
   `buildMetadataFilter` then adds a `metadata.accessible_by` condition.
   `search.service.ts` does resolve it — `this.folders.getMembershipContext(...)`
   — and its comment names this exact failure ("Without this,
   buildRetrievalContext defaults to scope 'member' and no team ids … documents
   shared with the caller's team are silently missing from results"). The chat
   surfaces did not get the same treatment.

2. **Ingest never writes `metadata.accessible_by`.** The worker's
   `ensureCollection` creates a payload _index_ on the field
   (`apps/worker/src/services/qdrant.ts`), but nothing writes a _value_. The
   only writers are apps/web's `sync-vector-permissions-command` and the
   one-time `backfill-accessible-by` script, neither of which the apps/api
   upload path calls.

Either alone is survivable: with (2) fixed, an owner at `member` scope would
still match `org:`/`user:`; with (1) fixed, an owner resolves to
`organization` scope and the condition is skipped. Together they mean the
public API can ingest a document and then answer "I don't know" about it.

The `accessible_by` gap also makes the access-control filter vacuous in the
other direction — a condition that matches nothing is not a permission check —
so this is worth treating as a correctness issue in `docs/knowledge-base.md`'s
model, not only a retrieval bug.

**The fix**, in three parts:

- `ChatCompletionsService` and `ChatService` now resolve
  `FoldersService.getMembershipContext()` and pass `scope` / `userTeamIds`,
  exactly as `SearchService` already did.
- `prepareMetadata` takes `accessibleBy` as a **required** field, and the three
  handlers that write vector points compute it first through a new
  `computeFileAccessPrincipals` activity. Required rather than optional so a
  fourth write path is a compile error, not a silent gap.
- The rule itself moved to `computeAccessiblePrincipals` in
  `@ragenai/rag-core`; apps/web's and apps/api's copies now delegate to it.

Extracting it surfaced a second defect the two copies shared: both still keyed
org-wide sharing off a **null owner**, which is what the `is_org_wide` migration
(20260909180000) exists to stop meaning. So a file whose owner had been deleted
was published to the whole organization (the FK is `ON DELETE SET NULL`), and a
file deliberately shared with the organization reached nobody but its owner,
because `isOrgWide` was never read. The shared rule reads the flag, and a
lookup that finds no file now yields no principals instead of `['org:<id>']` —
an access boundary fails closed.

`tests/architecture/every-ingest-path-writes-accessible-by.test.ts` holds all of
it.

### F2 — An unroutable model takes the whole API process down — FIXED

**Severity: high (denial of service).** Any authenticated caller can kill
apps/api with one request:

```
POST /v1/chat/completions  {"model":"model-with-no-route", …}
→ connection dropped, process exits
```

`LlmGateway.route` throws `UnknownModelError`; the AI SDK's `streamText`
produces no output and throws `AI_NoOutputGeneratedError` from a
`TransformStream` flush callback, outside any request-scoped `try/catch`, so it
surfaces as an unhandled rejection and Node exits. Nest's `ApiExceptionFilter`
never sees it.

The same crash is reachable without a hostile caller: it is what happens when
`OrganizationSettings.model` (or its `gemini-3-flash-preview` fallback) has no
entry in `routes.yaml` — a plausible state for a self-hosted install that
trimmed the route table. `npm run gateway:preflight -- --probe` catches the
misconfiguration, but nothing makes the running service survive it.

Worth noting alongside: the rephrase stage of the same chain handles an
unroutable model correctly — it logs `Rephrase-and-expand failed, falling back
to raw input question` and carries on. Only the answer model is fatal.

**The fix**, in two layers.

`initializeRagChain` calls `assertModelIsRoutable()` before it builds anything —
a synchronous lookup in the loaded route table. An unroutable model is now a 400
naming the model and listing the ones this installation serves.

Re-reading the diff adversarially found a **second trigger the answer-model
check did not cover**: the *embeddings* model. `createEmbeddingsInstance`
returns a promise (`resolveEmbeddingModel` is async), so an unroutable
`EMBEDDINGS_MODEL` leaves a rejection nothing awaits once the request has failed
for another reason — and Node exits on it *after* the request was correctly
answered with a 500, which is what made it hard to attribute. Confirmed
pre-existing by checking out `apps/api` at the pre-fix commit and reproducing
it there. Both models are checked now.

The deeper issue is that this process creates promises that outlive the request
that made them, so the next one nobody has hit yet would do the same. `main.ts`
installs an `unhandledRejection` handler that logs the reason at error level and
keeps serving. Proven by A/B rather than assumed: with the routability check
disabled and the handler in place, the same configuration that killed the
baseline produced

```
ERROR [Bootstrap] Unhandled promise rejection — the service is staying up,
but this is a defect: UnknownModelError: no route for model "embed-model-with-no-route"
```

and `/v1/healthcheck` answered 200 afterwards. The handler is a floor, not a
cure: it logs every rejection as a defect rather than hiding it.

### F3 — Chat requires an OpenAI key even when moderation is off — FIXED

**Severity: medium.** `initialize-basic-rag.service.ts` calls
`createModerationInstance()` unconditionally, and that throws when neither
`OPENAI_MODERATION_KEY` nor `OPENAI_API_KEY` is set. Moderation itself is off by
default — `shouldModerate()` in `chain.ts` returns `false` unless
`MODERATION_ENABLED=1` — so the instance is built and then never used.

Effect: a self-hosted install with, say, only Scaleway credentials gets HTTP 500
on **every** chat request, with `Cannot create moderation instance: set
OPENAI_MODERATION_KEY or OPENAI_API_KEY` in the log and nothing in the response
pointing at it.

**The fix**: `BaseChatChainModels.contentModerator` is a factory
(`() => ModerationInstance`) that the chain calls only inside the
`shouldModerate()` branch, so the key is required by the code path that
actually calls the API. Verified by deleting `OPENAI_API_KEY` from the
environment entirely and running a chat request: HTTP 200.

### F4 — `PORT` in the root `.env.local` follows every app — FIXED

**Severity: low, but it costs a confusing hour.** The root `.env.local` is
shared by all five apps. `PORT=3001` for apps/api also reached apps/mcp, whose
schema defaults to 3300, and it died with `EADDRINUSE` on apps/api's port. The
same trap is waiting for apps/admin and apps/worker.

**The fix**: apps/api reads `RAGEN_API_PORT` before `PORT`, apps/mcp reads
`RAGEN_MCP_PORT` before `PORT`, and apps/web pins `--port 3000` the way
apps/admin already pinned 3200. Bare `PORT` still works and still wins over the
default, because that is what a single-container host injects. `.env.example`
carries the port table and the rule, and
`tests/architecture/an-app-port-is-not-the-shared-one.test.ts` enforces it.

Verified by putting `PORT=3001` back in the shared root file: both services
came up on their own ports.

**The token vault needs no port change.** Its 3100 collides with nothing
(web 3000, api 3001, vault 3100, admin 3200, mcp 3300, docs 3400), and it reads
its own `.env.local` in its own repository rather than this one's, so the shared
file never reaches it. It does share the same weakness — it reads a bare `PORT`
— and separately defaults `HOST` to `::`, which fails outright where IPv6 is
unavailable (it did here, and needed `HOST=127.0.0.1`). Both are one-line
changes in `webamigos/ragen-token-vault`, out of scope for this repository.

### F5 — The worker's collection cache never invalidates

**Severity: low.** `verifiedCollections` in `apps/worker/src/services/qdrant.ts`
is a process-lifetime `Set`. If a collection disappears after the worker has
seen it, `ensureCollection` skips creation forever and every subsequent ingest
fails on `deleteDocumentVectors` with `Collection … doesn't exist`, until the
worker is restarted. Only reachable when a collection is dropped out of band,
which is why it is listed last — but the failure mode (permanent, silent until
someone reads the worker log) is worse than the cause.

---

## Smaller observations

- `tenant-scope-guard` warns on `Thread.findUniqueOrThrow`,
  `Thread.updateMany` and `AiUsage.create` on every chat request. Expected per
  `docs/prisma.md` (it warns, it does not block), but these three are on the
  hot path and make the warning channel noisy enough to hide a real one.
- `AiPricing` logs `No pricing found for provider="litellm" model=…` per call
  for any model absent from the pricing table, at WARN. For a self-hosted model
  that is normal operation, not a warning.
- `deleteDocumentVectors` treats a missing collection as a hard failure rather
  than a no-op — deleting vectors that are already gone is the outcome asked
  for.

## Reproducing

`scripts/test-env/README.md`. The three suites are `test-api.mjs`,
`test-mcp.mjs` and `test-sdk.mjs` in the same directory; each prints a
PASS/FAIL line per case and exits non-zero on failure.
