---
title: Ragen Brain — curated knowledge as the product, RAG as an optional consumer
status: draft
areas: [knowledge-base, worker, rag, admin, self-hosting]
adrs: [11, 16, 20, 26, 27, 33, 37, 39, 42, 43, 44, 49]
---

# Ragen Brain — curated knowledge as the product

## TLDR

Brain turns a company's unstructured documents into **curated knowledge**:
knowledge pages that carry an owner, an access level and citations back to the
exact source span, plus the findings nobody currently produces — what is
contradictory, what is missing, what is three years old and whose author has
left. The non-obvious part is that **nothing leaves Brain on its own**: a page
reaches Ragen's knowledge base only when a human approves it, which is what
separates this from a generator of probably-true knowledge.

Brain is not a new application. It ships as `packages/brain-core` plus
`packages/brain-contracts`, with the UI under `apps/web`'s panel and the work
running in `apps/worker` — no new runtime, no new deploy target. Parsing is
already solved by Docling as a companion service, which is why the stack
question ("maybe Python?") is closed.

Research and competitive landscape: [Ragen Brain — research konkurencji i
rekomendacja (2026-09)](https://app.clickup.com/9014546163/docs/8cmy3qk-10174).

## Decisions taken before writing this spec

The gate in [`docs/specs/README.md`](README.md) was run twice. What came back,
because the rest of the spec is unreadable without it:

| #   | Question                                                   | Decision                                                                                                                                        |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | v1's value: compiled wiki or a contradictions/gaps report? | **Compiled wiki.** Findings are a first-class view over the same data, not a separate product.                                                  |
| D2  | Separate product or a module here?                         | **Packages in this monorepo** (`packages/brain-*`). **No new app** — the interface lives in `apps/web`.                                         |
| D3  | `candidates/` + human approval in v1?                      | **Yes, and it is the product.**                                                                                                                 |
| D4  | Name                                                       | **Ragen Brain.** The ragen.ai announcement page already commits to it and to "part of Ragen"; D2 makes that copy true.                          |
| D5  | Where a bundle lives at rest                               | **Postgres is the source of truth**; the bundle (markdown + `graph.json` + manifest) is an export.                                              |
| D6  | How a page reaches Ragen                                   | **Only through human acceptance.** There is no automatic path from Brain into the knowledge base.                                               |
| D7  | Permissions on a page built from several documents         | **Intersection** of the sources' principals. Widened only by a human, explicitly, with a ledger entry. No approved owner → not exported at all. |

D6 is the one that reshapes the integration chapter. An earlier draft treated
export as a pipeline stage with a review step attached; it is the reverse —
review is the product and export is an action a person takes on an approved
page, one page at a time or in a reviewed batch.

## Problem

Ragen retrieves over raw documents. Access is decided per **file**, at upload,
and inherited into `accessible_by` on every chunk by
`computeFileAccessPrincipals`. Nothing in the system ever decides what is
_true_: which of two documents supersedes the other, who owns a statement, when
it was last confirmed, or what the corpus does not contain.

Three consequences, all of them things a customer can point at today:

- **A contradiction is resolved by whichever chunk reranks higher.**
  WikiContradict (IBM, [arXiv:2406.13805](https://arxiv.org/abs/2406.13805) —
  253 human-annotated cases, 5 models, 3500+ judgements) is the evidence that
  the model will not resolve it at answer time either, least of all when the
  conflict is implicit. So it has to be resolved _before_ retrieval, by a
  person. That is the whole product in one sentence.
- **"What is stale and has no owner" is unanswerable.** `UserFile` has an
  `ownerId` that means "who uploaded it", not "who vouches for it", and no
  notion of verification at all.
- **Access is as coarse as the file.** A 60-page employee handbook is one
  permission decision. The fact that section 4 is HR-only and section 9 is
  company-wide has nowhere to live.

Evidence beyond the research doc: `apps/web/src/scripts/backfill-accessible-by.ts`
exists because _no_ ingest path wrote `accessible_by` for months and every
freshly ingested document was unreachable below organization scope. Access that
is inferred rather than decided fails quietly — which is the argument for
deciding it once, in front of a person, at curation time.

## Out of scope

- **Full bitemporality** (Utopia, Graphiti — "true in the world" and "believed
  by the system" as two independent axes). `validFrom` + `supersededBy` on a
  page is the deliberate minimum. Two axes when a customer asks.
- **Graph-expanded retrieval inside Ragen.** `README.md:470` states a knowledge
  graph layer is not planned — _"We would rather improve retrieval we can
  measure than add a stage we cannot."_ The graph stays inside Brain as
  navigation and control. It may enter Ragen's retrieval later only behind an
  eval that beats baseline, per ADR-20 — which honours that statement rather
  than quietly breaking it.
- **Brain writing to Qdrant.** Brain writes Postgres and produces an export;
  the existing ingest path is the only thing that writes vectors. Anything else
  makes "the result is yours, readable without our software" untrue in a way a
  customer's architect will notice.
- **Two-stage curated/raw retrieval** (curated first, source chunks pulled in
  as evidence). v1.1, and it starts as a rerank rule, not a new component.
- **The Ragen → Brain signal stream** (dead knowledge, unanswerable questions,
  chunks retrieved together that contradict each other). v2 — but the event
  shape is worth sketching while the data model is open, so it is named in
  Phase F rather than forgotten.
- **Voice capture of tacit knowledge** (TZ's interview loop). Interesting, and
  a different product.
- **Per-seat pricing.** Two independent market signals say this category is not
  sold per seat. Not a code decision; flagged so it is not assumed.

## Proposed solution

### Shape

```
knowledge base (UserFile, already ingested and parsed)
        │
        ▼  extract: entities / facts / claims + span citations   [worker, LLM]
   KnowledgePage(status = CANDIDATE)  +  KnowledgeEdge  +  KnowledgeFinding
        │
        ▼  REVIEW — a person: merge, set owner, set access, approve or reject
   KnowledgePage(status = APPROVED)   ── every transition appended to KnowledgeDecision
        │
        ├──▶ browse: list · page · graph · findings        (apps/web panel)
        ├──▶ export bundle: markdown + graph.json + manifest   (packages/storage, ZIP / git-ready)
        └──▶ publish to the knowledge base: a UserFile whose text IS the page,
             ingested with predefined chunk boundaries and the curated
             `accessible_by`                                   (existing ingest path)
```

Brain reuses what already exists at every point it can: documents come from
`UserFile` (already parsed by Docling), the work runs as jobs named in
`packages/jobs`, extraction is an LLM call with a Zod schema through the
in-process gateway (ADR-49), and publishing is the ordinary ingest path with
one new input — chunk boundaries it did not compute itself.

### Why not the alternatives

- **Not a separate application or repository.** ADR-32's rule is to measure
  drift before splitting. Brain shares the schema, the tenant guard, the auth
  guards, `platform-contracts` and the job runtime; a split today would
  duplicate all five to save nothing. Revisit if the packaging or the pricing
  model actually diverges.
- **Not files-as-source-of-truth.** The bundle is the promise ("readable
  without us"), not the storage engine. Review is a workflow with concurrent
  actors, an append-only ledger and permission checks; Postgres gives
  transactions, the tenant guard and one query for "what is stale and unowned".
  A git remote as a datastore would be a new operational runtime, which is the
  exact cost the TypeScript decision was made to avoid.
- **Not automatic publication.** D6. A page that reaches retrieval without a
  person having approved it is a model-written document cited as fact — the
  failure the product exists to prevent.
- **Not a graph database.** `graphology` plus Postgres. Neo4j is an export
  target, not a dependency.

### The permission rule, stated once

A page's `accessibleBy` defaults to the **intersection** of its sources'
principals — the narrowest, never the union. A person may widen it, and only a
person, through an action that writes a `KnowledgeDecision` row naming who,
when and from what to what. A page with no approved owner is not exportable and
not publishable: not a flag for the consumer to honour, but the absence of a
row. The default union is a data leak at the first customer with an HR folder,
and nothing in `tests/architecture/` would catch it — so
`brain-export-never-widens-access.test.ts` is part of Phase E, not a follow-up.

## Core surfaces touched

| Surface                                 | Change                                                              | What catches a mistake                                                             |
| --------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                  | five new models, all additive; no existing table altered            | migration + `npm run verify`                                                       |
| `packages/platform-contracts`           | `brain` feature key; `TENANT_SCOPED_MODELS` gains the five models   | package tests, `shared-contracts-are-not-recopied`                                 |
| `packages/brain-contracts` _(new)_      | bundle manifest + page frontmatter Zod schemas                      | package tests; consumers: web, worker                                              |
| `packages/brain-core` _(new)_           | extraction, findings, graph, intersection rule                      | package tests; consumers: web, worker                                              |
| `packages/jobs`                         | four new job names + payloads                                       | `job-payload-enums-match-the-schema`, `worker:test:jobs`                           |
| `apps/worker`                           | four handlers                                                       | worker tests + the BullMQ gate                                                     |
| `src/libs/db/tenant-scope-guard.ts`     | five models added to the covered set                                | warns at runtime; it does **not** block — the `where` clause still has to be right |
| ingest / `accessible_by`                | a new publish path writes it from curation instead of from the file | `every-ingest-path-writes-accessible-by.test.ts`                                   |
| `packages/rag-core` (`vector-metadata`) | **no change in v1** — see below                                     | —                                                                                  |
| citations (`DocumentCitation`)          | **no schema change** — see below                                    | existing e2e                                                                       |
| `packages/create-ragen-app`             | new env var for the extraction model, if one is added               | `create-ragen-app-manifest-is-current`                                             |
| `lint-staged.config.mjs`                | an entry per new workspace                                          | pre-commit, and nothing else                                                       |

**Why rag-core and the citation tables do not change.** A published page is a
`UserFile` like any other, so retrieval, `DocumentCitation`,
`DocumentRetrieval` and the analytics built on them keep working untouched. The
second citation level — "knowledge page _Onboarding_, based on
`regulamin-pracy.pdf` p. 4 §2" — is a render-time lookup: the published file
carries `metadata.brainPageId`, and the renderer joins it to
`KnowledgePageSource`. A `layer` field on the chunk payload only becomes
necessary for two-stage retrieval, which is v1.1. This is the single largest
cost avoided in the whole plan, and it holds _because_ of D6: nothing is
published that a person has not looked at, so the citation does not have to
carry a provenance warning the schema would otherwise have to model.

## Data model

Five additive models. Conventions per AGENTS.md: `Int` autoincrement `id` plus
a `publicId` UUID for URLs, camelCase fields with `@map`, `Timestamptz`.

- **`KnowledgePage`** — `organizationId`, `title`, `slug`, `type`
  (`PROCESS | ENTITY | POLICY | PRODUCT | ROLE`), `content` (markdown),
  `contentHash`, `status` (`CANDIDATE | APPROVED | REJECTED | STALE`),
  `ownerId` (the person who vouches for it — not the uploader), `accessibleBy`
  (`String[]` of `org:` / `user:` / `team:` principals), `validFrom`,
  `supersededById`, `verifyEvery` (ISO-8601 duration), `lastVerifiedAt`,
  `lastVerifiedBy`, `publishedFileId` (the `UserFile` this page was published
  as, null until it is), timestamps.
- **`KnowledgePageSource`** — `pageId`, `fileId`, `span` (e.g. `"p.4 §2"`),
  `hash`. What makes a page auditable; deleting the source file leaves the row
  with a dangling reference on purpose (see Failure modes).
- **`KnowledgeEdge`** — `fromPageId`, `toPageId`, `kind`, `origin`
  (`EXTRACTED | INFERRED | AMBIGUOUS`), `confidence`. The origin distinction is
  taken from SwarmVault and is the difference between a graph you can trust and
  a graph that looks impressive.
- **`KnowledgeFinding`** — `type` (`CONTRADICTION | GAP | STALE | ORPHAN |
UNOWNED`), `severity`, `pageIds`, `detail`, `status`
  (`OPEN | RESOLVED | DISMISSED`), `detectedAt`. `STALE` and `UNOWNED` are
  computed from `verifyEvery` / `lastVerifiedAt` / `ownerId` — a query, not a
  module, which is the whole reason those fields exist from day one.
- **`KnowledgeDecision`** — append-only: `pageId`, `actorId`, `action`
  (`APPROVE | REJECT | MERGE | SET_OWNER | SET_ACCESS | WIDEN_ACCESS |
PUBLISH | UNPUBLISH | VERIFY`), `before`/`after` JSON, `createdAt`. No update
  and no delete; the widening rule is enforceable only because this exists.

**Migration and existing rows.** Every model is new, so there is no backfill
and no row written before this change to reason about. The one pre-existing
shape Brain reads is `UserFile`, which it never writes except to create a
published page — a new row, never an update to a customer's uploaded file.

**Encryption.** Knowledge pages derive from documents, not from threads, so
ADR-42's one-function rule for thread-derived content does not reach them. A
page is stored like a `UserDocument`'s content is stored today. Said out loud
because "it is text in Postgres, therefore encrypt it like a message" is the
wrong reflex here and would be expensive to undo.

## Failure modes

- **Extraction cost runs away.** Several LLM passes per document; a 40k-document
  pilot is a bill nobody approved. Per-run budget, in documents and tokens,
  checked before the run and enforced during it; the existing usage-ceiling call
  sites are the precedent — a computed limit is not a limit.
- **The LLM returns something the schema rejects.** One retry with the parse
  error fed back, then the document is parked as `extraction_failed` and shown
  in findings. It never fails the batch.
- **A source file is deleted after a page was approved.** The page stays, the
  source row is marked dangling, and the page gets a `STALE` finding. Deleting a
  document must not silently rewrite curated knowledge, and it must not leave a
  citation pointing at nothing either.
- **A source file's permissions change after publication.** The published page's
  `accessibleBy` is a curation decision and does not follow the source. A
  narrowing on any source raises a finding for the owner; it does not silently
  widen or narrow retrieval. Whichever way this goes it must be visible — a
  permission that drifts invisibly is the same class of bug as the
  `accessible_by` backfill.
- **Two reviewers approve conflicting candidates concurrently.** Approval is a
  transaction on the page row with an optimistic version check; the loser is
  told what changed rather than overwriting it.
- **Docling is down mid-extraction.** Brain reads already-parsed documents, so
  it is unaffected; only new uploads stall, which is today's behaviour.
- **The graph outgrows the browser.** Cap the rendered neighbourhood and load
  around a focused node. A page that hangs the tab on a real corpus is a demo
  that fails at the customer's data volume.
- **A page is published, then edited in Brain.** Publication is not a copy that
  drifts: re-publishing diffs `contentHash` and re-embeds only the changed
  pages, clearing previous chunks first (the `reindexDocumentVersion` pattern —
  never `runFileEmbeddings`, which re-parses the stored file). Without this,
  every curation fix costs a full re-index and the cost model stops closing.

## Phases

Each phase leaves the application working. `brain` is off by default until
Phase D, so every phase before it is invisible to existing users.

### Phase A — Contracts and schema

- [ ] **A1.** `packages/brain-contracts`: Zod schemas for the page frontmatter
      and the bundle manifest (§18 of the research), plus the published-file
      metadata shape. Tests for valid and invalid input.
- [ ] **A2.** Prisma: the five models and their migration. `npm run verify`
      green, no behaviour change.
- [ ] **A3.** The five models into `TENANT_SCOPED_MODELS`; `brain` into
      `FEATURE_KEYS`, code default `false`.
- [ ] **A4.** `lint-staged.config.mjs` entries for the new workspaces.

### Phase B — Extraction, no interface

- [ ] **B1.** `packages/brain-core`: extraction of entities, facts and claims
      with span citations, as a structured-output call through the gateway.
      Unit tests against fixture documents.
- [ ] **B2.** The intersection rule for `accessibleBy`, as a pure function with
      its own tests. Written before anything can call it wrongly.
- [ ] **B3.** `packages/jobs`: `brainExtract` + payload. `apps/worker` handler
      writing `CANDIDATE` pages, sources and edges. Job-runtime test.
- [ ] **B4.** A script that runs extraction over one project and prints what it
      produced — enough to run the pipeline against our own documents and judge
      the output before any UI exists.

### Phase C — Findings and graph

- [ ] **C1.** Contradiction detection over extracted claims → `KnowledgeFinding`.
- [ ] **C2.** Gap, orphan, stale and unowned findings as queries over the pages'
      own fields.
- [ ] **C3.** Graph assembly (`graphology`, Louvain communities) with
      `EXTRACTED` / `INFERRED` / `AMBIGUOUS` kept distinct.

### Phase D — Review interface

- [ ] **D1.** `apps/web` panel routes behind the `brain` flag: page list, page
      view with its sources, findings list. Read-only.
- [ ] **D2.** The review queue: merge candidates, set owner, set access,
      approve, reject — every action writing `KnowledgeDecision`. Widening
      access is a distinct action with its own confirmation.
- [ ] **D3.** Graph view (Sigma.js or react-force-graph), scoped to a
      neighbourhood.
- [ ] **D4.** Flag on for our own organization. This is the first phase a user
      can see.

### Phase E — Export and publication

- [ ] **E1.** Bundle export: markdown with frontmatter + `graph.json` +
      manifest, written through `packages/storage`, downloadable. Approved pages
      with an owner only.
- [ ] **E2.** Publish to the knowledge base: an approved page becomes a
      `UserFile` carrying `metadata.brainPageId`, ingested with predefined chunk
      boundaries and the curated `accessible_by`.
- [ ] **E3.** `tests/architecture/brain-export-never-widens-access.test.ts`.
- [ ] **E4.** Re-publication by diff: `contentHash` per page, re-embed only what
      changed, delete what was removed.
- [ ] **E5.** Two-level citation rendering in `apps/web` and `apps/api`, from
      `metadata.brainPageId` → `KnowledgePageSource`.

### Phase F — Verification loop _(v1.1, listed so it is designed for, not built)_

- [ ] **F1.** `verifyEvery` scheduling, the verifier's queue, notifications.
- [ ] **F2.** The event shape for Ragen → Brain signal (dead knowledge,
      unanswered questions, contradictory co-retrievals) — the schema only.

## Testing

- **Unit** (`packages/*/src/__tests__`, run by `App / Test`): the Zod schemas
  valid and invalid; the intersection rule, including the case where sources
  share no principal; findings queries; graph assembly.
- **Integration**: the extract handler under `worker:test:jobs` (needs Redis);
  the publish path asserting `accessible_by` on the written chunks equals the
  curated value, not the source file's.
- **Architecture**: `brain-export-never-widens-access.test.ts`; the existing
  `every-ingest-path-writes-accessible-by` covers the new path by construction.
- **E2E**: the approve → publish → retrieve journey goes in **`p0-*`**, because
  a `p1`–`p3` test does not gate the PR that breaks it. A `smoke-*` test for the
  panel rendering behind the flag.
- **RAG measurement**: publication changes what is in the index, so ADR-20
  applies — a before/after retrieval run on the same question set, per
  `.claude/skills/ragen-rag-change/SKILL.md`. "It looked better in the demo" is
  not a result.

## Rollout and rollback

- **Flag**: `brain` in `FEATURE_KEYS`, code default `false`, per-org override
  through the admin panel (ADR-35). Every route and job checks it.
- **Migration order**: schema first (additive), then packages, then the flag.
  Nothing existing reads the new tables, so the migration is safe to land ahead
  of the feature.
- **Rollback**: turn the flag off — the panel disappears and the jobs stop. The
  tables stay; they hold curation work that took a person's time and must not be
  dropped by a revert. Already-published pages are ordinary `UserFile` rows and
  keep working; unpublishing one is the same operation as deleting a document.
- **What a revert cannot undo**: chunks already written to Qdrant for published
  pages. Removing them is the unpublish action, not a code revert.

## Sources

- ClickUp: [Ragen Brain — research konkurencji i rekomendacja
  (2026-09)](https://app.clickup.com/9014546163/docs/8cmy3qk-10174) — landscape,
  architecture, stack, and the Ragen-integration pass (§14–19)
- ClickUp: [Ragen Brain — decyzja o zakresie
  v1](https://app.clickup.com/t/86bc1fd2r),
  [Ragen Brain jako zestaw agentów](https://app.clickup.com/t/86bc25wrv)
- WikiContradict — [arXiv:2406.13805](https://arxiv.org/abs/2406.13805)
