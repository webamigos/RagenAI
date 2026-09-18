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

- **Publish** creates the page's `UserFile` (once, on first publication),
  writes its chunks, sets `publishedAt` and records a `PUBLISH` decision.
- **Unpublish** deletes those chunks, sets the file's `embeddingStatus` to
  `STAGED` and clears `publishedAt`. The page stays `APPROVED` — withdrawing it
  from retrieval is not the same as un-approving it — and the ledger keeps both
  events, so "who put this in front of people, and who took it out" is
  answerable.

**The published `UserFile` is never deleted, and `publishedFileId` is never
cleared.** Two reasons, and the first is not obvious: `DocumentCitation` and
`DocumentRetrieval` are `onDelete: Cascade` on `UserFile`, so deleting the file
would erase the record of every past answer that cited the page. A withdrawn
page's history has to survive its withdrawal. The second is that republishing
then reuses the same file rather than minting a new identity for the same
knowledge.

So **`publishedAt`, not `publishedFileId`, is what "in the index" means.**
`publishedFileId` is where this page's publication vehicle lives; `publishedAt`
is whether it is currently serving. A reader of the schema who takes the null
check from the wrong column gets the wrong answer, which is why they are
separated here rather than overloaded into one field.

**Order, and what a retry finds.** Delete chunks → set `embeddingStatus =
STAGED` → clear `publishedAt`. Each step is idempotent and safe to repeat, and
the sequence is chosen so every interruption leaves a state a retry can finish
from: a crash after the delete leaves a file with no vectors and a stale
`publishedAt`, which the retry corrects; the reverse order would leave
`publishedAt` null while chunks are still retrievable, which nothing would
detect. **Never the reverse.** Republish after a partial withdrawal is the
ordinary publish path: it re-embeds the current page content into the existing
file, so it recovers a half-finished withdrawal rather than tripping over it.

Withdrawal is clean **because** of D9. If source documents were published
alongside pages, a document cited by two pages could not be withdrawn when one
of them was, and "I withdrew it and it still shows up in answers" would be a
legitimate bug report with no good fix. Indexing only pages makes withdrawal a
per-page delete and nothing else.

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

**That lookup is an authorization boundary, not a join.** A person may widen a
page's `accessibleBy` beyond the intersection of its sources, so a reader can
legitimately retrieve a page while having no right to any of the documents
behind it. Resolving `brainPageId` → `KnowledgePageSource` → source documents
with a plain join would then hand them a filename and a span from a file they
cannot open — a leak through the citation footer, with retrieval itself
perfectly correct. **Every source resolved for rendering passes the same file
predicate as any other read of that document** — `fileAccessWhere` in
`apps/web/src/features/documents/services/queries/document-access.ts`, and its
equivalent in `apps/api` — and sources the reader cannot reach are omitted from
the rendered citation rather than shown without a link. The page itself still
cites normally; it is the second level that narrows per reader, which also
means two people can correctly see different source lists under the same
answer.

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
  **`status` and publication are independent**: `publishedAt` null means "not in
  the index", and an approved page that was withdrawn is exactly that.
  `publishedFileId` outlives a withdrawal (see "Withdrawal"), so it is not the
  field to test.
- **`KnowledgePageSource`** — `pageId`, `fileId`, `documentVersionId`, `span`
  (e.g. `"p.4 §2"`), `hash`, `sourceDeletedAt`.
  **The version, not just the file, is what a citation points at.** A span
  approved against today's text resolves against whatever the file says later:
  re-ingest a corrected PDF and "p. 4 §2" is a different paragraph, while the
  citation still claims a person checked it. `DocumentVersion` is immutable and
  exactly one version is active per document, so pinning
  `documentVersionId` at curation time makes the citation reproducible. `hash`
  is then the check rather than the anchor: when the document's active version
  moves on, the page gets a `STALE` finding naming the changed source, and the
  citation keeps rendering against the version the curator actually read until
  someone re-approves it.
  `fileId` is a **plain column with no foreign key** — deliberately, and for the
  reason `UserDocument.ownerId` gives in the schema: every referential action
  available gets this wrong. `Cascade` would delete curated provenance when a
  source file is deleted, `SetNull` would erase which file it was, and
  `Restrict` would block deleting the file. An audit attribute has to survive
  the row it points at. **`sourceDeletedAt` is the dangling state**: set when
  the referenced file is gone, it is what raises the `STALE` finding and what
  makes the renderer show the citation as "source no longer available" instead
  of resolving nothing and silently dropping it.
- **`KnowledgeEdge`** — `fromPageId`, `toPageId`, `kind`, `origin`
  (`EXTRACTED | INFERRED | AMBIGUOUS`), `confidence`. The origin distinction is
  taken from SwarmVault and is the difference between a graph you can trust and
  a graph that looks impressive.
- **`KnowledgeFinding`** — `type`
  (`CONTRADICTION | GAP | STALE | ORPHAN | UNOWNED | EXTRACTION_FAILED`),
  `severity`, `pageIds`, `fileId`, `detail`, `status`
  (`OPEN | RESOLVED | DISMISSED`), `detectedAt`. `STALE` and `UNOWNED` are
  computed from `verifyEvery` / `lastVerifiedAt` / `ownerId` — a query, not a
  module, which is the whole reason those fields exist from day one.
  **`EXTRACTION_FAILED` is why this carries a `fileId` as well as `pageIds`**:
  it is the one finding about a document that produced no page at all. The job
  runtime records a failed run, but a failed run is not a place anyone looks and
  disappears into job history; a document whose knowledge never made it into
  curation has to be visible where curation happens. It is raised per document,
  never fails the batch, carries the parse error in `detail`, and the inbox
  offers a retry that re-runs `brainExtract` for that document alone and
  resolves the finding on success.
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
- **The LLM returns something the schema rejects.** One automatic retry with the
  parse error fed back, then an `EXTRACTION_FAILED` finding naming the document
  and the error, offering a retry in the inbox. It never fails the batch. The
  finding is the durable record — a failed job run is not, because nobody
  curating knowledge is reading job history.
- **A staged document is never curated.** It sits parsed and unindexed forever,
  which is safe but invisible; the Brain inbox shows age and volume so a
  forgotten pile is a number on a screen rather than a surprise at the next
  storage bill.
- **Someone expects a staged document to answer questions.** The document list
  states the file is in Brain and not searchable, and the empty-answer path does
  not silently pretend it looked. This is the most likely support ticket of the
  whole feature.
- **A source file is deleted after a page was approved.** The page stays, its
  `KnowledgePageSource` row gets `sourceDeletedAt` (the row survives because
  `fileId` carries no foreign key), and the page gets a `STALE` finding. The
  citation renders as "source no longer available" rather than vanishing.
  Deleting a document must not silently rewrite curated knowledge, and must not
  leave a citation pointing at nothing either.
- **A source document is re-ingested and its text changes.** The citation still
  resolves — it is pinned to `documentVersionId`, which is immutable — and the
  page gets a `STALE` finding naming the source whose active version moved on.
  Without the pin, an approved span would quietly start pointing at a different
  paragraph while still claiming a person checked it.
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
      own fields. `STALE` covers both a deleted source (`sourceDeletedAt`) and a
      source whose active `DocumentVersion` moved past the pinned one.
- [ ] **C3.** `EXTRACTION_FAILED` findings raised by the extract handler, per
      document, carrying the error.
- [ ] **C4.** Graph assembly (`graphology`, Louvain communities) with
      `EXTRACTED` / `INFERRED` / `AMBIGUOUS` kept distinct.

### Phase D — Review interface

- [ ] **D1.** `apps/web` panel routes behind the `brain` flag: page list, page
      view with its sources, findings list. Read-only.
- [ ] **D2.** The review queue: merge candidates, set owner, set access,
      approve, reject — every action writing `KnowledgeDecision`. Widening
      access is a distinct action with its own confirmation.
- [ ] **D3.** Retry an `EXTRACTION_FAILED` document from the findings list:
      re-runs `brainExtract` for that document alone and resolves the finding on
      success.
- [ ] **D4.** Graph view (Sigma.js or react-force-graph), scoped to a
      neighbourhood — a graph that hangs the tab on a real corpus is a demo that
      fails at the customer's data volume.
- [ ] **D5.** Flag on for our own organization. The first phase a user can see.

### Phase E — Publication, withdrawal, export

- [ ] **E1.** Bundle export: markdown with frontmatter + `graph.json` +
      manifest, written through `packages/storage`, downloadable. Approved pages
      with an owner only.
- [ ] **E2.** Publish: an approved page becomes a `UserFile` carrying
      `metadata.brainPageId`, ingested with predefined chunk boundaries and the
      curated `accessible_by` — never the source file's.
- [ ] **E3.** Unpublish: delete the page's chunks, set the file to `STAGED`,
      clear `publishedAt`, keep the page approved and its `UserFile`, record the
      decision. Each step idempotent, in that order, so any interruption leaves
      a state a retry finishes.
- [ ] **E4.** `tests/architecture/brain-export-never-widens-access.test.ts`.
- [ ] **E5.** Re-publication by diff: `contentHash` per page, re-embed only what
      changed, delete what was removed.
- [ ] **E6.** Two-level citation rendering in `apps/web` and `apps/api`:
      `metadata.brainPageId` → `KnowledgePageSource` → source documents,
      resolved against the pinned `documentVersionId` and filtered by the same
      file predicate as any other read (`fileAccessWhere`). A test that a reader
      who may see a widened page but not its sources gets the page and no source
      list.
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
- [ ] **F5.** _Send to the knowledge base_ on a staged file: `runFileEmbeddings`
      with the knowledge-base destination, per file and over a selection,
      idempotent, and not gated on the `brain` flag.
- [ ] **F6.** A `p0-*` e2e asserting a staged document is not retrievable —
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
  the operator needs a way to send them through normal ingest.

  **The transition, precisely**, because "one job run per file" is not an
  instruction: the document list offers _send to the knowledge base_ on any
  `STAGED` file, which starts `runFileEmbeddings` for it with the destination
  set to the knowledge base — the same job, same payload shape, and the same
  path the file would have taken had it been uploaded there in the first place.
  It re-parses (the stored file is unchanged, so the result is the same text)
  and ends at `COMPLETED`, at which point the file is an ordinary indexed
  document. Re-running it is idempotent: a file already `COMPLETED` re-embeds to
  the same content, and the existing ingest path already clears a document's
  previous chunks. **The action does not depend on the `brain` flag** — it is a
  knowledge-base operation on a file that happens to be staged, and gating it
  behind Brain would strand exactly the files this paragraph exists to rescue.
  It is available per file and over a selection; the same call, repeated.

## Sources

- ClickUp: [Ragen Brain — research konkurencji i rekomendacja
  (2026-09)](https://app.clickup.com/9014546163/docs/8cmy3qk-10174) — landscape,
  architecture, stack, and the Ragen-integration pass (§14–19)
- ClickUp: [Ragen Brain — decyzja o zakresie
  v1](https://app.clickup.com/t/86bc1fd2r),
  [Ragen Brain jako zestaw agentów](https://app.clickup.com/t/86bc25wrv)
- WikiContradict — [arXiv:2406.13805](https://arxiv.org/abs/2406.13805)
