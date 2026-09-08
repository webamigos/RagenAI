---
title: Knowledge analytics that explain a bad answer, not just count good ones
status: approved
areas: [rag, api, worker, knowledge-base]
adrs: [20, 21, 33]
---

# Knowledge analytics that explain a bad answer, not just count good ones

## TLDR

The Knowledge Analytics screen counts citations correctly as of #972, but a
citation is the _only_ thing it can see, so it can say which documents were
used and not which were ignored, which answers cited nothing, or which
documents sit behind the thumbs-down. This adds a `document_retrievals`
record — what the model was shown, kept beside what it cited — and the five
metrics that fall out of the difference. The non-obvious part is that the
public API path writes neither table today, so an organization answering
through `/v1/chat` sees an empty dashboard and no error.

## Problem

#972 fixed a wrong number: `DocumentCitation` rows were written from the
retrieval result, so on a three-document corpus every answer "cited" all
three. Citations now mean what the word says.

That fix threw away the other half. `selectCitedSources()` intersects the
retrieved set with the answer text and the retrieved set is then discarded, so
every question of the form _"the model saw this and did not use it"_ is
unanswerable:

- A document retrieved on every question and never cited is either mis-chunked
  or genuinely irrelevant, and today it looks identical to a document nobody
  asks about. It cannot even appear in "Documents Unused for 90+ Days" — that
  section reads citations, and a document retrieval keeps surfacing is not
  unused, it is _rejected_.
- An answer that cited nothing writes no rows at all, so the screen cannot
  distinguish "answered from the corpus" from "answered from the model's own
  knowledge" from "declined". ADR-20 asked for exactly this signal and the
  data to produce it does not exist.
- `positiveRatePct` is one number for the whole organization. Which documents
  back the negatively-rated answers is the actionable version, and the join
  (`rate` ⋈ citations) needs no new data — it was simply never written.

Second, unrelated to citations and found while verifying the screen: **"Top 10
Cited Documents" has no time window** while every other section uses 30 days.
A document heavily cited in March outranks one cited all week, on a screen
whose other panels disagree with it.

Third: `apps/api` — the public API, and the real backend per ADR-21 — writes
**neither** `DocumentCitation` nor anything else analytics reads. Its chat path
has its own copy of the chain, still returning `sourceFileIds` where apps/web
now returns `retrievedSources`. An organization that integrates through the API
gets a dashboard of zeroes with nothing to indicate why.

## Out of scope

- **Backfill.** No retrieval history exists and none can be reconstructed —
  the retrieved set was never persisted. Every new metric starts empty, the
  same "tracked from this point forward" the citations table already carries.
- **Changing retrieval to improve these numbers.** This spec measures. Acting
  on what it shows is ADR-20's loop and needs its own spec, and the
  `ragen-rag-change` skill's before/after discipline.
- **Per-chunk analytics.** Rows are per file, matching `DocumentCitation`.
  Which chunk of a document was retrieved is a different (and much larger)
  table, and no metric here needs it.
- **Exporting to an external BI tool.** CSV export per section stays the
  extent of it.
- **The public chatbot and guest threads.** Those already skip the citation
  write (`mode !== AssistantMode.PUBLIC`); an anonymous visitor's retrieval is
  not the organization's knowledge-base usage.

## Proposed solution

**A `document_retrievals` table mirroring `document_citations`**, written in
the same place, from the same `retrievedSources` the citation write already
consumes.

**And not a `cited` boolean on `document_citations`, because** the table would
then be mostly non-citations, its name would be a lie, and every existing
query — `getTopCitedDocuments`, `getUnusedDocuments`, and the two the demo
cleanup runs — would need `where: { cited: true }` adding, silently returning
inflated numbers wherever one was missed. Two tables, two facts, no migration
of existing rows.

**And not derive retrieval from an OTel span**, though `rag.retrieve` already
records `rag.file_count`: traces are sampled, expire, are a no-op unless
`OTEL_EXPORTER_OTLP_ENDPOINT` is set (ADR-22), and cannot be joined to a
`Message` row. A metric the product surfaces has to come from the database.

**Rank is stored**, because it is free at write time (the order of
`retrievedSources` after rerank) and cannot be recovered later. "The
top-ranked document was ignored" is a statement about the reranker; "some
document was ignored" is not.

**Both apps write both tables.** `apps/api` gains the citation write it never
had and the retrieval write at the same time, in the same phase as the
migration — deferring it would leave the two copies of the chain drifting
further apart, and ADR-21 already accepts that a fix in one usually needs the
same edit in the other.

**Retention is a nightly prune at 90 days.** The table grows with retrieved
files per message rather than cited ones — four to eight times the citation
rate — and 90 days covers both windows the screen uses (30 days for the time
series, the 90-day threshold for unused documents). A rollup to daily
aggregates was considered and rejected as premature: it adds a second table
and a job before there is evidence the raw rows are a problem, and the prune
is trivially reversible where a rollup destroys detail.

## Core surfaces touched

| Surface                       | Change                                                             | What catches a mistake                               |
| ----------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------- |
| `prisma/schema.prisma`        | one new model, two new relations on `Message` and `UserFile`       | migration + `npm run verify` (regenerates 3 clients) |
| `apps/web`                    | the retrieval write beside the citation write; five UI sections    | unit + component tests                               |
| `apps/api`                    | **both** writes, which it has never had; the new analytics queries | its own Jest suite — ADR-21, separate implementation |
| `apps/worker`                 | a retention workflow and its Temporal Schedule                     | worker Jest suite                                    |
| `packages/platform-contracts` | none — these metrics are read by one app                           | n/a                                                  |
| auth / tenant scoping         | `DocumentRetrieval` carries `orgId`, so the guard covers it        | `tenant-scope-guard`, `TENANT_SCOPED_MODELS`         |

`TENANT_SCOPED_MODELS` in `@ragenai/platform-contracts` must gain
`DocumentRetrieval`, or the new table is the one tenant-scoped model the guard
does not watch.

## Data model

```prisma
model DocumentRetrieval {
  id        Int      @id @default(autoincrement())
  messageId String   @map("message_id") @db.Uuid
  fileId    String   @map("file_id") @db.Uuid
  orgId     String   @map("org_id")
  /// 1-based position after dedupe and rerank. Free here, unrecoverable later.
  rank      Int
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

  message Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)
  file    UserFile @relation(fields: [fileId], references: [id], onDelete: Cascade)

  @@unique([messageId, fileId])
  @@index([orgId, createdAt])
  @@index([fileId])
  @@map("document_retrievals")
}
```

Deliberately identical to `DocumentCitation` apart from `rank`, so the two
read the same way and one query shape serves both.

**Existing rows are unaffected** — this is a new table, nothing is altered or
backfilled. Every metric below reads zero until the first answer after
deployment, which the empty states must say rather than implying no usage.

`onDelete: Cascade` from `Message` means deleting a thread takes its
retrievals, so the demo cleanup and ordinary thread deletion need no change.
`thread-deletion-must-remove-messages.test.ts` already guards the half that
matters.

## Failure modes

- **The write fails.** Fire-and-forget beside the citation write, same
  `.catch(logger.warn)`: analytics must never fail an answer the user is
  reading. The consequence is a hole in the data, which is the right trade.
- **Retrievals written, citations not** (the process dies between the two
  `createMany` calls). Reads as "retrieved and never cited" — the metric
  over-reports. One `$transaction` for both writes, since they describe the
  same turn.
- **Nothing was retrieved.** No rows, which is indistinguishable from a
  conversation-mode turn that never queried the corpus. This is why Phase F
  needs a per-message marker and is not simply "count messages with no
  retrieval rows".
- **A document is deleted.** Cascade removes its retrievals, so historical
  rates shift under a deletion. Accepted: the alternative is retaining rows
  pointing at files the organization asked to remove.
- **The prune races a read.** A dashboard request during the nightly job sees
  a partially pruned window. Harmless at a 90-day boundary; the job runs at
  03:00 like the demo cleanup.
- **The prune never runs** (schedule not created — the failure ADR-26's
  script comment warns about). The table grows; nothing breaks. The schedule
  script prints what it targeted, as the demo one does.

## Phases

Phase A is independent of everything else and fixes a live inconsistency.
Phases D, E and F need no new data either, and are ordered by the value the
brief assigned them rather than by cost.

### Phase A — one time window for the whole screen

- [ ] **A1.** A period selector (7 / 30 / 90 days) on the dashboard, replacing
      the hardcoded `days = 30`, threaded through every section and into the
      cache key — which already varies by `days` for three of the five calls.
- [ ] **A2.** `getTopCitedDocuments` takes `days` and filters on it. It is the
      only section with no window, and it currently disagrees with the chart
      beside it.

### Phase B — record what the model was shown

- [ ] **B1.** The `DocumentRetrieval` model, the migration, and
      `TENANT_SCOPED_MODELS` in `@ragenai/platform-contracts`.
- [ ] **B2.** `apps/web`: write retrievals and citations in one transaction in
      `assistant-stream.ts`, from the `retrievedSources` already in hand.
- [ ] **B3.** `apps/api`: rename `sourceFileIds` to `retrievedSources` in its
      copy of the chain, port `selectCitedSources`, and write both tables on
      the `/v1/chat` path. This is the first time API traffic reaches the
      dashboard at all.
- [ ] **B4.** The retention workflow (delete retrievals older than
      `ANALYTICS_RETENTION_DAYS`, default 90) and an
      `ensure-analytics-retention-schedule` script beside the demo one.

### Phase C — retrieved and ignored

- [ ] **C1.** A per-document query: retrievals, citations, the ratio, and the
      best rank that went uncited. Route, contract, Redis cache.
- [ ] **C2.** A dashboard section, sorted by retrievals-without-citations
      descending — the documents retrieval keeps offering and answers keep
      declining, which is the list worth acting on.

### Phase D — answers that cited nothing

- [ ] **D1.** A query for assistant messages in the window with retrieval rows
      and no citation rows, with their threads.
- [ ] **D2.** A rate in the summary cards and a table of the offending
      threads, paginated like Negative Q&A, sharing its component.

### Phase E — which documents back a bad answer

- [ ] **E1.** `rate` joined to citations per document: cited, thumbs-up,
      thumbs-down, and the rate. No new data — this is possible today.
- [ ] **E2.** A column in the top-cited table rather than a section of its
      own, since it describes the same documents.

### Phase F — questions the corpus cannot answer

- [ ] **F1.** Decide the marker. Proposal: `retrievedCount` under a `rag` key
      in the existing `Message.metadata` JSON, written on every RAG turn
      including the zero case, so "nothing retrieved" is distinguishable from
      "not a RAG turn". No migration; an expression index if it is ever slow.
      **This is the one design decision this spec leaves open**, because it is
      cheap to settle with the code in front of you and expensive to guess at
      now.
- [ ] **F2.** A list of questions whose turn retrieved nothing — the gaps in
      the corpus, stated as the questions people actually asked.

### Phase G — documents that have gone stale

- [ ] **G1.** Cited documents whose `updatedAt` is older than the citations
      against them, i.e. material still being answered from but not reviewed
      in a long time. Reads existing columns.

## Testing

- **Unit** — the retention cutoff; the per-document aggregation, including the
  zero-citation and zero-retrieval edges; the rank-of-uncited calculation.
- **Integration** — the write path in `apps/web` **and** `apps/api`
  separately, as ADR-21 requires: retrievals and citations from one turn,
  the transaction rolling both back, and the fire-and-forget catch not
  failing the answer.
- **Worker** — the prune deletes past the window, spares inside it, and is
  idempotent on a re-run.
- **Eval** — extend `evals/configs/citations.yaml`: the provider already
  reports `retrievedFiles` and `citedFiles`, so a case asserting a document is
  retrieved _and_ not cited is one assertion away, and it is the exact shape
  Phase C reports.
- **e2e** — the dashboard renders every new section with data and with none.
  `smoke-14-knowledge-analytics.spec.ts` already covers the screen loading;
  extend it rather than adding a `p1`, since only `smoke-*` and `p0-*` gate a
  PR.

## Rollout and rollback

Phase A ships alone and needs no migration.

Phase B carries the only migration, and it is additive — a new table with no
alterations — so a revert of the code leaves an unused table behind rather
than a broken one. Drop it in a follow-up if the whole thing is abandoned.

The retention schedule is server-side state in Temporal and **outlives a
revert**, exactly as ADR-26's script comment warns for the demo cleanup: a
rollback has to run the script's `--delete` as well, or a schedule keeps
firing at a workflow that no longer exists.

Phases C through G are read-only over data Phase B is already collecting;
each is a revertable UI and query change.
