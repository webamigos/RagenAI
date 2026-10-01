---
title: The model chooses which retrieved sections to read, and how much around each
status: approved
areas: [rag]
adrs: [12, 14, 15, 19, 20, 33, 37, 50]
---

# The model chooses which retrieved sections to read, and how much around each

## TLDR

After hybrid search and fusion, a model reads the candidate sections side by
side and keeps the ones that answer the question. For each kept section, a
second, small call decides whether to add its neighbouring chunks — a known
alternative to cross-encoder reranking. The non-obvious part is that none of it
can be judged today: `rag-benchmark` grades answers, not retrieval, and has
never run with reranking off, so **the first phase is a measurement, and the
reranker is only replaced if the measurement says so.**

## Decisions

Answered 2026-09-29, each recommendation accepted.

- **D1 (was Q1). One spec.** Expansion ships as its own phase, first without
  a model, and is useful without selection.
- **D2 (was Q2). A third option, not a replacement.** Selection sits beside
  the reranker behind its own feature key. The reranker is removed only if
  Phase A and Phase E show it adds nothing over selection.
- **D3 (was Q3). A dedicated `SELECTION_MODEL`**, defaulting to the rephrase
  model, resolved through the route table like every other model.
- **D4 (was Q4). Built once, in `packages/rag-core`.** Both chains call it,
  and an architecture test checks that they do.
- **D5 (was Q5). No latency ceiling up front.** Phase A records the latency
  each step adds (p50 and p95); the ceiling is decided on those numbers in
  Phase E.
- **D6 (was Q6). The measurement is its own PR, shared with
  [contextual chunks](2026-09-29-contextual-chunks.md).** It lands first;
  each spec then adds its own arms.

## Problem

- **The reranker has never been shown to help.** On 2026-09-04, reranking
  off, Scaleway and Cohere all scored 11/12 (`docs/rag-roadmap-status.md`:
  "neither eval suite can currently tell them apart"). Every `rag-benchmark`
  result since was run with reranking on, so there is no off run to compare
  with.
- **The default reranker is not a cross-encoder.** Scaleway's `/v1/rerank`
  runs `qwen3-embedding-8b`, which the code itself calls a bi-encoder
  (`apps/web/src/libs/reranker/scaleway-reranker.ts`). ADR-12's case for
  reranking was cross-encoder quality.
- **The reranker sees less than a person would.** It is sent only the
  standalone question and the bare chunk text: no title, no section, and not
  the second query variant (`apps/web/src/libs/chains/basic-rag/operations.ts`).
- **ADR-19 renders sections but never widens them.** A chunk reaches the model
  exactly as retrieved. The neighbour pointers written at ingest
  (`previous_chunk_id`, `next_chunk_id` in
  `apps/worker/src/activities/embeddings/prepare-metadata.ts`) have no reader,
  so an answer that spans a chunk boundary has half its evidence missing.
- **`rag-benchmark` cannot measure any of this.**
  - It grades the answer, with assertions and a judge.
  - It does not record which chunks reached the model; the stream carries
    only the cited file IDs (`apps/web/evals/rag-benchmark/lib/arms.ts`).
  - Its report stamps the stack from the runner's environment, not the
    server's (`apps/web/evals/rag-benchmark/run.ts`).

## Out of scope

- Changing hybrid search, fusion or multi-query (ADR-14, ADR-15).
- Contextual chunk text at ingest. That is the sibling spec,
  [contextual chunks](2026-09-29-contextual-chunks.md), which shares Phase A.
- Agentic, multi-step search: several retrieval rounds decided by the model.
- Showing the user which sections were dropped. Citations stay what they are.
- The public API's own chain beyond calling the same shared function. Its
  duplication with apps/web is older than this spec; D4 stops it growing but
  does not remove it.

## Design notes

How the pattern is usually built. This is a starting point for the design,
to be checked against our own numbers:

- **Selection.** Fused candidates are trimmed to a token budget, wider than
  what finally reaches the answer model, because fusion ranks without reading
  the content and relevant sections land just below the cut. The model sees
  each section's title, metadata and a few chunks, and returns only the IDs
  to keep, up to a fixed maximum. The prompt leans towards keeping a section
  when in doubt.
- **Expansion.** One parallel call per kept section, with its neighbours
  visible. The model returns one digit:
  - drop the section, for "same topic, wrong subject";
  - keep the main chunk only;
  - add the adjacent chunks;
  - add a wider window.
- **Cheap failures.** Every step falls back: selection to fusion order,
  expansion to the unexpanded section. Each call has a timeout, and
  reasoning is off.

## Proposed solution

### Where it sits in the chain

```
rephrase + variants → hybrid search per query → dedupe
  → [reranker | selection | fusion order]        (one of three, per org)
  → expansion (optional, per org)
  → combineDocuments (ADR-19)
```

**Selection replaces the reranker's slot; it never runs after it.** Running
both would pay twice for the same decision and make the measurement
unattributable. Expansion runs after whichever of the three chose the
sections.

### Shared code (D4)

`packages/rag-core/src/selection/` holds the logic as plain functions with
injected I/O, so both chains call the same code and tests need no stack:

- **`selectSections({ question, candidates, maxKeep, generate, timeoutMs })`**
  - Builds one prompt listing each candidate:
    - an integer ID;
    - the file name;
    - `section_path` when present;
    - the chunk text, capped per candidate.
  - Parses a list of integers, dropping out-of-range IDs and duplicates.
  - Stops at `maxKeep`.
  - On a timeout, an empty answer or an unparseable one, returns the
    candidates in fusion order, truncated to `maxKeep`. It never throws.
- **`decideExpansion({ question, hit, neighbours, generate, timeoutMs })`**
  - One digit: 0 drop, 1 hit only, 2 ±1 chunk, 3 ±2 chunks.
  - Reads the last digit 0–3 in the answer, so a model that thinks aloud
    still parses.
  - Falls back to 1. When there are no neighbours, 2 and 3 are downgraded
    to 1.
- **`mergeExpanded(sections)`**
  - Joins adjacent chunks of one file into one rendered section.
  - Trims the overlap the splitter left between them (chunks overlap by
    about 200 characters) by matching the longest suffix of one against the
    prefix of the next.
  - Merges two kept sections that overlap after expansion, so the same
    text is not rendered twice.
- **`generate`** is the caller's model call. rag-core imports no provider
  SDK and no Prisma, as it does today.

An architecture test, `tests/architecture/both-rag-chains-select-through-rag-core.test.ts`,
fails if either chain calls selection or expansion code that is not
imported from `@ragenai/rag-core`. It is the same shape as
`both-rag-chains-gate-on-the-same-sources.test.ts`.

### Fetching neighbours

**Neighbours are looked up by position, not by the stored pointers.**
`previous_chunk_id` and `next_chunk_id` are array positions within a file's
chunk list (`prepare-metadata.ts`), and they are exactly `chunk_index − 2`
and `chunk_index`. So the lookup is by `file_id` plus a `chunk_index` range,
through a new `getChunksByIndex(orgId, fileId, indexes, filter)` on
`VectorStoreClient`.

- **The filter is the one the search used** (`organization_id`,
  `accessible_by`, `project_id`), not only the file. A neighbour is in the
  same file that already passed the filter, so this is defence in depth
  rather than the access check itself.
- **Neighbours are the same kind of chunk.** A prose hit expands only into
  prose, never into:
  - the summary chunk, which is `chunk_index` 1;
  - table chunks, which are appended after the prose (`split-documents.ts`).
- **`chunk_index` gets an integer payload index.** It is added in the
  worker's collection setup, which is idempotent, and in a one-off script
  for existing collections. Without it the range filter scans the file's
  points, which is correct but slower.
- **In `dual_content` mode, fetched neighbours go through the same
  decode wrapper as search results**
  (`app/api/threads/services/decode-dual-content-chunks.ts`), so the answer
  model sees one representation throughout.

**The expansion budget is fixed.** It is at most `maxDocumentsToRetrieve × 3`
chunks in total, so a turn can never render more than three times today's
context. Sections are expanded in rank order until the budget runs out.

### Deterministic expansion first

Phase B ships expansion **without a model**: every kept hit gets ±1 prose
neighbour, within the budget. Only if Phase B's numbers show that fixed
widening adds noise does Phase C add `decideExpansion`. This is the cheap arm
to beat, the same reasoning as the free prefix in the sibling spec.

### Model and cost (D3)

- **Env and route.** `SELECTION_MODEL` is declared once in the `@ragenai/env`
  fragment that already holds `REPHRASE_MODEL` (ADR-37), and it defaults to
  the same value. It resolves through `infra/llm-gateway/routes.yaml`, and
  `npm run gateway:preflight -- --probe` covers it like any configured model.
- **Model options.** Temperature 0, and reasoning off where the provider
  accepts the option.
- **Usage accounting.**
  - The calls are recorded as a new `AiUsageStep.SECTION_SELECTION` (a
    migration adding one enum value).
  - The step is shown on the AI-usage page;
    `every-ai-usage-step-is-on-the-page.test.ts` enforces it.
  - It counts toward the token and cost ceilings, not the message ceiling,
    which counts only `CHAT_COMPLETION`.
- **Org restrictions.** `OrganizationSettings.allowedModels` restricts the
  chat model, not this one, in the same way it does not restrict the
  rephrase model today. The spec keeps that parity instead of inventing a
  rule for one of the two.

### Switches

There are two feature keys, both defaulting to `false` (ADR-50), declared in
`packages/platform-contracts` and set per organization in apps/admin:

- **`sectionSelection`** puts selection in the reranker's slot. When it is on,
  the reranker does not run for that organization.
- **`contextExpansion`** turns on expansion: deterministic in Phase B, and
  decided by the model once Phase C lands.

Each phase behind a disabled key is a `chore` (ADR-50). Phase E is the one
`feat`, the one that changes a default.

### Measurement (Phase A, shared)

The chain emits one more stream frame, `retrieval`, next to `citations`.

- **Contents:**
  - the `(file_id, chunk_index)` pairs that reached the answer model, in
    rendered order;
  - the post-retrieval step that ran: `off`, `reranker:<provider>` or
    `selection`;
  - whether multi-query ran;
  - the latency each step added.
- **Why it is safe:** it carries no text, only positions within files the
  user already sees in the sources.
- **What it gives the harness:**
  - **Evidence recall.** The harness reads those chunks back from Qdrant and
    counts whether the text each question's assertions look for is inside
    the context the model got. This separates "retrieval missed it" from
    "the model ignored it", which the pass rate alone cannot do.
  - **Server-side stamping.** The report stamps the stack from this frame,
    not from the runner's environment.

The arms for this spec are reranking off, reranking with Scaleway, and
reranking with Cohere (when credentials exist). Each runs on both corpora,
`kolej` and `tabele`, three repetitions each, per the `ragen-rag-change`
skill. Phases B–D add their own arms to the same harness.

## Core surfaces touched

| Surface | Change | What catches a mistake |
| --- | --- | --- |
| `packages/rag-core` | new `selection/` module, `getChunksByIndex` contract | package tests; web and api builds |
| `packages/platform-contracts` | two feature keys | `feature-keys-agree.test.ts` |
| `packages/env` | `SELECTION_MODEL` in the rephrase fragment | env fragment tests |
| `prisma/schema.prisma` | `AiUsageStep.SECTION_SELECTION` | migration + `npm run verify`; `every-ai-usage-step-is-on-the-page.test.ts` |
| both RAG chains | call the shared functions | new architecture test |
| `infra/llm-gateway/routes.yaml` | none if the default model is kept | `gateway:preflight --probe` |
| tenant scoping | neighbour lookup reuses the search filter | unit test on the filter it builds |

## Data model

- **One enum value**, `AiUsageStep.SECTION_SELECTION`, with a migration that
  only adds it. Existing rows are untouched.
- **A Qdrant payload index on `chunk_index`.** It changes no stored
  point: existing points gain the index, not new fields.
- **Nothing new is written per chunk.** The spec reads what ingest already
  stores.

## Failure modes

- **The selection model is down or slow.** Past the timeout the chain uses
  fusion order and records the fallback in the `retrieval` frame. The turn is
  not failed.
- **It returns garbage, IDs out of range, or nothing.** The same fallback
  applies. A partly valid list keeps its valid IDs.
- **It drops everything.** An empty selection is treated as failure, not
  as "no knowledge": the chain falls back to fusion order. Refusing because a
  cheap model returned `[]` would be a new way to answer "I don't know".
- **An expansion call fails.** The hit is rendered unexpanded.
- **The neighbour lookup fails.** The same.
- **A hostile document tells the model to select it.** The candidate texts
  are wrapped as untrusted, like `<project_knowledge trust="untrusted">`.
  The worst case is that a chunk which already passed the access filter gets
  kept, which is the same exposure as today.
- **A neighbour chunk was deleted** between search and lookup (a re-index
  races the turn). It is simply missing, and the hit renders alone.
- **The context budget runs out.** Later hits stay unexpanded rather than
  earlier ones being truncated.

## Phases

Each phase leaves the application working, with every new path behind a key
defaulting to `false`.

### Phase A — measure what retrieval hands the model (shared)

- [x] **A1.** The `retrieval` stream frame in both chains: rendered chunk
  positions, the post-retrieval step, multi-query, and step latencies. Unit
  tests on the frame builder, and a chain test that the frame lists exactly
  what `combineDocuments` rendered.

  *Done.* A `retrieval` event already existed (sources, `chunkCount`,
  `durationMs`); it gained a `trace` rather than a second frame:
  `chunks` as `(fileId, chunkIndex)` in rendered order, `postRetrieval`
  (`fusion` or `reranker:<provider>`), `queryCount`, and
  `timings { searchMs, rerankMs, rephraseMs }`. Mapped field by field in
  `toRetrievalEvent`, so no text can ride along. apps/web's chain only:
  apps/api's OpenAI-compatible endpoint streams no retrieval frame at all,
  and the harness measures through apps/web — the shared code of Phases B–D
  (D4) is what keeps the two chains equal, not this frame.
- [x] **A2.** `rag-benchmark` parses the frame and reports **evidence recall**
  (per question and per shape) next to the pass rate. It stamps the stack
  from the frame. Unit tests on the parser and on the recall computation.

  *Done.* `lib/evidence.ts`: the trace's chunks are read back from Qdrant and
  searched for the assertions' needles with the assertions' own matching;
  per case in the JSON (`evidence`, `retrievalTrace`), and a report table by
  language and question type. The stack table gains the server-reported
  post-retrieval step beside the harness's reading of the settings.
- [x] **A3.** Run the baseline: reranking off / Scaleway / Cohere, on `kolej`
  and `tabele`, three repetitions each. Commit the results under
  `apps/web/evals/rag-benchmark/results/` with a write-up, and record in
  this spec whether the reranker moves evidence recall at all.

  *Done 2026-10-01* ([write-up](../../apps/web/evals/rag-benchmark/results/2026-10-01-a3-reranker-baseline.md);
  Cohere not run, no credentials). **On `kolej` the reranker does not move
  evidence recall at all**: 21/20/20 of 26 in both arms, and pass medians
  of 18 vs 17 of 24, which is noise. **On `tabele` it does**: 14 vs 8 of 18,
  and pass medians of 10/17 vs 7/18 (two off-arm cases regraded by hand,
  see the write-up). That gain belongs to the widened pool
  (`× 3`) and the reranker's order together. Selection cuts the same pool,
  so D2's comparison is like for like. The remaining miss is cross-lingual
  evidence (2–3 of 8 on `kolej`, in every arm).

### Phase B — deterministic expansion

- [x] **B1.** `chunk_index` payload index: added in the worker's collection
  setup, plus a one-off script for existing collections.

  *Done.* `PAYLOAD_INDEXES` in `packages/rag-core` is now the one list the
  worker, apps/web and apps/api create collections with (each had its own),
  with `metadata.chunk_index` as an integer index. The worker's
  `ensurePayloadIndexes` reads a collection's `payload_schema` and creates
  what is missing, on existing collections too, the first time it writes to
  one after a deploy; `scripts/ensure-qdrant-payload-indexes.ts [--dry-run]`
  does it for every collection at once. Locally, 10 of 10 collections lacked
  only `chunk_index`.
- [x] **B2.** `getChunksByIndex` on `VectorStoreClient` (Qdrant
  implementation in apps/web and apps/api). It applies the search filter and
  goes through the dual-content decode wrapper. Tests cover the filter,
  same-kind neighbours, and a missing neighbour.

  *Done.* The filter is built once, by `chunksByIndexFilter` in
  `packages/rag-core/src/selection/`: the search filter nested whole (so a
  knowledge-base `should` keeps its meaning), plus `organization_id`,
  `file_id` and `chunk_index` in the positions, and `chunk_type` not
  `summary` or `table`. Both apps' Qdrant clients scroll with it and return
  one chunk per position in file order (`orderByChunkIndex`). The method is
  optional on the interface, since only Qdrant is supported (ADR-31). Both
  dual-content wrappers decode what it returns, and refuse an organization
  other than the one they were built for, because they decode with that
  organization's key. Nothing calls it yet; B3 does.
- [x] **B3.** `mergeExpanded` in rag-core, with overlap trimming, plus the
  `contextExpansion` key. Behind it, each kept hit gets ±1 prose neighbour
  within the budget. Architecture test for both chains.

  *Done.* `packages/rag-core/src/selection/expansion.ts`: `planExpansion`
  spends the budget (`maxDocuments × 3` chunks) on hits in rank order and
  never fetches a position that is already a hit; `expandHits` does one
  `getChunksByIndex` per file, in parallel, and keeps only what it asked for;
  `mergeExpanded` joins a section in file order, trims the splitter's overlap
  (`joinTrimmingOverlap`, 20–1000 characters, else a newline and nothing
  dropped), and folds two sections of one file that touch into the
  better-ranked one. A section keeps its hit's metadata and gains
  `expanded_chunk_indexes`. Both chains call it after the reranker's cut, so
  the reranker still chooses which hits are kept; a failed lookup renders the
  hit alone. The key is read per turn (`isFeatureEnabledQuery` in apps/web,
  `SubscriptionsService` in apps/api) and is off by default. apps/web's
  `retrieval` trace lists every position a widened section covers, plus
  `expansion` (`off` / `neighbours`) and `timings.expandMs`; rag-benchmark
  stamps the arm as `<step> + neighbours`, so B4 can tell its two arms apart.
  `tests/architecture/both-rag-chains-expand-through-rag-core.test.ts` holds
  both chains to rag-core's `expandHits`. apps/api's search endpoint is not a
  chain and does not expand.
- [x] **B4.** Measure: B3 on vs off, on both corpora, three repetitions.
  Record it here.

  *Done 2026-10-01* ([write-up](../../apps/web/evals/rag-benchmark/results/2026-10-01-b4-context-expansion.md)).
  **`kolej`:** every run with expansion beat every run without it: 19–21
  vs 17–18 of 24. Evidence rose from 20–21 to 23–24 of 26, and
  cross-lingual evidence from 2–3 to 5–6 of 8. **`tabele`:** within noise,
  10–12 vs 8–11 of 18. Cost: ~9 ms at p50 (18 ms at p95), and 7–11 chunk
  positions per turn instead of 4. Fixed widening does not add noise, so
  Phase C is not needed.

### Phase C — expansion decided by the model

- [ ] **C1.** `decideExpansion` in rag-core and `SELECTION_MODEL` in the env
  fragment. Under `contextExpansion`, the model's digit replaces the fixed ±1
  **only if B4 showed fixed widening adds noise**; otherwise this phase
  is recorded as not needed and skipped.

  *Not needed (B4, 2026-10-01): fixed ±1 regressed no run.* `SELECTION_MODEL`
  ships with D1 instead, which needs it.
- [ ] **C2.** `AiUsageStep.SECTION_SELECTION`, with its migration and its
  place on the AI-usage page.
- [ ] **C3.** Measure C1 against B3. *Not needed, with C1.*

### Phase D — selection

- [ ] **D1.** `selectSections` in rag-core, wired into both chains in the
  reranker's slot, behind `sectionSelection`. It uses the widened pool
  (`maxDocuments × 3`, as the reranker does). Tests cover the parser, the
  fallback paths and the prompt's untrusted wrapper.
- [ ] **D2.** Measure: selection vs the best Phase A arm, with and without
  expansion.

### Phase E — decide

- [ ] **E1.** On A3, B4, C3 and D2, decide two things:
  - which post-retrieval step is the default, and whether expansion is on by
    default;
  - the latency ceiling (D5).

  Then flip the defaults (`feat`, plus a changelog line) or record why not.
  If the reranker adds nothing over selection, open a separate spec to
  remove it.

## Testing

- **Unit (rag-core):**
  - the selection prompt builder, including the untrusted wrapper;
  - the ID parser: out of range, duplicates, prose around the list, empty;
  - the digit parser;
  - overlap trimming and section merging;
  - every fallback path.
- **Unit (apps):**
  - the `retrieval` frame builder;
  - the filter `getChunksByIndex` builds, with the organization and access
    filters present;
  - the dual-content decode applied to neighbours.
- **Architecture:** both chains import selection and expansion from
  `@ragenai/rag-core`.
- **Evals:** the Phase A harness is the acceptance test; no phase changes a
  default without its numbers committed. Evals do not run in CI, by design.
- **E2E:** none gates this. Every path is behind a key that defaults to
  `false`, and the default chain is unchanged until E1.

## Rollout and rollback

- **Rollout.** Both keys are off by default, and each is turned on per
  organization in apps/admin.
- **Rollback.** Turning a key off restores today's chain on the next turn:
  nothing is stored per chunk, and the payload index is inert.
- **Migrations.** The only one adds an enum value. It stays even if the
  feature is removed, because usage rows would reference it.
