---
title: Knowledge analytics that explain a bad answer, not just count good ones
status: draft
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
metrics that fall out of the difference. The public API stays out of all of
it, by decision — see **Q1**, now answered.

## Open Questions

<!-- While this block is here the spec is not ready to implement. -->

- **~~Q1. Does API analytics require persisting every API turn?~~
  Answered: no. The API is out of scope, and the screen says so.**

  The question was whether to make persistence unconditional — which would
  mean retaining question and answer text for every API call — so that Phase
  B3 had rows to write against. The answer is not to. Knowledge Analytics
  counts questions people asked, not requests an integration made.

  Shipped ahead of the rest of this spec, because the gap it closes exists
  today: the three message-counting queries now exclude `Source.API`
  (`apps/api/src/common/utils/analytics-scope.ts`), and the page states the
  exclusion under its description in all 15 locales. Without the filter,
  debug-mode traffic — the API key's `debugMode` column in apps/api, an
  `x-debug-mode: 1` header on apps/web's internal routes — was already
  landing in the same rows as the organization's own chat.

  **Consequence for this spec: B3 is dropped.** `apps/api`'s copy of the
  chain keeps `sourceFileIds`, and `document_retrievals` is written on the
  apps/web path only. The "dashboard of zeroes" in the Problem section below
  is now the intended behaviour for an API-only organization, explained on
  screen rather than left to be discovered.

- **Q2. Is this one deliverable or three?** Only B, C and D need the new
  table. A (one time window), E (per-document ratings) and G (stale
  documents) need no new data and could ship this week. (B3 is gone — see Q1 —
  so the split is between "needs the migration" and "does not".) Splitting is
  the reviewer's recommendation. Keeping them together buys a single coherent screen; the
  cost is that the cheap fixes wait for the migration and for Q1.
- **Q3. Phase F only.** How does a turn that retrieved nothing mark itself,
  and may an organization admin read the verbatim question text? Message
  content is KMS-encrypted per thread and `getNegativeQa` deliberately
  returns no content. F may need to be its own spec.

## Problem

**This spec is written against #972, which is not merged.** `retrievedSources`
and `selectCitedSources()` do not exist on `main` — the chain still returns
`sourceFileIds` and the citation write still persists the retrieved set. Phase
B2 is unimplementable until that lands, and if #972 changes shape in review the
write path here changes with it.

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
**neither** `DocumentCitation` nor anything else analytics reads. Both its chat
paths (`/v1/chat` and `/v1/chat/completions`, the latter being how an
OpenAI-SDK integration arrives) have their own copy of the chain, still
returning `sourceFileIds` where apps/web now returns `retrievedSources`;
`apps/mcp`'s `ragen_chat` tool is a third caller.

This one has since been answered rather than fixed (**Q1**): an organization
integrating through the API gets a dashboard of zeroes on purpose, and the
page now says so instead of leaving it to be discovered. What was genuinely
broken was the half-measure in between — debug-mode API threads _did_ reach
the counts, so the dashboard was neither "no API" nor "all API" but "whichever
keys happen to have debug on". That is fixed.

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

**Rank is stored**, because it is free at write time and cannot be recovered
later. Note what it means depends on configuration: with reranking on (opt-in,
`FEATURE_FLAG_RERANKING`) it is rerank order; with it off it is RRF-fusion
order, and in both cases it is the position of the file's best chunk after
dedupe. The row should record which, or the caveat belongs on the chart. "The
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
`DocumentRetrieval: 'orgId'`, or the new table is the one tenant-scoped model
the guard does not watch — **and nothing currently enforces that**. The
coverage test collects only models with a direct `organizationId` field, which
is why `DocumentCitation` needs a hand-written assertion. Add the mirror of
that assertion, or widen the coverage test to accept `orgId` too, which is the
fix that stops this recurring.

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

**Deleting a thread does not delete its messages** — `messages_thread_id_fkey`
is `ON DELETE SET NULL`, and `thread-deletion-must-remove-messages.test.ts`
exists because the demo-environment spec asserted a cascade that is not there
and nearly shipped on it. Retrievals survive a thread deletion only because two
code paths delete messages by hand (`apps/api`'s `ThreadCoreService` and the
worker's `deleteStaleThreads`), after which the cascade from `Message` does
apply. So no change is needed _today_, but the reason is those two call sites,
not a cascade from `Thread`. A third thread-deletion path would orphan
retrieval rows.

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
- **The new section ships before its route.** apps/web and apps/api deploy
  separately, and `getKnowledgeAnalyticsDashboard` fetches every section in one
  `Promise.all`, so a 404 from one new route rejects the whole thing and blanks
  the **entire** screen, not just the new panel. Either wrap each new call in
  its own catch returning an empty result, or deploy api first — the spec's
  Rollout section names the second.
- **The prune trips the tenant guard.** A `deleteMany` filtered only on
  `createdAt` has no org scope, and `deleteMany` is a guarded operation, so the
  job logs a violation nightly and blocks the day the guard starts throwing.
  Scope the delete per organization rather than exempting it, as the worker
  already does elsewhere. Note also that neither proposed index serves a
  global `createdAt` delete.
- **The prune never runs** (schedule not created — the failure ADR-26's
  script comment warns about). The table grows; nothing breaks. The schedule
  script prints what it targeted, as the demo one does.

## Phases

Phase A is independent of everything else and fixes a live inconsistency.
Phases D, E and F need no new data either, and are ordered by the value the
brief assigned them rather than by cost.

### Phase A — one time window for the whole screen

- [ ] **A1.** A period selector (7 / 30 / 90 days) **and** `getTopCitedDocuments`
      taking `days`, in one step. They cannot be split: between a selector and
      a windowed query, the panel shows all-time counts under a "last 7 days"
      label and caches them under a 7-day key. The cache key already varies by
      `days` for three of the five calls.
- [ ] **A2.** Decide what the selector means for "Documents Unused for 90+
      Days", which is defined by a fixed `UNUSED_THRESHOLD_DAYS` rather than a
      window. Either it is exempt and labelled so, or the threshold follows the
      selector — leaving it silently unfiltered recreates the inconsistency
      Phase A exists to remove.

### Phase B — record what the model was shown

- [ ] **B1.** The `DocumentRetrieval` model, the migration, and
      `TENANT_SCOPED_MODELS` in `@ragenai/platform-contracts`.
- [ ] **B2.** `apps/web`: write retrievals and citations in one transaction in
      `assistant-stream.ts`, from the `retrievedSources` already in hand.
- [ ] **B4.** The retention workflow (delete retrievals older than
      `ANALYTICS_RETENTION_DAYS`, default 90) and an
      `ensure-analytics-retention-schedule` script beside the demo one. The
      variable is read by the worker alone, so per ADR-37 it belongs in that
      app's env schema, not a `@ragenai/env` fragment.

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

Every UI step above adds `en` and `pl` message keys;
`tests/architecture/i18n-keys-exist-in-both-locales.test.ts` fails the build if
only one locale is added.

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
each is a revertable UI and query change — but each adds an apps/api route the
web app calls, so **apps/api deploys first**, or the shared `Promise.all`
blanks the whole dashboard until it catches up.
