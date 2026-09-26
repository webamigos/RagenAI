---
title: the RAG readiness score — what it measures, whether it predicts retrieval, and what replaces it
status: draft
areas: [rag, knowledge-base, worker]
adrs: [16, 17, 19, 20, 43, 50]
---

# The RAG readiness score

## TLDR

The `RAG: NN` badge ("Oceń dla RAG" / "Score for RAG") is one LLM call that
grades the first 12,000 characters of a document against a rubric written in
April 2026 for Q&A-style prose: numbered `### 1.1` headings, 80–150-word
sections, question headings. It has never been checked against measured
retrieval. On the one change where both exist, it points the other way:
ADR-43's table chunks raised the table benchmark from 10/18 to 13/18, while the
same kind of change dropped the demo spreadsheets from 42 to 16 and from 45 to 20.
This spec proposes measuring the score before changing it (ADR-20). The likely
outcome: the number comes off the file list and is replaced by deterministic,
type-aware checks on the chunks retrieval actually indexes. The LLM rubric stays
only where it helps, as the on-demand driver of "Optymalizuj dla RAG" for prose.

## Decisions

All five open questions were answered on 2026-09-26. The question numbers are
kept so earlier references to them still resolve. Q6 was added the same day,
and it replaces Q3.

- **Q1. Phase A's measurement is a gate.** Nothing that changes what the badge
  means (Phases C and D) starts until A4 has written its finding into this spec.
  Phase B's defect fixes are independent of the result, but B1 and B2 change
  the scorer's total and input, so they wait until A2 has committed a baseline
  run of the unchanged scorer. B3, B4 and B5 may land first.
- **Q2. The file list shows no number.** This holds whatever Phase A finds. If
  the rubric turns out to predict retrieval for prose, that result can shape the
  Optimize tab (D2), but it does not bring a number back to the list or grid.
  The list shows a worded state only when there is something to act on, for
  example "Parsed as markup" or "Table without headers", and the detail is in
  the document view. A number invites comparison between a price list and a
  policy document, and nothing supports that comparison.
- **Q4. "Optymalizuj dla RAG" is not offered for tabular documents.** That means
  XLSX and CSV files, and documents that are mostly table chunks; D2 sets the
  threshold. The suggestion types (restructure, pronoun context, Q&A headings)
  are prose edits. On a spreadsheet the right action is to re-parse, not to
  rewrite. The refusal is enforced in the command, not only by hiding the menu
  item.
- **Q3. ~~The LLM call leaves ingest.~~** Replaced by Q6. It said upload and
  re-process stop scoring (D1) whatever Phase A finds. Q6 makes scoring
  optional instead of deleting it.
- **Q6. Scoring is optional, per organization, through a feature key.** The key
  is `ragReadinessScore` in `@ragenai/platform-contracts`, with code default
  `true`, so an upgrade changes nothing. A platform administrator sets it in
  apps/admin, where every feature key already resolves through four layers:
  organization override, plan, platform default, code default. It is a feature
  key, not an environment variable: the score is an LLM call per ingest, billed
  to the organization as `rag_scorer` usage, and an operator decides that per
  client. `consts.ts` keeps environment variables for installation-wide
  choices that must be uniform, such as chunking, and this is not one. With the
  key off:
  - ingest does not call the scorer
  - the on-demand job and the command refuse
  - the list and grid show no badge, and the menu has no "Oceń dla RAG" item
  - Optimize still works, without a score

  This lands as B5, before A4, because it is independent of what A finds. D1
  changes from deleting the ingest call to deciding the key's code default
  after A4. Phase A needs the key on for the benchmark organization, which the
  default gives it.
- **Q5. One spec, separate deliveries.** The spec bundles three capabilities
  that are each useful alone: (a) the defect fixes, (b) the measurement and
  (c) the replacement diagnostics. They stay in one spec because (c)'s design
  depends on (b)'s result. They ship as separate phases, each in its own PRs:
  B for (a), A for (b), and C and D for (c).

## Problem

### Evidence from the demo, 2026-09-26

The demo's XLSX files were re-indexed through Docling. Before that they had
been indexed by the fallback CSV loader, or as raw OOXML XML. After re-indexing,
the content is objectively better: real markdown tables, and table chunks per
ADR-43. The scores went down:

| File | Before | After |
| --- | --- | --- |
| `cennik-2026.xlsx` | 42 | 16 |
| `price-list-2026.xlsx` | 65 | 52 |
| `budzet-marketingowy-2026.xlsx` | 45 | 20 |

Two DOCX files show `RAG: 0`. The scores were recomputed automatically when the
files were re-processed.

A spreadsheet indexed through a fallback loader, or even as raw XML, scoring
42–65, and the same spreadsheet as proper table chunks scoring 16–52, is a
result a retrieval-quality signal cannot produce. The rest of
this section explains why the scorer produces it.

### What the evaluation does today

**Two entry points, one worker job, one LLM call.**

| Step | Where |
| --- | --- |
| Row menu item "Oceń dla RAG" (`score-rag`) | `apps/web/src/app/components/ManageKnowledge/UserFiles/FileList/ToolbarActions.tsx:147-155`, wired at `UserFilesTable.tsx:280`, `:508` |
| Server action (org from the session) | `apps/web/src/app/[locale]/(panel)/knowledge/optimize-document/actions.ts:6-9` |
| Command: reads `UserDocument.content`, or the stored file for plain-text extensions, then starts `SCORE_DOCUMENT` | `apps/web/src/features/documents/services/commands/score-file-command.ts:17-66` |
| Job handler: score, merge into file metadata, sync to the active version | `apps/worker/src/handlers/score-document.ts:5-75` |
| **Automatic, on every ingest and re-process**, after summary and embedding | `apps/worker/src/handlers/parse-and-embed.ts:700-730` |
| The scorer itself | `apps/worker/src/activities/documents/score-document-for-rag.ts:46-128` |

**Model.** `SUMMARY_MODEL`, which defaults to `gemini-2.5-flash`
(`apps/worker/src/consts.ts:77`), resolved per org through `getChatModelForOrg`.
It is called through `generateObject` with a zod schema. No temperature is set,
so the provider default applies. Usage is tracked as `kind: 'rag_scorer'`.

**Input.** The first `MAX_INPUT_CHARS = 12_000` characters
(`score-document-for-rag.ts:9`, `:64-67`). What those characters are depends on
the entry point:

- **At ingest** the input is `docs.map(d => d.pageContent).join('\n')`
  (`parse-and-embed.ts:539`). `docs` is the output of `splitText`, after
  sanitising and **after PII masking** (`:428`, `:480`), so the scorer reads:
  - the chunks, joined, with each 200-character overlap included twice
  - for a Docling file with table chunks enabled, prose that has been reduced to
    `[Table N]` placeholders, followed by the table chunks appended after it
    (`apps/worker/src/activities/splitters/split-documents.ts:115-126`)
  - masked spans (`<PERSON>` and similar) wherever the file's PII policy masks
    them

  The ADR-16 summary chunk is added later, so it is not in the input.
- **From the button** the input is `UserDocument.content`. That field is also
  the joined chunks, written at `parse-and-embed.ts:809`, but from
  `updatedDocs`, after `prepareMetadata`. For a file with no document row, the
  input is the raw stored file (`score-file-command.ts:38-50`). So the same file
  can be scored on two slightly different texts, depending on who asked.

**Rubric** (`score-document-for-rag.ts:21-37`). Five dimensions, each scored
0–10:

| Dimension | What the prompt rewards | Weight |
| --- | --- | --- |
| `chunkStructure` | numbered headings (`### 1.1`) — "10 = consistent numbered Q&A headings" | 2.5 |
| `avgChunkSize` | sections of **80–150 words** | 1.5 |
| `entityDensity` | names, amounts, dates, legal refs, contact details | 2 |
| `selfContainedness` | each section understandable alone | 2.5 |
| `qaAdherence` | question + answer format | 1.5 |

The total is out of 100. **The worker takes `total` from the model as
returned.** The weighted sum is described in the prompt but never recomputed. A
copy of the scorer in apps/web
(`apps/web/src/features/documents/services/rag-optimizer/document-scorer.ts:57-65`)
does recompute it, but nothing in production imports that file. Only its own
test does.

**Storage and display.**

- The score is written to `UserFile.metadata.ragScore` with `ragScoredAt`
  (`score-document.ts:43-47`, `parse-and-embed.ts:719-730`). A failed call
  writes `null`, which is honest.
- It is copied to the active `DocumentVersion.ragScore`
  (`apps/worker/src/activities/db/sync-rag-score-to-version.ts`).
- v1 of a new document is seeded with it (`parse-and-embed.ts:822`).

The badge is `RagScoreBadge.tsx:15-42`:

- `Math.round(total)`, labelled `RAG: {score}`
- green at 70 or above, amber at 40 or above, crimson below 40
- shown in the list (`UserFilesTable.tsx:448`) and the grid (`FileCard.tsx:200`)

The version history shows its own `ScoreBadge` (`VersionHistoryTab.tsx:179-180`),
and the Optimize tab shows `fileRagScore ?? job.baseScore`
(`OptimizeTab.tsx:203`). The per-dimension breakdown and the five
`suggestions`, `ScoreDetailPanel.tsx`, are imported only by their own test. The
model is asked for suggestions on every ingest, and no user ever sees them.

**When it runs.**

| Event | Rescored? |
| --- | --- |
| Upload, or re-process (`runFileEmbeddings`) | yes, automatically |
| The menu action | yes |
| Rollback | copies the target version's old score (`rollback-document-version-command.ts:52`, `:69`) |
| "Apply suggestions" → `REINDEX_DOCUMENT_VERSION` | **no** — `reindex-document-version.ts:108` says so. `apply-suggestions-command.ts:76-86` writes `ragScore: null` on the new version, "because the re-index that follows rescores the document", and the UI string `applied-hint` promises "the new score appears in Version history once that finishes". Neither happens: the version stays unscored and the badge keeps the pre-edit number. |

### Why it does not fit the current pipeline

The rubric predates Docling as the default parser, ADR-19's section context,
ADR-43's table chunks and hybrid search. It was written on 2026-04-20
(`e381d6cfc`). Against each part of the current pipeline:

- **Docling markdown and ADR-17 type-specific chunking.** The splitter decides
  the chunk boundaries, not the author's headings. Markdown chunks are 800
  characters, DOCX and PDF 1000, each with 200 characters of overlap
  (`apps/worker/src/utils/splitters.ts`). "Numbered headings create natural
  chunk boundaries" describes a splitter we no longer rely on alone. The
  scorer's 80–150-word target also contradicts both its siblings: the optimizer
  prompt asks for 150–380 words (`optimize-document-suggestions.ts:75`) and the
  dimension evaluator for 80–500 (`evaluate-suggestion-dimensions.ts:39-50`).
  Three prompts give three answers to one question, and none of them is the
  splitter's budget.
- **ADR-43 table chunks.** A spreadsheet becomes `[Table N]` placeholders plus
  pipe-table chunks. Headers are repeated only when Docling flags them. Scored
  on this rubric, a table gets close to 0 on `qaAdherence` and on
  `chunkStructure`. It gets an arbitrary value on `avgChunkSize`, because a
  table row has no meaningful "words per section". Its `selfContainedness` is
  judged on prose criteria. Those three dimensions carry 55 of the 100
  points, and a table cannot earn them however well it is chunked. The demo's drops are
  the scorer working as written.
- **ADR-19 section-aware context.** `section_path` is added at render time
  (`apps/web/src/libs/chains/utils/chain-utils.ts`, `renderDocumentChunk`), not
  stored in `pageContent`. The scorer reads chunk text only, so it penalises
  `selfContainedness` for context the chat model actually receives.
- **Hybrid dense + sparse search, reranking, multi-query.** `entityDensity` is
  the one dimension aimed at a real retrieval property: specific tokens help
  BM25. But after masking it is measured on text in which `<PERSON>` and similar
  have replaced exactly those tokens, whenever the policy masks them. The rubric
  has no notion of query-side rephrasing, and none of reranking, which is what
  makes a slightly-too-long chunk harmless.
- **ADR-16 summaries.** The summary chunk exists to make a document findable by
  what it is about, and the scorer never sees it.
- **Document versions.** The score is supposed to describe a version's text, but
  applying suggestions leaves the version unscored, so it describes an earlier
  version or none (see "When it runs" above).
- **Truncation.** 12,000 characters is about three pages. On a long document
  the badge describes the opening. On a Docling spreadsheet it describes the
  first few table chunks. With overlaps counted twice, it describes even less
  than that.
- **Determinism.** No temperature is set and the total is not recomputed, so
  two runs on unchanged text can disagree. Nobody has measured by how much.
  Re-processing therefore moves the badge even when nothing changed.

### The two `RAG: 0` DOCX files

The comment at `parse-and-embed.ts:713-718` describes this exact symptom. DOCX
files first parsed as raw bytes scored 0 and kept the stale 0 after a failed
rescore. The fix made a failed rescore write `null`. A 0 that is still showing
means one of three things:

- the files have not been re-processed since that fix
- `UserDocument.content` still holds the raw-bytes text, so the button rescores
  the garbage
- the model returned `total: 0`, which the worker trusts even when the
  dimensions sum to more

Phase A0 reads the two rows to find out which. Each cause has a different fix.

### Does the score predict retrieval?

Nobody has checked. ADR-20 paused RAG work until changes were measured, and the
score was never among the things measured. The one data point available points
against it:

- ADR-43 measured table chunks at 10/18 → **13/18** on `tabele-bilingual-v1`,
  and 20/24 → 21/24 on `kolej-bilingual-v1` (medians of three runs, with a
  control arm at 0).
- The same kind of change moved the demo spreadsheets **down** by 13–26 points.

A signal that ranks a measured improvement below a raw-XML parse does not
predict retrieval quality, at least not for tables. For prose it is untested
rather than disproven, and Phase A settles that.

## Out of scope

- Changing chunking, retrieval, reranking or any prompt the chat path uses. If
  the measurement suggests the pipeline itself is wrong for some type, that is a
  separate spec under ADR-20.
- Flipping `FEATURE_FLAG_TABLE_CHUNKS` on by default. That is ADR-43's own
  product decision. This spec only has to be correct in both states.
- Measuring answer quality per question, or per-document recall@k as a product
  feature. The benchmark is used here as an instrument, not shipped.
- Suggest & Accept's own mechanics: ids, stale suggestions, versioning
  (`docs/document-versioning.md`). Only its rubric and its availability per type
  are in scope.
- Backfilling scores for existing files beyond what Phase D's migration step
  says.

## Proposed solution

### The options

| Option | What changes | Cost per document | Answers "will retrieval find this?" | Verdict |
| --- | --- | --- | --- | --- |
| **1. Keep and recalibrate** — fix the defects, recompute `total`, pin temperature 0, unify input, raise the 12k window | the prompt and the plumbing | same as today: 1 LLM call, about 4k tokens in and 300 out, roughly $0.002 at Gemini 2.5 Flash list price (to be confirmed against the pricing table), on every ingest and re-process | still no — a prose rubric on tabular text is still wrong, only more consistently wrong | necessary as defect fixes (Phase B); not sufficient as the answer |
| **2. Type-aware LLM rubric** — separate prompts for prose, tabular and transcript | a prompt per type, a router | same, plus prompt maintenance ×3 | only if calibrated against the benchmark, per type | plausible for Optimize's on-demand use; not justified for a list badge |
| **3. Chunk-level deterministic diagnostics** — computed from what was actually indexed: chunk sizes against the type's budget, headerless table chunks, share of chunks with a `section_path`, overlap duplication, parse path (Docling / fallback / markup-as-text), empty or placeholder-only chunks, masking density | a pure function over the chunks and metadata the worker already has | **zero model calls**; microseconds | partially and honestly — each check names a mechanism the benchmark has shown to matter (headerless table rows: ADR-43, lessons #207) or an obvious parse failure (raw XML) | **recommended** replacement for the badge |
| **4. Retire** — remove the badge and the ingest call; keep nothing | deletion | saves one call per ingest | n/a | the fallback if Phase A shows even option 3's checks do not track the benchmark |

Options 3 and 4 differ in what they tell the user. Option 3 still catches the
failures a person can act on — a spreadsheet parsed as XML, a table whose rows
lost their column names — and the old score was supposed to catch those too.
Option 4 drops them.

### Recommendation

1. **Measure first (Phase A).** Run the existing scorer on the benchmark corpora
   in several parse shapes and compare it with pass rates. This is a gate (Q1):
   if the score does track retrieval for prose, option 2 becomes a real
   candidate for the Optimize tab on prose documents. It never becomes a number
   on the list again (Q2).
2. **Fix the defects now (Phase B).** They are wrong regardless of the outcome.
3. **Replace the list badge with option 3 (Phase C)**, behind a feature key that
   defaults to `false` (ADR-50).
4. **Take the LLM scorer out of ingest (Phase D).** Keep it on demand, as the
   baseline for "Optymalizuj dla RAG" on prose documents only. Hide Optimize for
   tabular documents.

### How to validate the score against measured retrieval

The harness exists: `apps/web/evals/rag-benchmark`, run with
`npm run eval:benchmark`. It has a control arm, and results go to `results/`. It
measures per-question pass rate, not recall@k, and it does not aggregate per
document. Every case records `citedFiles`, but that is what was cited, not what
should have been: a retrieval miss cites nothing, so grouping by `citedFiles`
drops exactly the failures from a document's denominator. `Question` carries
only `docLang`, so nothing in the corpus says which document holds an answer.
A1 therefore adds an expected-document field to `Question` and fills it for
both corpora. A document's pass rate is computed over every question mapped to
it, including those that cited nothing. A multi-hop question counts toward each
document it names. A `guard-hallucination` question has no expected document,
because its answer is in none, and is left out of per-document rates. A
`guard-sycophancy` question corrects a premise from one document, so it counts
toward that document.

**Why correlation alone is weak here.** The two corpora have 13 documents
between them (8 + 5), and single runs are noisy: `kolej` moved 16/24 → 22/24
with nothing changed (`docs/rag-measurement-2026-09-12.md`, §9). A Spearman
coefficient on 13 points, over pass rates that move by four cases between runs,
says little. The test that says more is **ordering under a controlled change**:
the same document content in several shapes, where the benchmark already knows
which shape retrieves better.

| Shape | How to produce it | Benchmark evidence |
| --- | --- | --- |
| raw OOXML as text | the old failure; load the XLSX as a text file | none needed — obviously worst |
| fallback CSV loader, ADR-17 row groups | `DOCUMENT_PARSER` not Docling | — |
| Docling, table chunks off | default today | tabele 10/18 |
| Docling, table chunks on | `FEATURE_FLAG_TABLE_CHUNKS=1` | tabele 13/18 |

A score that predicts retrieval must rank these shapes in the benchmark's order,
per document, in most of three runs. The same comparison, run on prose from
`kolej-bilingual-v1` in two shapes (as written, and after accepting
"Optymalizuj dla RAG" suggestions), tests whether the rubric's prose advice
helps retrieval at all.

**The demo corpus as a third set.** The demo corpus (12 files per language:
four PDF, four XLSX, four DOCX, including the three files above) lives on the
unmerged branch `origin/claude/demo-file-corpus-tw4n4s` (`e15d46c10`,
`scripts/demo-corpus/files`). Its only expected answers are about a dozen PL/EN
pairs in a prose table in that branch's `scripts/demo-corpus/README.md`. Turning
them into a `questions.json` for `rag-benchmark` makes it a third corpus. It is
worth doing because it is the corpus users actually see, and the one the
evidence came from. Its figures must be checked for the property the benchmark
README requires: invented, and not repeated elsewhere in the same document.

## Core surfaces touched

| Surface | Change | What catches a mistake |
| --- | --- | --- |
| `prisma/schema.prisma` | **none** — scores and diagnostics live in `UserFile.metadata` JSONB, as `ragScore` does today | — |
| `packages/platform-contracts` | B5: the feature key `ragReadinessScore`, default `true`. Phase C: `documentDiagnostics`, default `false` | package tests, `shared-contracts-are-not-recopied.test.ts` |
| `packages/jobs` | Phase D may drop `SCORE_DOCUMENT` from ingest only; the job itself stays for on-demand use | `apps/worker` job integration suite (`worker:test:jobs`) — `every-job-runs` names `scoreDocument` |
| `apps/worker` ingest (`parse-and-embed`) | Phase C adds a pure diagnostics step; Phase D removes one LLM call | worker tests, `parse-and-embed-rag-score.test.ts` rewritten |
| auth / tenant scoping | none new; the action already derives org from the session and the command scopes by `organizationId` | existing guards |
| retrieval / chunking | **none** | ADR-20 — any change there needs its own measurement |

## Data model

No migration. `UserFile.metadata` gains `diagnostics` in Phase C:

```ts
{
  diagnostics: {
    version: 1,
    computedAt: string,
    // a stable key per check, i18n-keyed
    findings: Array<{ check: string; severity: 'info' | 'warn'; detail?: Record<string, number | string> }>,
    // chunk count, table chunk count, median chunk chars, share with section_path, …
    stats: { … },
  },
}
```

Rows written before Phase C have no `diagnostics`. Following
`docs/lessons/absence-is-the-discriminator-for-a-field-added-later.md`, absence
means "not computed", never "no findings", and the UI shows nothing rather than
a clean bill of health. Diagnostics fill in on the next ingest or re-process.
Because they are deterministic and cost nothing, a one-off script can backfill
them from stored chunks, if Phase C decides the empty state is too common.

Existing `metadata.ragScore` and `DocumentVersion.ragScore` values are left in
place until Phase D. After that they are no longer rendered in the list. They are not
deleted: they are harmless JSON, and they are the before/after history the
measurement may want.

## Failure modes

- **Diagnostics throw on an unexpected chunk shape.** The step is best-effort,
  like the summary. Ingest never fails because of it, and the finding list is
  simply absent.
- **A check is wrong for a type nobody considered** (SRT, image OCR, URL). Every
  check declares the file types it applies to. An unknown type gets no findings,
  never a warning.
- **The flag is off.** The old badge renders exactly as today, so there is
  byte-identical behaviour until the key is enabled.
- **Mixed collection during rollout.** Some files have `diagnostics`, some only
  `ragScore`. With the key on, only `diagnostics` render, so a file without them
  shows nothing, as per the Data model section.
- **The on-demand score (Phase D) runs on a tabular document through a stale
  client.** The command refuses with a worded error, because tabular types are
  excluded at the command, not only in the UI.
- **Benchmark noise hides a real signal (Phase A).** Take the median of three
  runs, as the benchmark README requires, and report the control arm next to it.
  If the orderings disagree between runs, the result is "not predictive", not
  "inconclusive, ship anyway".

## Phases

Each phase leaves the application working. B3 and B4 can land before A
finishes, and so can B5. B1 and B2 wait for A2's baseline, so that A measures the scorer as it
is today, not a fixed one. C and D do not start until A4 is done (Q1).

### Phase A — measure the score (no product change)

- [ ] **A0.** Read `metadata.ragScore`, `ragScoredAt` and `UserDocument.content`
  (first 500 characters) for the two `RAG: 0` DOCX files on demo. Record which of
  the three causes applies. This is a read only.
- [x] **A1.** *(done: #1394)* Add an expected-document field to the benchmark's `Question` and
  fill it in both corpora (see "How to validate" above). Then add a
  per-document table to the `rag-benchmark` report. The corpus is ingested
  through the real worker as today, and the harness reads back the score
  ingest wrote (`UserFile.metadata.ragScore`), so it is the score of the text
  ingest passed the scorer, with no second call. It writes that score next to
  the per-document pass rate over the mapped questions. `citedFiles` is reported beside them, not used as the
  denominator. Three runs, median. The script and its tests live under
  `apps/web/evals`, not in the product. Tests: a question that cited nothing
  still counts against its expected document.
- [ ] **A2.** Run the shape comparison above on `tabele-bilingual-v1` (all four
  shapes) and `kolej-bilingual-v1` (as written vs optimized), with the scorer
  as it is on `main` before any Phase B change. Commit the results under
  `rag-benchmark/results/`. This is the baseline B1 and B2 wait for.
- [ ] **A3.** *(optional, recommended)* Port the demo corpus: bring the files
  from `e15d46c10`, turn the README's question table into a `questions.json`,
  and run A2 on it. Separate PR, because it adds binary fixtures.
- [ ] **A4.** Write the finding into this spec: does the score rank shapes in the
  benchmark's order, for tables and for prose? Also measure run-to-run variance
  on unchanged text (ten runs, one document). If B1 and B2 have landed by then,
  rerun A2 with the fixed scorer and report both beside each other. Then decide
  on option 2 for prose, yes or no.

### Phase B — defects that are wrong whatever A finds

Each is a `fix`, with no feature key: they correct behaviour to what the code
already claims. B1 and B2 start only after A2's baseline is committed.

- [ ] **B1.** Recompute `total` from the dimensions in the worker, and set
  `temperature: 0`. Delete the unused apps/web scorer
  (`document-scorer.ts` and its test). Keep one prompt, in the worker. Test:
  the total is always the weighted sum, clamped to 0–100.
- [ ] **B2.** Make the button and ingest score the same text: the joined
  chunks, without duplicated overlap. Raise or remove the 12k truncation, or
  state it on the badge. Test: the same file gives the same input string from
  both paths.
- [x] **B3.** Keep the promise the UI makes about scores after "Apply
  suggestions", one way or the other: either `REINDEX_DOCUMENT_VERSION` rescores
  (one call), or `applied-hint` stops promising it and the badge clears. A
  number describing text that no longer exists is the stale-score defect
  `parse-and-embed.ts:713-718` already fixed once, on another path.
  *Recommendation:* clear it and fix the copy, because D1 may turn automatic
  scoring off by default.
  *Done:* cleared, and the copy fixed. The fix lives in
  `createDocumentVersionCommand`, so it also covers two cases this item did
  not name: a manual edit left the badge stale the same way, and a rollback
  carried the target's score onto the version but not the badge.
- [x] **B4.** Badge colour. Below 40 the badge uses crimson, which panel rule 16
  reserves for the Failed badge, so a low score reads as a failed ingest.
  Rules 11 and 17 reserve green and amber for document and job state. Use a
  neutral token, and put the scale in the label (`RAG 16/100`, rule 23). Test:
  `panel-colours-are-tokens-not-literals` and the badge test.
- [x] **B5.** *(done: #1395)* The `ragReadinessScore` feature key (Q6). Add it to
  `FEATURE_KEYS` with code default `true` and a label, so apps/admin shows it
  with no admin code. Check it in the worker (`parse-and-embed` and the
  `scoreDocument` handler, through `resolveFeatures` as Brain does), in
  `scoreFileCommand`, and in the panel (badge, grid card, menu item, Optimize
  tab's score). A `feat` with a changelog line: an operator can now turn it
  off. Documentation lands in the same delivery: `docs/rag-readiness-score.md`
  in this repository, with a Task Router line, and a page in `ragen-docs`.
  Tests:
  - the key's default
  - ingest skips the scorer and makes no model call when the key is off
  - the handler and the command refuse
  - the badge and menu item are absent in both views

### Phase C — chunk-level diagnostics behind `documentDiagnostics`

- [ ] **C1.** Add `computeDocumentDiagnostics(chunks, fileType, parseInfo)`: a
  pure function in `apps/worker/src/services/`, with unit tests per check. Its
  first checks:
  - text that looks like markup (XML/HTML tags as a large share of the text)
  - table chunks with no repeated header
  - chunks over budget
  - a share of chunks carrying `section_path` below a threshold, for types that
    produce one
  - overlap duplication ratio
  - empty or placeholder-only chunks
  - fallback parser used where Docling was expected

  Every check says which types it applies to.
- [ ] **C2.** Call it best-effort in `parse-and-embed` and
  `reindex-document-version`, and write `metadata.diagnostics`. The flag does not
  gate the write: it is free, and it lets the data accumulate before the UI
  exists.
- [ ] **C3.** Add the key `documentDiagnostics` (default `false`) in
  platform-contracts. With the key on, the list shows a worded badge only when a
  `warn` finding exists (for example "Parsed as markup" or "Table without
  headers"), and the document view lists findings with what to do. With it off,
  the list is unchanged. The PR is a `chore`, per ADR-50. Tests: component tests
  for both key states, and an e2e check in `p1` (not gating; the key is off).
- [ ] **C4.** Validate the checks on the Phase A corpora. The raw-XML shape must
  raise "Parsed as markup". Docling with table chunks on must raise nothing
  about headers when Docling flagged them.

### Phase D — the LLM score's place after the measurement

- [ ] **D1.** Decide `ragReadinessScore`'s code default from A4's result (Q6).
  If the score does not track retrieval, the default becomes `false`: one LLM
  call less per ingest and per re-process, and an operator can still turn it
  on. Nothing is deleted. Stop rendering `ragScore` in the list and grid when
  `documentDiagnostics` is on.
- [ ] **D2.** Scoring stays on demand in the Optimize tab, as the baseline for
  suggestions. For tabular types (Q4), both the score and the
  `optimizeDocument` job are refused at the command, and the Optimize menu item
  and tab are hidden. "Tabular" means XLSX, CSV, or a document whose indexed
  chunks are mostly `chunk_type: 'table'`; the threshold is set here and tested.
  If A4 found the rubric predictive for
  prose, apply option 2's prose-only calibration here. If it did not, the
  Optimize tab shows no number, only the suggestions.
- [ ] **D3.** Remove the "Oceń dla RAG" menu item. Its job becomes the Optimize
  tab's "Analyse" button. Remove `ScoreDetailPanel` unless D2 gives it a home.
- [ ] **D4.** Enable `documentDiagnostics` on demo, and compare it against
  production (not staging, which is retired). Flip the default in a `feat` PR,
  with a `docs/changelog-notes.md` line.

## Testing

- **Unit.**
  - B1: total arithmetic, and a pinned temperature on the call options.
  - B2: input parity between the two paths.
  - C1: every check, on a fixture from each parse shape.
  - D2: the command refuses tabular types.
- **Integration.**
  - `parse-and-embed-rag-score.test.ts`, updated for B and D.
  - A diagnostics test for C2 that asserts ingest succeeds when the function
    throws.
  - `worker:test:jobs` stays green for `scoreDocument`.
- **Component.** `RagScoreBadge` and the new diagnostics badge, in both key
  states, with a token-only palette.
- **E2E.** No `smoke-*` or `p0-*` change is needed while the key is off. When D4
  flips the default, the knowledge-base smoke test must assert that the badge
  area renders without a number.
- **Measurement.** A2 and A3 results are committed under
  `apps/web/evals/rag-benchmark/results/`, with medians of three runs and the
  control arm, per ADR-20.

## Rollout and rollback

- **Phase A** is evals only. Nothing to roll back.
- **Phase B** is plain fixes with no migration, so reverting the PR is enough.
  B4 changes a colour and a label only.
- **Phase C** writes new JSON keys and renders only behind `documentDiagnostics`
  (default `false`). Rollback is turning the key off. The written metadata is
  inert.
- **B5** is a feature key with code default `true`. Rollback is turning the
  key back on for the organization or the platform; reverting the PR is
  needed only if the gate itself is wrong.
- **Phase D** flips a default, it deletes nothing. Rollback is setting the key
  back on in apps/admin. Scores computed before D1 still exist in metadata.
  Files ingested while scoring was off have no score until they are rescored
  on demand.
- **Installer.** `create-ragen-app` needs no change, since there is no new env
  var or service. If Phase D makes `SUMMARY_MODEL` less critical, that is noted
  in the PR, not changed.
