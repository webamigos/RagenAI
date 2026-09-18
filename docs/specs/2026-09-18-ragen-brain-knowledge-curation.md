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
left. The non-obvious part is that **nothing reaches retrieval on its own**: a
knowledge page enters the index only when a person publishes it, and can be
withdrawn just as explicitly.

It runs in two modes. **Over an existing knowledge base**, Brain is an
improvement layer and today's behaviour is unchanged. **As a staging area**,
documents are uploaded to Brain alone: they are parsed and curated but never
indexed, so nothing a person has not approved can be retrieved or cited.

Brain is not a new application. It ships as `packages/brain-core` plus
`packages/brain-contracts`, with the UI under `apps/web`'s panel and the work
running in `apps/worker` — no new runtime, no new deploy target. Parsing is
already solved by Docling as a companion service, which is why the stack
question ("maybe Python?") is closed.

Research and competitive landscape: [Ragen Brain — research konkurencji i
rekomendacja (2026-09)](https://app.clickup.com/9014546163/docs/8cmy3qk-10174).

## Decisions taken before writing this spec

The gate in [`docs/specs/README.md`](README.md) was run three times. What came
back, because the rest of the spec is unreadable without it:

| #   | Question                                                   | Decision                                                                                                                                        |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | v1's value: compiled wiki or a contradictions/gaps report? | **Compiled wiki.** Findings are a first-class view over the same data, not a separate product.                                                  |
| D2  | Separate product or a module here?                         | **Packages in this monorepo** (`packages/brain-*`). **No new app** — the interface lives in `apps/web`.                                         |
| D3  | `candidates/` + human approval in v1?                      | **Yes, and it is the product.**                                                                                                                 |
| D4  | Name                                                       | **Ragen Brain.** The ragen.ai announcement page already commits to it and to "part of Ragen"; D2 makes that copy true.                          |
| D5  | Where a bundle lives at rest                               | **Postgres is the source of truth**; the bundle (markdown + `graph.json` + manifest) is an export.                                              |
| D6  | How a page reaches Ragen                                   | **Only through human acceptance.** There is no automatic path from Brain into the index.                                                        |
| D7  | Permissions on a page built from several documents         | **Intersection** of the sources' principals. Widened only by a human, explicitly, with a ledger entry. No approved owner → not exported at all. |
| D8  | Intake                                                     | **Two modes.** Over an existing knowledge base (today's path, the default) and staged intake into Brain alone. Staging is opt-in per upload.    |
| D9  | What Brain puts in the index                               | **Knowledge pages only.** Brain never publishes a source document to retrieval.                                                                 |
| D10 | Is publication reversible?                                 | **Yes.** Unpublishing is a first-class action: the page's chunks are deleted, the page stays approved, the ledger keeps both events.            |

D6 and D9 are what keep the change cheap, and D10 is why D9 had to be decided
rather than assumed — see "Withdrawal" below.

## Problem

Ragen retrieves over raw documents. A file becomes retrievable the moment
ingest finishes, and access is decided per **file**, at upload, inherited into
`accessible_by` on every chunk by `computeFileAccessPrincipals`. Nothing in the
system ever decides what is _true_: which of two documents supersedes the other,
who owns a statement, when it was last confirmed, or what the corpus does not
contain.

Four consequences, all of them things a customer can point at today:

- **A contradiction is resolved by whichever chunk reranks higher.**
  WikiContradict (IBM, [arXiv:2406.13805](https://arxiv.org/abs/2406.13805) —
  253 human-annotated cases, 5 models, 3500+ judgements) is the evidence that
  the model will not resolve it at answer time either, least of all when the
  conflict is implicit. So it has to be resolved _before_ retrieval, by a
  person. That is the whole product in one sentence.
- **There is no state between "uploaded" and "answering questions".** Noise is
  live from the moment embedding completes. A customer who uploads a shared
  drive to see what is in it has already changed what the assistant says.
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
- **Brain writing to Qdrant directly.** Brain writes Postgres and produces an
  export; the existing ingest path is the only thing that writes vectors.
- **Two-stage curated/raw retrieval** — curated pages first, source chunks
  pulled in as evidence (§14.4 of the research). D9 rules it out for anything
  Brain publishes. It remains describable for mode 1, where the customer's own
  documents are in the index already, and it is not built here.
- **Publishing source spans as their own chunks.** The middle variant —
  indexing only the passages an approved page cites, so the original is
  quotable verbatim without the rest of the document. Considered and deferred:
  it needs a new chunk kind and makes withdrawal a per-span calculation.
- **Brain removing documents the customer indexed itself.** Mode 1 leaves the
  existing index alone. There is an explicit, human-triggered action to take a
  curated source document out of retrieval (Phase E), and it is never automatic.
- **The Ragen → Brain signal stream** (dead knowledge, unanswerable questions,
  chunks retrieved together that contradict each other). v2 — the event shape
  is sketched in Phase G so the data model does not have to change for it later.
- **Voice capture of tacit knowledge** (TZ's interview loop). Interesting, and
  a different product.
- **Per-seat pricing.** Two independent market signals say this category is not
  sold per seat. Not a code decision; flagged so it is not assumed.

## Proposed solution

### The two modes

**Mode 1 — over an existing knowledge base.** Unchanged behaviour: documents
are uploaded, parsed, indexed and retrievable, exactly as today. Brain reads
what is already there, produces candidate pages and findings, and a person
curates. Approved pages are published _alongside_ the customer's own documents.
The raw documents stay in the index because the customer put them there; Brain
does not quietly take them out.

**Mode 2 — staged intake.** The upload names Brain as its destination. The file
is stored, parsed and turned into candidates, and **the vector write is
skipped** — so it is in the system and not in the index. It is visible on the
document list with a state that says so, openable and downloadable, and
invisible to every retrieval path because there is nothing to retrieve. Only a
published knowledge page becomes retrievable.

Mode 2 is opt-in per upload; mode 1 is the default, so no existing installation
changes behaviour when Brain is switched on.

### Shape

```
mode 1: upload ─▶ parse ─▶ index (as today, retrievable)  ─┐
mode 2: upload ─▶ parse ─▶ STAGED (stored, NOT in index)  ─┤
                                                           │
        ▼  extract: entities / facts / claims + span citations   [worker, LLM]
   KnowledgePage(status = CANDIDATE)  +  KnowledgeEdge  +  KnowledgeFinding
        │
        ▼  REVIEW — a person: merge, set owner, set access, approve or reject
   KnowledgePage(status = APPROVED)   ── every transition appended to KnowledgeDecision
        │
        ├──▶ browse: list · page · graph · findings        (apps/web panel)
        ├──▶ export bundle: markdown + graph.json + manifest   (packages/storage)
        └──▶ PUBLISH (a person, per page): a UserFile whose text IS the page,
             ingested with predefined chunk boundaries and the curated
             `accessible_by`  ──  UNPUBLISH removes its chunks again
```

Brain reuses what already exists at every point it can: documents come from
`UserFile` (already parsed by Docling, with the parsed text persisted to
`UserDocument.content` and `DocumentVersion`), the work runs as jobs named in
`packages/jobs`, extraction is an LLM call with a Zod schema through the
in-process gateway (ADR-49), and publishing is the ordinary ingest path with one
new input — chunk boundaries it did not compute itself.

### What "in the index" means, and why staging is cheap

The index is Qdrant. It is the only thing chat and the API read: a document with
no chunks cannot be retrieved, cited or leaked through an answer, however
permissive the rest of the system is. That is what makes staging fail closed by
construction rather than by a filter someone can forget.

In `apps/worker/src/handlers/parse-and-embed.ts` the vector write is a single
call — `addDocumentsToVectorStore` — and everything Brain needs happens
elsewhere: the parsed markdown is persisted to `UserDocument` and seeded as
`DocumentVersion` further down the same handler. Staging is therefore "skip one
activity and record a different status", not a second ingest pipeline.

One trap: `VectorStoreDocumentMetadata` declares `status: 'active' | 'archived'`
and it looks like a ready-made lever for hiding a document. It is dead — declared
in `packages/rag-core/src/vector-metadata.ts:108` and read nowhere. Do not build
on it.

### Withdrawal

Publication is reversible, per page, as an explicit action:

- **Publish** creates the page's `UserFile`, writes its chunks and records a
  `PUBLISH` decision.
- **Unpublish** deletes those chunks and clears `publishedFileId`. The page
  stays `APPROVED` — withdrawing it from retrieval is not the same as
  un-approving it — and the ledger keeps both events, so "who put this in front
  of people, and who took it out" is answerable.

This is clean **because** of D9. If source documents were published alongside
pages, a document cited by two pages could not be withdrawn when one of them
was, and "I withdrew it and it still shows up in answers" would be a legitimate
bug report with no good fix. Indexing only pages makes withdrawal a per-page
delete and nothing else.

For mode 1 there is a separate, human-triggered action: **take a curated source
document out of retrieval**, once its knowledge lives in approved pages. It is
never automatic, it is per document, and it is reversible by re-running ingest.
That is what lets a mode-1 customer converge on a clean index over time without
Brain ever deciding to remove something on their behalf.

### Why not the alternatives

- **Not a separate application or repository.** ADR-32's rule is to measure
  drift before splitting. Brain shares the schema, the tenant guard, the auth
  guards, `platform-contracts` and the job runtime; a split today would
  duplicate all five to save nothing. Revisit if packaging or pricing diverges.
- **Not files-as-source-of-truth.** The bundle is the promise ("readable
  without us"), not the storage engine. Review is a workflow with concurrent
  actors, an append-only ledger and permission checks; Postgres gives
  transactions, the tenant guard and one query for "what is stale and unowned".
  A git remote as a datastore would be a new operational runtime, which is the
  exact cost the TypeScript decision was made to avoid.
- **Not a second ingest pipeline for staging.** One handler, one branch. A
  parallel path would drift from the real one, and the real one is where PII
  policy, language detection, page counts and thumbnails live.
- **Not hiding staged documents from the document list.** A file that vanishes
  after upload gets uploaded again. It is listed, with its state visible.
- **Not a graph database.** `graphology` plus Postgres. Neo4j is an export
  target, not a dependency.

### The permission rule, stated once

A page's `accessibleBy` defaults to the **intersection** of its sources'
principals — the narrowest, never the union. A person may widen it, and only a
person, through an action that writes a `KnowledgeDecision` row naming who, when
and from what to what. A page with no approved owner is not exportable and not
publishable: not a flag for the consumer to honour, but the absence of a row.
The default union is a data leak at the first customer with an HR folder, and
nothing in `tests/architecture/` would catch it — so
`brain-export-never-widens-access.test.ts` is part of Phase E, not a follow-up.

## Core surfaces touched

| Surface                                 | Change                                                              | What catches a mistake                                                             |
| --------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                  | five new models, all additive; one new `EmbeddingStatus` member     | migration + `npm run verify`                                                       |
| `packages/platform-contracts`           | `brain` feature key; `TENANT_SCOPED_MODELS` gains the five models   | package tests, `shared-contracts-are-not-recopied`                                 |
| `packages/brain-contracts` _(new)_      | bundle manifest + page frontmatter Zod schemas                      | package tests; consumers: web, worker                                              |
| `packages/brain-core` _(new)_           | extraction, findings, graph, intersection rule                      | package tests; consumers: web, worker                                              |
| `packages/jobs`                         | new job names + payloads; `STAGED` in the `EmbeddingStatus` union   | `job-payload-enums-match-the-schema`, `worker:test:jobs`                           |
| `apps/worker` ingest handler            | the vector write becomes conditional on the destination             | worker tests + the BullMQ gate; a p0 e2e that a staged file is not retrievable     |
| `src/libs/db/tenant-scope-guard.ts`     | five models added to the covered set                                | warns at runtime; it does **not** block — the `where` clause still has to be right |
| ingest / `accessible_by`                | a new publish path writes it from curation instead of from the file | `every-ingest-path-writes-accessible-by.test.ts`                                   |
| upload UI + document list               | a destination choice, and a visible state for staged files          | component tests + e2e                                                              |
| `packages/rag-core` (`vector-metadata`) | **no change in v1**                                                 | —                                                                                  |
| citations (`DocumentCitation`)          | **no schema change**                                                | existing e2e                                                                       |
| `packages/create-ragen-app`             | new env var for the extraction model, if one is added               | `create-ragen-app-manifest-is-current`                                             |
| `lint-staged.config.mjs`                | an entry per new workspace                                          | pre-commit, and nothing else                                                       |

**Why rag-core and the citation tables do not change.** A published page is a
`UserFile` like any other, so retrieval, `DocumentCitation`, `DocumentRetrieval`
and the analytics built on them keep working untouched. The second citation
level — "knowledge page _Onboarding_, based on `regulamin-pracy.pdf` p. 4 §2" —
is a render-time lookup: the published file carries `metadata.brainPageId`, and
the renderer joins it to `KnowledgePageSource`. A `layer` field on the chunk
payload would only be needed for two-stage retrieval, which D9 rules out.

## Data model

Five additive models plus one enum member. Conventions per AGENTS.md: `Int`
autoincrement `id` plus a `publicId` UUID for URLs, camelCase fields with
`@map`, `Timestamptz`.

- **`KnowledgePage`** — `organizationId`, `title`, `slug`, `type`
  (`PROCESS | ENTITY | POLICY | PRODUCT | ROLE`), `content` (markdown),
  `contentHash`, `status` (`CANDIDATE | APPROVED | REJECTED | STALE`),
  `ownerId` (the person who vouches for it — not the uploader), `accessibleBy`
  (`String[]` of `org:` / `user:` / `team:` principals), `validFrom`,
  `supersededById`, `verifyEvery` (ISO-8601 duration), `lastVerifiedAt`,
  `lastVerifiedBy`, `publishedFileId`, `publishedAt`, timestamps.
  **`status` and publication are independent**: `publishedFileId` null means
  "not in the index", and an approved page that was withdrawn is exactly that.
- **`KnowledgePageSource`** — `pageId`, `fileId`, `span` (e.g. `"p.4 §2"`),
  `hash`. What makes a page auditable, and what the second citation level reads.
- **`KnowledgeEdge`** — `fromPageId`, `toPageId`, `kind`, `origin`
  (`EXTRACTED | INFERRED | AMBIGUOUS`), `confidence`. The origin distinction is
  taken from SwarmVault and is the difference between a graph you can trust and
  a graph that looks impressive.
- **`KnowledgeFinding`** — `type` (`CONTRADICTION | GAP | STALE | ORPHAN | UNOWNED`),
  `severity`, `pageIds`, `detail`, `status` (`OPEN | RESOLVED | DISMISSED`),
  `detectedAt`. `STALE` and `UNOWNED` are computed from `verifyEvery` /
  `lastVerifiedAt` / `ownerId` — a query, not a module, which is the whole
  reason those fields exist from day one.
- **`KnowledgeDecision`** — append-only: `pageId`, `actorId`, `action`
  (`APPROVE | REJECT | MERGE | SET_OWNER | SET_ACCESS | WIDEN_ACCESS | PUBLISH | UNPUBLISH | VERIFY`),
  `before`/`after` JSON, `createdAt`. No update and no delete; the widening rule
  and the publish/withdraw history are enforceable only because this exists.
- **`EmbeddingStatus`** gains **`STAGED`** — parsed, deliberately not embedded.
  Distinct from `NOT_STARTED` (queued, will be) and from `CANCELLED` (someone
  stopped it); a state that means "this is fine and it is not in the index" has
  to be its own value or the document list cannot tell the user the truth.

**Migration and existing rows.** Every model is new and the enum member is
additive, so there is no backfill: no row written before this change is `STAGED`,
and nothing reads the new tables. The one pre-existing shape Brain writes is a
new `UserFile` for a published page — never an update to a customer's uploaded
file.

**Encryption.** Knowledge pages derive from documents, not from threads, so
ADR-42's one-function rule for thread-derived content does not reach them. A
page is stored the way a `UserDocument`'s content is stored today. Said out loud
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
- **A staged document is never curated.** It sits parsed and unindexed forever,
  which is safe but invisible; the Brain inbox shows age and volume so a
  forgotten pile is a number on a screen rather than a surprise at the next
  storage bill.
- **Someone expects a staged document to answer questions.** The document list
  states the file is in Brain and not searchable, and the empty-answer path does
  not silently pretend it looked. This is the most likely support ticket of the
  whole feature.
- **A source file is deleted after a page was approved.** The page stays, the
  source row is marked dangling, and the page gets a `STALE` finding. Deleting a
  document must not silently rewrite curated knowledge, and must not leave a
  citation pointing at nothing either.
- **A source file's permissions change after publication.** The published page's
  `accessibleBy` is a curation decision and does not follow the source. A
  narrowing on any source raises a finding for the owner; retrieval is neither
  widened nor narrowed behind anyone's back. A permission that drifts invisibly
  is the same class of bug as the `accessible_by` backfill.
- **Unpublish races a retrieval in flight.** Chunk deletion is not instant;
  a turn already in progress may still cite the page. Unpublish is reported as
  complete only after the delete is acknowledged, and the action is idempotent
  so a retry after a partial failure finishes the job rather than erroring.
- **Unpublish leaves orphans.** The page's `UserFile` and its chunks must go
  together; a crash between them leaves a file with no vectors (harmless, and
  re-publishable) rather than vectors with no file (retrievable and
  unaccountable). Order the operations that way round.
- **Two reviewers approve conflicting candidates concurrently.** Approval is a
  transaction on the page row with an optimistic version check; the loser is
  told what changed rather than overwriting it.
- **A page is published, then edited in Brain.** Re-publishing diffs
  `contentHash` and re-embeds only the changed pages, clearing previous chunks
  first (the `reindexDocumentVersion` pattern — never `runFileEmbeddings`, which
  re-parses the stored file). Without this, every curation fix costs a full
  re-index and the cost model stops closing.
- **Docling is down.** Staged intake stalls at parsing exactly as normal ingest
  does today; nothing half-parsed reaches curation.

## Phases

Each phase leaves the application working. `brain` is off by default until
Phase D, so every phase before it is invisible to existing users.

### Phase A — Contracts and schema

- [ ] **A1.** `packages/brain-contracts`: Zod schemas for the page frontmatter
      and the bundle manifest (§18 of the research), plus the published-file
      metadata shape. Tests for valid and invalid input.
- [ ] **A2.** Prisma: the five models, the `STAGED` enum member, and the
      migration. `npm run verify` green, no behaviour change.
- [ ] **A3.** The five models into `TENANT_SCOPED_MODELS`; `brain` into
      `FEATURE_KEYS`, code default `false`.
- [ ] **A4.** `lint-staged.config.mjs` entries for the new workspaces.

### Phase B — Extraction, no interface

- [ ] **B1.** `packages/brain-core`: extraction of entities, facts and claims
      with span citations, as a structured-output call through the gateway.
      Unit tests against fixture documents.
- [ ] **B2.** The intersection rule for `accessibleBy`, as a pure function with
      its own tests, including the case where the sources share no principal.
      Written before anything can call it wrongly.
- [ ] **B3.** `packages/jobs`: `brainExtract` + payload. `apps/worker` handler
      writing `CANDIDATE` pages, sources and edges. Job-runtime test.
- [ ] **B4.** A per-run extraction budget, enforced at the call site.
- [ ] **B5.** A script that runs extraction over one project and prints what it
      produced — enough to judge quality on our own documents before any UI.

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
      neighbourhood — a graph that hangs the tab on a real corpus is a demo that
      fails at the customer's data volume.
- [ ] **D4.** Flag on for our own organization. The first phase a user can see.

### Phase E — Publication, withdrawal, export

- [ ] **E1.** Bundle export: markdown with frontmatter + `graph.json` +
      manifest, written through `packages/storage`, downloadable. Approved pages
      with an owner only.
- [ ] **E2.** Publish: an approved page becomes a `UserFile` carrying
      `metadata.brainPageId`, ingested with predefined chunk boundaries and the
      curated `accessible_by` — never the source file's.
- [ ] **E3.** Unpublish: delete the page's chunks, clear `publishedFileId`,
      keep the page approved, record the decision. Idempotent, and ordered so a
      crash cannot leave vectors without a file.
- [ ] **E4.** `tests/architecture/brain-export-never-widens-access.test.ts`.
- [ ] **E5.** Re-publication by diff: `contentHash` per page, re-embed only what
      changed, delete what was removed.
- [ ] **E6.** Two-level citation rendering in `apps/web` and `apps/api`:
      `metadata.brainPageId` → `KnowledgePageSource` → source documents.
- [ ] **E7.** Take a curated source document out of retrieval — per document,
      human-triggered, reversible by re-running ingest. Mode 1's path to a clean
      index, and never automatic.

### Phase F — Staged intake (mode 2)

- [ ] **F1.** A destination on upload: knowledge base (today's path, default) or
      Brain. Carried on the ingest payload.
- [ ] **F2.** The worker handler skips `addDocumentsToVectorStore` for a staged
      file and records `EmbeddingStatus.STAGED`; everything else — parsing, the
      persisted markdown, the document version, PII policy, language, page count
      — runs unchanged.
- [ ] **F3.** The document list shows the staged state plainly: present,
      openable, not searchable.
- [ ] **F4.** The Brain inbox: what is staged, how old, how much of it is still
      uncurated.
- [ ] **F5.** A `p0-*` e2e asserting a staged document is not retrievable —
      through chat, through the API, and at every knowledge scope.

### Phase G — Verification loop _(v1.1, listed so it is designed for, not built)_

- [ ] **G1.** `verifyEvery` scheduling, the verifier's queue, notifications.
- [ ] **G2.** The event shape for Ragen → Brain signal (dead knowledge,
      unanswered questions, contradictory co-retrievals) — the schema only.

## Testing

- **Unit** (`packages/*/src/__tests__`, run by `App / Test`): the Zod schemas
  valid and invalid; the intersection rule, including the case where sources
  share no principal; findings queries; graph assembly.
- **Integration**: the extract handler under `worker:test:jobs` (needs Redis);
  the publish path asserting `accessible_by` on the written chunks equals the
  curated value, not the source file's; the staged path asserting no vector
  write happened.
- **Architecture**: `brain-export-never-widens-access.test.ts`; the existing
  `every-ingest-path-writes-accessible-by` covers the new publish path by
  construction.
- **E2E**: two journeys in **`p0-*`**, because a `p1`–`p3` test does not gate
  the PR that breaks it — approve → publish → retrieve → unpublish → no longer
  retrievable, and staged document → not retrievable anywhere. A `smoke-*` test
  for the panel rendering behind the flag.
- **RAG measurement**: publication changes what is in the index, so ADR-20
  applies — a before/after retrieval run on the same question set, per
  `.claude/skills/ragen-rag-change/SKILL.md`. "It looked better in the demo" is
  not a result.

## Rollout and rollback

- **Flag**: `brain` in `FEATURE_KEYS`, code default `false`, per-org override
  through the admin panel (ADR-35). Every route and job checks it.
- **No behaviour change for existing installations.** Mode 1 is the default and
  is today's path; staged intake is chosen per upload. An organization that
  never turns Brain on sees nothing.
- **Migration order**: schema first (additive), then packages, then the flag.
  Nothing existing reads the new tables, so the migration is safe to land ahead
  of the feature.
- **Rollback**: turn the flag off — the panel disappears and the jobs stop. The
  tables stay; they hold curation work that took a person's time and must not be
  dropped by a revert. Already-published pages are ordinary `UserFile` rows and
  keep working.
- **What a revert cannot undo**: chunks already written for published pages.
  Removing them is the unpublish action (E3), not a code revert.
- **What a revert must not strand**: staged files. If Brain is disabled while
  documents sit in `STAGED`, they stay parsed, listed and unindexed — safe, but
  the operator needs a way to send them through normal ingest. That is one job
  run per file, and it is the documented answer rather than a manual fix.

## Sources

- ClickUp: [Ragen Brain — research konkurencji i rekomendacja
  (2026-09)](https://app.clickup.com/9014546163/docs/8cmy3qk-10174) — landscape,
  architecture, stack, and the Ragen-integration pass (§14–19)
- ClickUp: [Ragen Brain — decyzja o zakresie
  v1](https://app.clickup.com/t/86bc1fd2r),
  [Ragen Brain jako zestaw agentów](https://app.clickup.com/t/86bc25wrv)
- WikiContradict — [arXiv:2406.13805](https://arxiv.org/abs/2406.13805)
