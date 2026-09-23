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

- **Publish** creates the page's `UserFile` (once, on first publication), sets
  `publishedAt`, writes its chunks, sets the file's `embeddingStatus` to
  `COMPLETED` and records a `PUBLISH` decision. The status write is what the
  ordinary ingest path already does once vectors are in place, and it matters
  most on a **republish**, where the file is coming back from `WITHDRAWN`: a
  page that is serving again while its file still reads as withdrawn would be
  two sources of truth disagreeing. Re-running publish on an already-published
  page is idempotent — same content, same file, same terminal state.
- **Unpublish** deletes those chunks, sets the file's `embeddingStatus` to
  `WITHDRAWN` and clears `publishedAt`. The page stays `APPROVED` — withdrawing
  it from retrieval is not the same as un-approving it — and the ledger keeps
  both events, so "who put this in front of people, and who took it out" is
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

**Order, and what a retry finds.** Both operations are ordered so that **every
interruption leaves less retrievable than the operation intended, never more**,
and so a retry finishes from wherever it stopped:

- **Publish**: one transaction — bump the generation, set `publishedAt`, insert
  the `PUBLISH` decision — → write chunks → set the file `COMPLETED`. A crash
  after the transaction leaves a page marked published that answers nothing, or
  one answering with a file still marked withdrawn; both are visibly wrong,
  harmless, and fixed by the retry.
- **Unpublish**: delete chunks → one transaction — bump the generation, set
  `embeddingStatus = WITHDRAWN`, clear `publishedAt`, insert the `UNPUBLISH`
  decision. A crash during the delete leaves a page still marked published that
  answers nothing — the same benign state, from the other direction.

**The decision row is written inside that transaction, not beside it.**
`KnowledgeDecision` is append-only, so an insert is the one step that cannot be
made idempotent by repeating it: a retry would append a second row for the same
act, and an audit ledger that double-counts is worse than one that is merely
incomplete. Two things prevent it. The decision is atomic with the Postgres
state it records, so there is never publication state without its decision or a
decision without its state — only the Qdrant work sits outside the transaction,
which is the part the ordering above already makes safe. And the decision is
unique on **`(pageId, action, publicationGeneration)`**, so a re-run of the same
operation collides with its own row instead of adding one.

That uniqueness only works if **a retry continues an operation rather than
starting a new one**: it carries the generation the operation was given, and
does not bump again. Bumping on retry would mint a fresh key, defeat the
constraint and leave two `PUBLISH` rows for one act. A new generation means a
new operation, which is what makes the constraint meaningful.

Every other step is idempotent by repetition. **Never the reverse order in either case**: writing
chunks before `publishedAt`, or clearing `publishedAt` before deleting chunks,
both leave content retrievable that the page's own state says is not published,
and nothing in retrieval would notice. Republish after a partial withdrawal is
the ordinary publish path: it re-embeds the current page content into the
existing file, recovering a half-finished withdrawal rather than tripping over
it.

**Retrieval does not check `publishedAt`, and is not asked to.** The alternative
— an activation marker in the chunk payload that retrieval filters on — would
add a field to `VectorStoreDocumentMetadata` and a clause to every retrieval
path in two apps, which is precisely the cost this design avoids. The ordering
above makes it unnecessary: no window exists in which chunks are retrievable
while the page is not published, because chunks are never written before
`publishedAt` and always deleted before it is cleared.

**One publication operation per page at a time.** The ordering only holds if
publish and unpublish do not interleave. Without that, an all-success sequence —
publish writes chunks, unpublish deletes them and clears `publishedAt`, the
first publish then writes the rest — leaves chunks in Qdrant that the page says
are not published, which is the one state the order was chosen to prevent. So
the page carries a **publication generation**, bumped by every transition and
checked at each step: an operation whose generation is stale aborts instead of
writing, and the operation that bumped it is the one that completes. This is the
same optimistic check approval uses, applied to a longer operation.

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

**Changing access on a published page reaches the chunks, or it has not
happened.** `accessibleBy` is copied onto the published `UserFile` and into
`accessible_by` on every chunk at publish time. If `SET_ACCESS` or
`WIDEN_ACCESS` only rewrote the page row, a narrowing would leave the removed
principals still able to retrieve the page — a revocation the audit ledger
records and retrieval ignores, which is worse than not offering the action. The
mirror case is milder and still wrong: a widening nobody can use.

Ragen already has the mechanism, so this is a call rather than a design:
`syncFolderVectorPermissions` / `computeAccessibleBy` in
`apps/web/src/features/documents/services/commands/sync-vector-permissions-command.ts`,
and `vector-permissions.service.ts` in `apps/api`, exist to push a permission
change onto chunks that are already indexed. An access change on a page with
`publishedAt` set runs that path against the page's published file.

**Its ordering follows the same fail-closed rule as publication**, and the two
directions go opposite ways:

- **Narrowing**: chunks first, then the page row. The window has the index
  stricter than the page claims — nobody sees anything they should not.
- **Widening**: the page row first, then the chunks. The window has the index
  stricter than the page claims, again.

Both windows err the same way on purpose: a failure mid-change never leaves
retrieval more permissive than the decision. E4 tests both directions, because
narrowing is the one a customer will actually audit.

## Core surfaces touched

| Surface                                 | Change                                                                            | What catches a mistake                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                  | five new models, all additive; one new `EmbeddingStatus` member                   | migration + `npm run verify`                                                       |
| `packages/platform-contracts`           | `brain` feature key; `TENANT_SCOPED_MODELS` gains the five models                 | package tests, `shared-contracts-are-not-recopied`                                 |
| `packages/brain-contracts` _(new)_      | bundle manifest + page frontmatter Zod schemas                                    | package tests; consumers: web, worker                                              |
| `packages/brain-core` _(new)_           | extraction, findings, graph, intersection rule                                    | package tests; consumers: web, worker                                              |
| `packages/jobs`                         | new job names + payloads; `STAGED` and `WITHDRAWN` in the `EmbeddingStatus` union | `job-payload-enums-match-the-schema`, `worker:test:jobs`                           |
| `apps/worker` ingest handler            | the vector write becomes conditional on the destination                           | worker tests + the BullMQ gate; a p0 e2e that a staged file is not retrievable     |
| `src/libs/db/tenant-scope-guard.ts`     | five models added to the covered set                                              | warns at runtime; it does **not** block — the `where` clause still has to be right |
| ingest / `accessible_by`                | a new publish path writes it from curation instead of from the file               | `every-ingest-path-writes-accessible-by.test.ts`                                   |
| upload UI + document list               | a destination choice, and a visible state for staged files                        | component tests + e2e                                                              |
| `packages/rag-core` (`vector-metadata`) | **no change in v1**                                                               | —                                                                                  |
| citations (`DocumentCitation`)          | **no schema change**                                                              | existing e2e                                                                       |
| `packages/create-ragen-app`             | new env var for the extraction model, if one is added                             | `create-ragen-app-manifest-is-current`                                             |
| `lint-staged.config.mjs`                | an entry per new workspace                                                        | pre-commit, and nothing else                                                       |

**Why rag-core and the citation tables do not change.** A published page is a
`UserFile` like any other, so retrieval, `DocumentCitation`, `DocumentRetrieval`
and the analytics built on them keep working untouched. The second citation
level — "knowledge page _Onboarding_, based on `regulamin-pracy.pdf` p. 4 §2" —
is a render-time lookup: the published file carries `metadata.brain.pageId`, and
the renderer joins it to `KnowledgePageSource`. A `layer` field on the chunk
payload would only be needed for two-stage retrieval, which D9 rules out.

**That lookup is an authorization boundary, not a join.** A person may widen a
page's `accessibleBy` beyond the intersection of its sources, so a reader can
legitimately retrieve a page while having no right to any of the documents
behind it. Resolving `brain.pageId` → `KnowledgePageSource` → source documents
with a plain join would then hand them a filename and a span from a file they
cannot open — a leak through the citation footer, with retrieval itself
perfectly correct. **Every source resolved for rendering passes the same file
predicate as any other read of that document** — `fileAccessWhere` in
`apps/web/src/features/documents/services/queries/document-access.ts`, and its
equivalent in `apps/api` — and sources the reader cannot reach are omitted from
the rendered citation rather than shown without a link.

**A deleted source is omitted from the rendered citation, for every reader.**
No "source no longer available" placeholder, and this is the second answer to
the question: the first was "show the placeholder to readers who could have
opened the file", and it cannot be implemented. `fileAccessWhere` is a predicate
over the `UserFile` row; once the row is gone there is nothing to evaluate it
against, so "could have opened it" has no answer at render time. The only way to
keep the placeholder is to persist an authorization snapshot on
`KnowledgePageSource` and check the reader against that — a point-in-time copy of
who could see a file, going stale the moment someone's access changes, existing
solely to decide whether to show a filename. Not worth it, and a placeholder
shown on a stale snapshot is the oracle we were avoiding.

Omitting it loses nothing that matters: **the fact that a source is gone reaches
the person who can act on it**, as the page's `STALE` finding in Brain, which is
access-controlled on its own terms. A reader of a chat answer cannot restore a
deleted document; the page's owner can re-curate it.

The page itself still cites normally; it is the second level that narrows per
reader, which also means two people can correctly see different source lists
under the same answer.

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
  `lastVerifiedBy`, `publishedFileId`, `publishedAt`, `publicationGeneration`,
  timestamps.
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
  the referenced file is gone, it raises the page's `STALE` finding and tells the
  renderer to omit that source rather than attempt a lookup that cannot succeed
  (see "Withdrawal" for why it is omitted rather than shown as a placeholder).

  **Something has to write it**, and no foreign key will: that is the price of
  the column being plain. The document-delete path sets `sourceDeletedAt` on
  every `KnowledgePageSource` naming the file, in the same transaction as the
  delete, and raises or updates the owner's `STALE` finding. A **reconciliation
  sweep** — sources whose `fileId` matches no live row and whose
  `sourceDeletedAt` is null — is the safety net, and it is not optional: it
  covers files deleted before this feature existed, bulk deletes down paths
  nobody remembered to touch, and the transaction that half-committed. Both are
  idempotent: setting a timestamp that is already set, and resolving to a
  finding that already exists, change nothing.

  **Not the event bus**, though it is the obvious home for a lifecycle
  side-effect. `docs/event-bus.md` says of itself that it is in-process and
  non-persistent, that events are "lost on crash or missed by other instances in
  a multi-instance deploy", and that durability wants a DB write or a job. A
  citation that silently keeps pointing at a deleted document is exactly the
  failure that instruction is there to prevent.

- **`KnowledgeEdge`** — `fromPageId`, `toPageId`, `kind`, `origin`
  (`EXTRACTED | INFERRED | AMBIGUOUS`), `confidence`. The origin distinction is
  taken from SwarmVault and is the difference between a graph you can trust and
  a graph that looks impressive.
- **`KnowledgeFinding`** — `type`
  (`CONTRADICTION | GAP | STALE | ORPHAN | UNOWNED | EXTRACTION_FAILED`),
  `severity`, `pageIds`, `fileId`, `detail`, `status`
  (`OPEN | RESOLVED | DISMISSED`), `detectedAt`. **Both subjects are optional
  and at least one is always set**: `CONTRADICTION` carries two or more
  `pageIds` and no `fileId`; `GAP`, `ORPHAN`, `STALE` and `UNOWNED` carry one
  page; `EXTRACTION_FAILED` carries a `fileId` and an empty `pageIds`, because
  it is about a document that produced no page. Empty rather than null for the
  array, so a reader never has to tell the two apart. `STALE` and `UNOWNED` are
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
  `publicationGeneration`, `before`/`after` JSON, `createdAt`. No update and no
  delete; the widening rule and the publish/withdraw history are enforceable
  only because this exists. `PUBLISH` and `UNPUBLISH` rows are **unique on
  `(pageId, action, publicationGeneration)`** — an append-only row cannot be
  made idempotent by repeating it, so a retried publication has to collide with
  its own row rather than append a second one (see "Withdrawal").
  **`publicationGeneration` is null for every other action.** Approving, merging
  or setting an owner has no generation to carry, and a default of `0` would
  make the unique constraint reject the second `APPROVE` on a page — an audit
  ledger refusing to record a legitimate act. Null is the honest value and the
  constraint ignores it.
- **`EmbeddingStatus`** gains **`STAGED`** and **`WITHDRAWN`**. `STAGED` is an
  uploaded document parsed and deliberately not embedded, awaiting curation.
  `WITHDRAWN` is a published page's file after an unpublish. Both are distinct
  from `NOT_STARTED` (queued, will be) and from `CANCELLED` (someone stopped
  it); a state that means "this is fine and it is not in the index" has to be
  its own value or the document list cannot tell the user the truth.

  **They are two values rather than one on purpose, and an earlier draft had it
  wrong.** Reusing `STAGED` for a withdrawn page put it in the set that _send to
  the knowledge base_ (F5) promotes, so the one action meant to rescue staged
  uploads would have re-indexed exactly the pages a person had just withdrawn —
  and left them retrievable with `publishedAt` still null, the state everything
  above is arranged to prevent. F5 selects `STAGED`, so `WITHDRAWN` is excluded
  by construction rather than by a rule someone has to remember. A withdrawn
  page returns to the index only through publish, which is the only thing that
  sets `publishedAt`.

**Migration and existing rows.** Every model is new and the enum member is
additive, so there is no backfill: no row written before this change carries either new status,
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
  deleted source drops out of the rendered citation for every reader; the
  finding is how the fact reaches the page's owner, who is the only person who
  can do anything about it. Deleting a document must not silently rewrite
  curated knowledge — and the row surviving is what keeps it from doing so.
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

- [x] **A1.** `packages/brain-contracts`: Zod schemas for the page frontmatter
      and the bundle manifest (§18 of the research), plus the published-file
      metadata shape. Tests for valid and invalid input.
- [x] **A2.** Prisma: the five models, the `STAGED` and `WITHDRAWN` enum members, and the
      migration. `npm run verify` green, no behaviour change.
- [x] **A3.** The five models into `TENANT_SCOPED_MODELS`; `brain` into
      `FEATURE_KEYS`, code default `false`.
- [x] **A4.** `lint-staged.config.mjs` entries for the new workspaces.

**What Phase A settled that the text above left open:**

- **Every model carries `organizationId`**, not only `KnowledgePage` — A3 puts
  all five in `TENANT_SCOPED_MODELS`, and the guard can only see a direct
  column. The children reference their page through `(pageId, organizationId)`,
  so a source, edge or decision cannot point at another organization's page;
  `publishedFileId` and `supersededById` are composite for the same reason.
- **The bundle vocabulary is the schema's, spelled the same** (`PROCESS`, not
  `process`); `brain-vocabularies-match-the-schema.test.ts` keeps them equal.
  An export carries `APPROVED` and `STALE` pages only.
- **The published-file metadata is nested** as `metadata.brain` —
  `{ pageId, contentHash, publicationGeneration }` — because `metadata` already
  holds parser output. The text above was changed from `brainPageId` to match.
- **Three guarantees live in the database**, in the migration: a finding has a
  subject; a publication generation appears on `PUBLISH`/`UNPUBLISH` and
  nowhere else; `knowledge_decisions` refuses `UPDATE` (a trigger — `DELETE`
  stays possible so an organization can be deleted).
- **Deletion is refused where history would be lost.** A page with decisions
  is a `NO ACTION` foreign key: a plain delete fails, and deleting the
  organization, which cascades to both sides in one statement, still works —
  `RESTRICT` would have made organizations undeletable. The published file is
  `NO ACTION` too, but `user_files` has **no** foreign key to `organizations`,
  so that one only refuses a direct delete of the file; see E10.
- **A finding's subject is checked per type** in the database: `CONTRADICTION`
  two or more pages and no file, `EXTRACTION_FAILED` a file and no page, every
  other type exactly one page.
- **`KnowledgePageSource` keeps the `quote`**, the cited words verbatim, beside
  `span` and `hash`. The spec had only `span` and `hash`, and a hash cannot be
  searched for: C2's "did the active version move on" check asks whether the
  cited words still occur in the new text, and a citation has to show them.
- **`KnowledgeFinding.severity`** is its own enum (`LOW | MEDIUM | HIGH`), not
  `SecurityEventSeverity`.

### Phase B — Extraction, no interface

- [x] **B1.** `packages/brain-core`: extraction of entities, facts and claims
      with span citations, as a structured-output call through the gateway.
      Unit tests against fixture documents.
- [x] **B2.** The intersection rule for `accessibleBy`, as a pure function with
      its own tests, including the case where the sources share no principal.
      Written before anything can call it wrongly.
- [x] **B3.** `packages/jobs`: `brainExtract` + payload. `apps/worker` handler
      writing `CANDIDATE` pages, sources and edges. Job-runtime test.
- [x] **B4.** A per-run extraction budget, enforced at the call site.
      _Two call sites: the handler counts documents before starting each one,
      and `extractDocument` checks the tokens left before every model call.
      Limits: `BRAIN_EXTRACT_MAX_DOCUMENTS` (200) and `BRAIN_EXTRACT_MAX_TOKENS`
      (2,000,000), read by an activity when the run starts._
- [x] **B5.** A script that runs extraction over one project and prints what it
      produced — enough to judge quality on our own documents before any UI.
      _`apps/worker/src/scripts/brain-extract-preview.ts`; dry run by default,
      `--write` persists through the job's own code and needs the flag._

**What B1 and B2 settled:**

- **The model call is injected.** `brain-core` owns the prompt, the schema,
  the retry and the rules; `apps/worker` binds `generate` to the gateway. So
  the package has no `ai` dependency and its tests need no model.
- **Every claim carries a verbatim quote, and a quote that does not occur in
  the source is dropped** — checked against the whole document, tolerant of
  whitespace, typography, case and soft hyphens, and of nothing else. An
  entity left with no verified claim is not a page. This is the mechanism
  behind "citations back to the exact source span": the citation is checked,
  not asserted.
- **An edge's origin is earned**: a relation whose quote verifies is
  `EXTRACTED`, one whose quote does not is `AMBIGUOUS`, one offered without a
  quote is `INFERRED`.
- **A failed extraction's reason carries no document text.** Schema issues are
  reduced to paths and codes, a thrown error to its class name — the reason is
  fed back to the model and stored in an `EXTRACTION_FAILED` finding people
  read, and the AI SDK's errors carry the request body.
- **The intersection is conservative about teams.** A source reachable at
  `org:` constrains nothing; among the rest, a principal survives only if every
  source lists it verbatim — `user:u` and `team:hr` intersect to nobody even
  when u is in hr, because proving otherwise needs a membership lookup and
  being wrong is a leak. A source with no principals empties the result.
- **A document that hits the budget part-way returns nothing**, not the
  windows it finished: half a policy extracted is a confident summary of half
  a policy.

**What B3 settled:**

- **The flag is checked when the job runs**, not only when it is queued, by
  an activity feeding the same `resolveFeatures` apps/web gates on. That
  needed `pickBestSubscription`, which web, api and admin each carry a copy
  of; it now also lives in `platform-contracts`, and the worker uses that one.
  Folding the three older copies into it is its own change.
- **The text extracted is the active `DocumentVersion`'s**, and so is the id
  each source is pinned to — never `UserDocument.content` beside a version id
  read separately.
- **A re-run converges.** Extracting a document again replaces the candidates
  an earlier run of the same document left, but only those nobody has
  touched: a `CANDIDATE` whose every source is that file and which has no
  decision. A page someone set an owner on stays, and the fresh candidate gets
  a suffixed slug beside it for the review queue to merge. This is also what
  makes a BullMQ redelivery harmless.
- **A provider outage on both attempts is a failed document, not a failed
  step.** It raises `EXTRACTION_FAILED` like a bad answer does, and D3's retry
  is the way back — the run carries on with the next document.
- **One open `EXTRACTION_FAILED` per document.** A second failure refreshes the
  first; a success resolves it.
- **Usage is recorded as `CHAT_COMPLETION`** with `metadata.kind:
  brain_extract`, as the RAG scorer does. A step of its own on the AI-usage
  page is a separate decision.

**What B5 found on its first real run** (2026-09-23, `gemini-2.5-flash` on
Vertex, one 1,240-character Polish terms-of-service document):

- **The first run failed before extracting anything.** Vertex refuses a
  response schema whose length limits and array bounds compile to too many
  states. The model is now constrained to the shape alone
  (`extractionProviderSchema`), and the limits are applied afterwards, per
  item (`parseExtraction`), so one over-long quote drops one claim, counted as
  malformed, instead of failing the window. Nothing but a real call would have
  found this: every unit test hands `generate` a fixture.
- **Result:** 8 candidate pages, 18 claims, **0 dropped by the quote check**,
  0 malformed, 7,441 tokens. Access was the uploader's private principal,
  which is the intersection working as designed.
- **Three quality gaps to settle before D, each a prompt question to measure
  rather than guess (ADR-20):**
  - page descriptions came back in English while the statements were Polish;
  - some quotes are very short ("NIP 7412998301"), true but weak anchors;
  - the model returned **no relations** for a document with obvious ones
    (plans ↔ payments), so the graph (C4) has nothing to draw yet.
- **Output tokens include thinking.** 2,525 of one call's 4,971 output tokens
  were Gemini's reasoning, and they count against `maxOutputTokens` (8,000)
  and the run budget alike.
- **A transient provider error on both attempts becomes EXTRACTION_FAILED**,
  as designed — seen once (`AI_RetryError`), and the retry after succeeded.

**The three gaps, measured and closed (2026-09-23).** `brain-extract-eval.ts`
runs the job's extraction over the 13 text fixtures already in the repository
(`kolej-bilingual-v1`, `tabele-bilingual-v1`, `regulamin-wilczy-mlyn`; 7 Polish,
6 English), twice each, and measures the gaps. Same model, same corpus, before
and after:

| | before | after |
| --- | --- | --- |
| documents that failed | **12 / 26** | **0 / 26** |
| claims dropped by the quote check | 9.2 % | 0.6 % |
| descriptions in the wrong language (Polish documents) | 32.2 % | 0 % |
| quotes under 30 characters | 13.1 % | 1.6 % |
| claims (all runs) | 268 | 708 |
| edges per document (share `EXTRACTED`) | 4.36 (95 %) | 3.62 (75 %) |
| tokens | 358,038 | 198,097 |

What did it, and what the measurement found that B5 had not:

- **The worst gap was not one of the three.** Nearly half the extractions
  failed: Gemini's thinking and the answer share `maxOutputTokens`, the JSON
  was cut off, and the SDK had no object. Fixed by bounding thinking
  (`thinkingBudget` 2,048, sent under both the `google` and `vertex`
  namespaces) and raising the cap to 16,000.
- **Tables were the rest of it.** Asked for whole sentences, the model split
  a price list into a claim per cell (14,600 output tokens for 3,400
  characters); told one claim per row, it made every row its own entity (39
  candidates from one table). The prompt now says a table is one entity and
  its rows are claims.
- **Language:** named outright from `UserFile.language` rather than "the
  language of the excerpt".
- **Short quotes** are widened deterministically to the sentence, list item
  or table row they sit in, cut from the source (`expandToSentence`) — still
  verbatim, and not something the prompt has to win. It knows Polish
  abbreviations ("sp. z o.o.", "ul.", "art.").
- **Markdown emphasis was the largest cause of dropped claims.** Docling writes
  `**EUR 44**`, a model quoting the sentence writes `EUR 44`; the quote check
  now ignores `*` and backticks, as it already ignored typography.
- **Relations were not a gap.** The baseline already had 4.36 per document;
  B5's single document with none was that document. The prompt now names the
  kinds of relation it wants, and the count did not move beyond run-to-run
  variance — it is kept for its wording, not on evidence. C4 is where to
  measure it properly.
- **Vertex rate-limits two concurrent extractions** (429 during the eval).
  Now limited: `BRAIN_EXTRACT_CONCURRENCY` (default 1) caps `brainExtract`
  runs across every replica, through a `jobConcurrency` option in
  `@ragenai/jobs-bullmq` that sets BullMQ's global concurrency on the queue
  before any worker consumes, and the model call retries four times with the
  SDK's backoff instead of two. Proven against a real Redis: two replicas at
  a ceiling of 1 never ran two at once, and with the global setting removed
  they did. **The Temporal adapter has no equivalent** — it lives in
  `ragen-enterprise`, and a Temporal install limits this on its task queue.

### Phase C — Findings and graph

- [x] **C1.** Contradiction detection over extracted claims → `KnowledgeFinding`.
      _Pairs and the judge: `packages/brain-core/src/contradictions`; run by
      `detectContradictions` at the end of every `brainExtract`, on what is
      left of the run's tokens; measured by `brain-contradiction-eval.ts`._
- [x] **C2.** Gap, orphan, stale and unowned findings as queries over the pages'
      own fields. `STALE` covers both a deleted source (`sourceDeletedAt`) and a
      source whose active `DocumentVersion` moved past the pinned one.
      _Rules: `packages/brain-core/src/findings`; reads and writes:
      `apps/worker/src/services/db/brain-findings.ts`; run by
      `reconcileBrainFindings` at the end of every `brainExtract`._
- [x] **C3.** `EXTRACTION_FAILED` findings raised by the extract handler, per
      document, carrying the error. _B3 raised it for every failure the
      activity sees; C3 added the one it cannot — a step that throws through
      its retries — so no document fails the run._
- [x] **C4.** Graph assembly (`graphology`, Louvain communities) with
      `EXTRACTED` / `INFERRED` / `AMBIGUOUS` kept distinct.
      _`assembleGraph` in `packages/brain-core/src/graph`; the `graph.json`
      contract is `knowledgeGraphSchema` in `brain-contracts`. No consumer
      yet — D4's view and E1's export are the two._

**What C2 and C3 settled:**

- **The four rules judge curated pages only** (`APPROVED`, `STALE`). Every
  candidate is unowned and most are unlinked by construction; run over
  candidates, the rules would bury the findings that matter under hundreds
  saying "not reviewed yet". The review queue is how a candidate is judged.
- **UNOWNED includes an owner who has left** — `ownerId` set to someone no
  longer a member. A null check alone reports that page as owned.
- **STALE from a source is two conditions, not one.** A deleted source
  (`sourceDeletedAt`, *or* no file row at all — E5 writes the column, and the
  rule does not wait for it), or an active version that moved past the pin
  **and no longer contains the cited words**. A moved version that still
  contains them is not stale: re-ingesting the same PDF mints a new version
  with the same text, and flagging each one would train people to dismiss
  the finding. A file with no active version is not checked rather than
  guessed at. `verifyEvery` elapsed is the third reason, counted from
  `lastVerifiedAt`, or from the latest `APPROVE` decision if never verified;
  a value that is not an ISO-8601 duration never comes due.
- **GAP is one rule: a `PROCESS` page with no edge to any `ROLE` page** — a
  process nobody is named as performing. It is the completeness check the
  data supports today; "an entity mentioned and never described" would need
  the relations extraction currently drops, and is the natural second rule.
- **ORPHAN is no edge to or from any non-rejected page**; an edge to a
  candidate counts, a self-loop does not.
- **One finding per page per type**; a page stale for three reasons has one
  `STALE` listing them. **The finding carries no document text** — source
  ids, version ids, a date.
- **Findings are a view, stored as a diff.** `reconcileFindings` compares
  what holds now with the stored rows: an open row whose condition is gone is
  resolved, one whose reasons changed is updated in place (its id survives),
  and a **dismissal stands for as long as the problem is the same** — a
  `fingerprint` of the reasons, so a second deleted source on a page
  dismissed for the first is raised again. Writes are conditioned on
  `status = OPEN`, so a dismissal made mid-run has the last word.
  `CONTRADICTION` and `EXTRACTION_FAILED` are never touched by it.
- **Severity**: `HIGH` when the page is serving in the index (`publishedAt`)
  and the problem is its owner or its sources; `LOW` for ORPHAN and GAP.
- **When it runs**: at the end of every extraction run, and a failure there
  is `findings: null` in the run's result, never a failed run. A
  `verifyEvery` that comes due between runs is found at the next one;
  scheduling is G1's.
- **Verified against a real Postgres** with the migration applied, not only
  against mocks: five findings from a seeded organization, none on the second
  run, and dismissal, an owner rejoining and a new `ROLE` edge each resolving
  or holding as above.

**What C4 settled:**

- **Two structures, on purpose.** The output keeps **every edge as
  extracted**, so the same pair related by a quoted sentence and by a guess
  is two edges. Communities are found on a collapsed, undirected, weighted
  copy, because Louvain takes no multigraph: a pair weighs the sum of its
  edges, **`EXTRACTED` 1, `INFERRED` 0.5, `AMBIGUOUS` 0.25**. A test proves
  the weights change the grouping (four guesses do not pull a page away from
  one stated link), and sabotage with uniform weights fails it.
- **Deterministic.** Louvain is randomised; a seeded PRNG makes the graph a
  function of its pages, so a view does not regroup on reload and two exports
  of the same pages are byte-identical. The test uses a ring, which has
  several equally good partitions, because a clear two-cluster graph came out
  the same under `Math.random` too and proved nothing.
- **A subset drops its edges.** An edge naming a page not given is dropped,
  and the contract refuses one: an export of approved pages must not name the
  candidates it left out.
- **Measured** (2026-09-23, `brain-extract-eval.ts`, same 13 fixtures × 2,
  `gemini-2.5-flash`), with the graph metrics added to the eval:

  | | all runs | without the one outlier run |
  | --- | --- | --- |
  | pages | 166 | 127 |
  | edges per document | 4.96 | 3.64 |
  | share `EXTRACTED` | 49.6 % | 70.3 % |
  | pages with no edge | 11.4 % | 15.0 % |
  | pages per community | 3.02 | 2.35 |
  | documents with no edge at all | 2 / 26 | 2 / 25 |

  There is a graph to draw: every document but two has edges, and 85–89 % of
  pages have at least one. English documents are sparser (21 % isolated
  against 6 % for Polish).
- **The outlier is the table problem coming back.** One of the two runs of
  `pl-02-stawki-serwisowe` made every price-list row its own entity again —
  39 pages and 38 edges, **all `INFERRED`** — the shape B's prompt change
  fixed on the runs it measured. It recurs about one run in two on that
  document, so it is variance the prompt has not removed, not a closed gap.
  It is also the case for keeping origins apart: those 38 guesses would
  otherwise read like structure.

**The table split, settled (2026-09-23).** A four-run probe of the three
table documents found it on the *English* price list, 2 runs of 4 — so it
was variance across documents, and two repeats had been too few to see it.
It also found a second loss nothing had counted: a split run **stops
part-way**, 39 claims where the good runs have 54, so fifteen rows never
reached curation.

Fixed after the answer rather than in the prompt, as B did short quotes
(`consolidateTableRows`, `packages/brain-core/src/extraction/tables.ts`):

- **An entity whose every verified claim sits inside one markdown table is a
  row**, and two or more rows of one table fold into one page — the entity
  the heading above the table names, when the model made one; else a
  row-entity already holding most of the table (two claims at least, more
  than half); else a page titled by the heading and described by the first
  sentence of prose above the table, verbatim. An entity with any claim
  outside the table is described in prose, is the prompt's own exception,
  and stays its own page. Edges follow the fold; ones between two rows of the
  same table become loops and go.
- **A folded table's uncited rows are added from the table**: the row
  verbatim as the quote, its cells under the table's own column names as the
  statement ("Kod usługi: SR-201; Nazwa usługi: Toczenie CNC; …"), so in the
  document's language with no model writing it. Only for a folded table — a
  table the model used in part on purpose is not one it split.
- The eval now reports **table-row coverage** (data rows some kept claim
  cites) and the runs that needed folding.

Measured: on the probe's twelve saved answers, the two split runs went from
39 pages and 39 claims to **4 pages and 54 claims** — the good runs' shape —
and the ten good runs did not change. The full eval (13 fixtures × 2) then
split once, on the same document, and folded it the same way: table-row
coverage **100 %**, no run failed, and every other metric within C4's
baseline without the outlier (edges 72.7 % `EXTRACTED` against 70.3 %,
14.3 % of pages isolated against 15.0 %).

**What C1 settled:**

- **Which pages are compared**: the same title once normalised (`slugify`,
  the key extraction merges entities on), **different sets of source
  files**, and at least one page citing a file this run extracted. A pair of
  old pages was judged when the second was written; two pages citing the same
  files are a re-extraction of one document. **Recall is bounded here, not
  in the judge**: "Urlop" and "Urlop wypoczynkowy" are never compared. That
  is entity resolution — the review queue's merge (D2) — and an embedding
  match is the natural next step if it proves to matter.
- **The judge compares passages, not statements**: the verbatim quotes the
  pages' sources carry, numbered, so what it weighs is what the documents
  say rather than the extraction model's rewording. It answers with passage
  numbers; one naming a passage that was not shown is dropped. A
  contradiction is therefore **two source ids**, which D2 shows side by side
  without trusting the model's account of either. Up to 60 passages a side
  (`truncated` in the finding when cut).
- **One finding per pair of pages**, `pageIds` sorted. A dismissal stands
  while the set of contradicting passages is the same (the fingerprint is
  source-id pairs, so a reworded explanation does not reopen it); a pair
  judged clean again resolves its open finding; `HIGH` when either page is
  published. Replacing a candidate on re-extraction resolves open findings
  naming it, in the same transaction.
- **The finding's `detail` carries the model's explanation** — one sentence
  naming both values. That is document-derived text, the same class as a
  page's content, so D1's findings list must show a finding only to a reader
  who may see every page it names.
- **Cost**: one call per pair, on the run's token budget, at most
  `BRAIN_CONTRADICTION_MAX_PAIRS` (100) a run; usage recorded as
  `metadata.kind: brain_contradictions`. A pair not reached is judged by the
  next run touching either page. A failed judgement is counted and logged,
  not raised — it is not a finding about either page.
- **Measured** (2026-09-23, `gemini-2.5-flash`, 15 labelled pairs × 3): eight
  planted contradictions, one of them implicit and one hidden among four
  passages, and seven traps the prompt names — a paraphrase, the same
  quantity in other units, an explicit difference of scope, one side more
  detailed, a translation, a stated change over time, different facts.

  | | v1 | v2 |
  | --- | --- | --- |
  | contradictions found (recall) | 24 / 24 | 24 / 24 |
  | clean pairs reported anyway | 1 / 21 | 0 / 21 |
  | reported items that were expected | 96.0 % | 100 % |
  | explanations of Polish pairs in English | 11 / 22 | 0 / 24 |
  | tokens | 34,198 | 35,071 |

  v2 named the explanation language outright (from the files'
  `UserFile.language`, as B did for extraction) and added one rule — silence
  is not disagreement — after v1's one false alarm, on the "more detailed"
  trap. That one alarm is within noise on 21 runs; the language change is
  not. The eval's language heuristic flagged one v2 explanation that reads
  as Polish on inspection (no diacritics, no listed stopword), so it is
  counted as right. **This is a fixture of written pairs**, which is what a
  judge can be measured on without a corpus that has planted contradictions;
  pair selection on real documents is untested by it.

### Phase D — Review interface

- [x] **D1.** `apps/web` panel routes behind the `brain` flag: page list, page
      view with its sources, findings list. Read-only.
      _`/brain`, `/brain/pages/[publicId]`, `/brain/findings`; queries in
      `apps/web/src/features/brain`; `smoke-15-brain` gates it._
- [x] **D2.** The review queue: merge candidates, set owner, set access,
      approve, reject — every action writing `KnowledgeDecision`. Widening
      access is a distinct action with its own confirmation.
      _Split in two. **D2a (done):** set owner, set access / widen access,
      approve, reject, on the page view, with the page's ledger listed under
      History; commands in `apps/web/src/features/brain/services/commands`,
      `p0-33-brain-review` gates it. **D2b (done):** merge, and the
      `brainReconcileFindings` job the panel starts after every decision;
      `p0-34-brain-merge` gates it._
- [x] **D3.** Retry an `EXTRACTION_FAILED` document from the findings list:
      re-runs `brainExtract` for that document alone and resolves the finding on
      success.
      _Plus the panel's way to start a run at all: "Extract from documents"
      in the Brain header, over chosen documents (up to 200 per run, ones no
      page cites preselected). Before this a run could only be started from
      the preview script. The worker's `getExtractionSource` now finds the
      document through the relation, as D1 asked._
- [x] **D4.** Graph view (Sigma.js or react-force-graph), scoped to a
      neighbourhood — a graph that hangs the tab on a real corpus is a demo that
      fails at the customer's data volume.
      _`/brain/graph`: sigma v3 on graphology, laid out by ForceAtlas2 in the
      browser. Never the whole graph — an overview (pages with open findings
      pinned, then the most connected) or one page's neighbourhood at 1 or 2
      hops, within a budget of 150/300/600/1000 nodes the server clamps
      (`selectGraphView` in brain-core). The count says "X of Y" under the same
      edge filter as the drawing. INFERRED edges are hidden unless asked for;
      origin is shown by width and colour and named in the legend and the node
      card. Colour is the Louvain community, from chart tokens resolved to RGB
      in the browser, never the signal crimson. The layout draws on
      SwarmVault's and Utopia's graph views (budgeted overview, neighbourhood
      fetch, "X of Y")._
- [ ] **D5.** Flag on for our own organization. The first phase a user can see.

**What D1 settled:**

- **Owners and admins only** (decided 2026-09-23). Brain is a curation tool,
  and an organization manager's visibility (`orgVisibilityScope` =
  `organization`) already covers every document a page came from, so the
  panel needs no per-page filter to be correct — which also closes C1's open
  question of who may see a contradiction's explanation. Members reach
  curated knowledge through retrieval once it is published (E), with the
  page's `accessible_by` on its chunks. A platform admin is **not** let in by
  that role: this is the customer's knowledge.
- **Every route answers 404 otherwise**, flag off included, so a member
  cannot tell a disabled feature from a missing one; the layout asks, and so
  does each page, because a layout does not guard its segments. The sidebar
  link answers the same predicate (`canUseBrain`), not `userIsOrgAdmin`,
  which would show a platform admin a link to a 404.
- **A source's state is read, not stored**: `current`, `newer-version` (the
  document's active version is past the pin — the quote shown is still the
  pinned text), `deleted` (`sourceDeletedAt`, or no file row). **The document
  is found through `UserDocument.fileId`**, the relation; `UserFile.documentId`
  is a copy ingest writes afterwards, and the e2e seed — like any file whose
  bind step did not run — has the document without it. The worker's
  `getExtractionSource` still reads the copy; worth moving to the relation
  before D3 retries files in bulk.
- **Access is shown exactly** (`docs/panel-ux-rules.md` rule 22): one line per
  principal, named; another organization's `org:` or a malformed string is
  "nobody"; an empty list says a decision is needed. Nothing rounded up.
- **Findings' `detail` is read tolerantly** — a Zod schema per type, and a
  shape it does not know renders as "no detail" rather than an error page —
  because the panel reads rows several worker versions may have written.
- **i18n**: 85 keys in 15 locales. The repository's parity guard reads only
  client `useTranslations` and only en/pl, and these are mostly server
  components, so `features/brain/__tests__/brain-messages.test.ts` checks that
  every key the Brain routes use exists and that every locale has the same
  set.

**What D2a settled:**

- **The page and its ledger row are one transaction**, and the page row is
  locked (`FOR UPDATE`) while the decision is made. Every action carries the
  `updatedAt` the reviewer saw; a page changed since is refused as
  `conflict` rather than decided on top of a state nobody looked at. A
  request for what the page already is writes nothing — the ledger records
  acts, not clicks.
- **Approval needs an owner who is still a member.** The owner is who
  vouches for the page, and an unowned page can be neither exported nor
  published, so approving one would create curated knowledge nothing may use
  and an `UNOWNED` finding at the next reconciliation. Setting the owner is
  its own decision, before approval. Any member may be named, whatever their
  role.
- **Only a `CANDIDATE` is approved or rejected.** Re-approving a `STALE` page
  means re-pinning its sources to the versions the reviewer now read, and
  retiring an approved page is withdrawal and supersession (E); neither is
  built.
- **The server classifies widening, with `isWidening` from
  `@ragenai/brain-core`** — the package that computed the narrow default at
  extraction. A change that adds any reader is `WIDEN_ACCESS`, even if it
  also removes others, and is refused as `confirm-widening` until the
  reviewer confirms in a dialog that names who gains access. Anything else is
  `SET_ACCESS`, saved straight away.
- **A principal that would match nobody is refused, not dropped** — another
  organization's `org:`, someone who is not a member, a team that is not this
  organization's — because it would be shown as access nothing grants.
  `org:<this org>` is stored alone: it already covers every `user:` and
  `team:` beside it.
- **Access on a published page is refused (`published`)** until E4 can carry
  the change onto its chunks. Nothing is published before E, so today this
  guards the order the phases land in.
- **Computed findings are not re-run after a decision yet.** They are a view
  the worker reconciles at the end of each extraction run, so a new owner's
  `UNOWNED` finding stays open until the next run. D2b adds a job for it; the
  panel does not write computed findings itself, because a second writer is
  how the view and the rows would drift.

**What D2b settled:**

- **A merge folds a candidate into another page; the target stays.** It keeps
  its title and gains the absorbed page's claims and sources, renumbered so
  each `[n]` still names its quote (`mergePageContent` in brain-core). A claim
  whose quote the target already cites — same file, version and quote — is
  dropped, because re-extraction produces exactly those.
- **Only the shape `renderPage` writes is merged.** Anything else is refused
  as `unmergeable` rather than guessed at: the numbering is what a reviewer
  checks, and a merge that shifted it would point claims at the wrong quotes.
  The test builds its pages with `assembleCandidates`, so a renderer change the
  merge cannot read fails there.
- **The target's access becomes the narrower of the two**
  (`intersectPrincipals`), and **an approved target returns to `CANDIDATE`** —
  it now says things nobody approved. A merge never widens access.
- **The absorbed page is rejected and superseded by the target**, not
  deleted, and both get a `MERGE` row. Its page view links to the target.
  Relations move to the target; the one between the two is dropped, and where
  both had a relation the stronger origin wins.
- **Suggestions are same title or same slug without its numeric suffix** —
  the suffix `replaceCandidatesFromFile` gives a fresh candidate it will not
  put over curated work. Two names for one subject are not found, the same
  limit C1 has; embeddings are the next step for both.
- **Computed findings are re-run after every decision** by
  `brainReconcileFindings`, started after the commit. A failed enqueue is
  logged and does not fail the decision; the next extraction reconciles
  anyway. The panel still never writes computed findings itself.
- Contradiction findings naming a merged-away page are left as they are: a
  person reads them, and C1's next run judges the merged page again.

### Phase E — Publication, withdrawal, export

- [ ] **E1.** Bundle export: markdown with frontmatter + `graph.json` +
      manifest, written through `packages/storage`, downloadable. Approved pages
      with an owner only.
- [ ] **E2.** Publish: an approved page becomes a `UserFile` carrying
      `metadata.brain.pageId`, ingested with predefined chunk boundaries and the
      curated `accessible_by` — never the source file's. The generation bump,
      `publishedAt` and the `PUBLISH` decision go in one transaction before the
      chunks are written, the file ends `COMPLETED` (including on a republish
      out of `WITHDRAWN`), and the page's publication generation is checked at
      each step.
- [ ] **E3.** Unpublish: delete the page's chunks, set the file to
      `WITHDRAWN`, clear `publishedAt`, keep the page approved and its
      `UserFile`, record the `UNPUBLISH` decision — the last four in one
      transaction. Each step idempotent, in that order, so any interruption
      leaves a state a retry finishes. Tests that publish and unpublish cannot
      interleave into chunks-without-publication, and that a retried
      publication writes exactly one decision row.
- [ ] **E4.** An access change on a published page reaches its chunks, through
      the existing vector-permission sync. Narrowing writes the chunks first,
      widening writes the page first, so neither leaves retrieval more
      permissive than the decision. Tests both directions; narrowing is the one
      a customer audits.
- [ ] **E5.** Deleting a source document sets `sourceDeletedAt` on every
      `KnowledgePageSource` naming it, in the delete's own transaction, and
      raises the owner's `STALE` finding. Plus the reconciliation sweep for
      sources whose file is gone and whose timestamp is not set — both
      idempotent, both tested.
- [ ] **E6.** `tests/architecture/brain-export-never-widens-access.test.ts`.
- [ ] **E7.** Re-publication by diff: `contentHash` per page, re-embed only what
      changed, delete what was removed.
- [ ] **E8.** Two-level citation rendering in `apps/web` and `apps/api`:
      `metadata.brain.pageId` → `KnowledgePageSource` → source documents,
      resolved against the pinned `documentVersionId` and filtered by the same
      file predicate as any other read (`fileAccessWhere`). A test that a reader
      who may see a widened page but not its sources gets the page and no source
      list.
- [ ] **E9.** Take a curated source document out of retrieval — per document,
      human-triggered, reversible by re-running ingest. Mode 1's path to a clean
      index, and never automatic.
- [ ] **E10.** Every path that deletes `UserFile` rows excludes or refuses a
      published page's file **before any side effect runs** — found in Phase
      A's review, because the foreign key alone refuses the delete only at the
      final transaction. Today that is `delete-folder-command.ts` (storage,
      vectors and audit entries already gone by then, so one published file in
      a folder leaves the rest half-deleted), `delete-file-command.ts`, the
      project delete in `apps/api/src/projects/projects.service.ts`, and
      `apps/api/src/documents/files.service.ts` — the last three answer with a
      raw P2003 instead of a refusal a person can read. Decide in the same step
      whether a published file carries a `folderId` / `projectId` at all. The
      e2e and perf seeds delete files before organizations, so they delete the
      organization's knowledge pages first.

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
      idempotent, and not gated on the `brain` flag. It selects `STAGED` only —
      a `WITHDRAWN` page's file is not promotable, and a test says so.
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
  through the admin panel (ADR-35). Every Brain route and job checks it, **with
  one deliberate exception**: _send to the knowledge base_ (F5) does not. It is
  a knowledge-base operation on a file that happens to be staged, and it is the
  only way out for staged files if Brain is switched off — gating it behind the
  flag would strand exactly the documents the rollback path below exists to
  rescue. An implementer reading "every job checks it" as absolute would build
  that trap, so the exception is stated here and not only at F5.
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
  `STAGED` file — and on `STAGED` only, so a withdrawn page's file is never
  swept back into the index by it — which starts `runFileEmbeddings` for it with the destination
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
