# The RAG readiness score

The `RAG NN/100` badge on a knowledge-base file, and the score the Optimize
tab measures its suggestions against. This page covers what the number is,
when it is computed, how to turn it off, and why it should not be read as a
retrieval-quality measurement yet.

There is no "Oceń dla RAG" / "Score for RAG" menu item any more (spec D3). A
document is scored by "Analyse" in its Optimize tab, where the number is a
baseline for an edit rather than a grade on its own.

Review and plan:
[`specs/2026-09-26-rag-readiness-score-review.md`](specs/2026-09-26-rag-readiness-score-review.md).

## What it is

One LLM call grades a document against a five-part rubric and returns a total
out of 100, plus up to five suggestions. The scorer is
`apps/worker/src/activities/documents/score-document-for-rag.ts`.

| | |
| --- | --- |
| Model | `SUMMARY_MODEL` (default `gemini-2.5-flash`), resolved per organization |
| Input | the first 12,000 characters of the document's indexed text: the chunks joined, after PII masking |
| Cost | one call per scored ingest, and per "Analyse" on a document with no score, recorded as `rag_scorer` usage |
| Stored in | `UserFile.metadata.ragScore` and `ragScoredAt`; copied to the active `DocumentVersion.ragScore` |
| Shown in | the file list and grid (badge), Version history, and the Optimize tab's "current score" |

The five dimensions, each scored 0–10 and weighted into the total:

| Dimension | Rewards | Weight |
| --- | --- | --- |
| `chunkStructure` | numbered headings (`### 1.1`) | 2.5 |
| `avgChunkSize` | sections of 80–150 words | 1.5 |
| `entityDensity` | names, amounts, dates, references | 2 |
| `selfContainedness` | sections that make sense on their own | 2.5 |
| `qaAdherence` | question-and-answer structure | 1.5 |

## When it runs

| Event | Scored? |
| --- | --- |
| Upload, or re-process | only where `ragScoreOnIngest` is on (off by default) |
| "Analyse" in the Optimize tab | when the document has no score yet; an existing one is kept as the baseline |
| Rollback to an earlier version | no; the target version's score is copied to the new version and to the badge |
| "Apply suggestions", or a manual edit | no; the new version is unscored and the badge is cleared until the file is scored again |

A call that fails writes `null`, so no badge is shown. The previous score is
not kept, because it would describe text that has since changed.

## Turning it on and off

Two feature keys in `@ragenai/platform-contracts`:

- **`ragReadinessScore`**, **on** by default: the score at all, meaning the
  badge, Version history's score and the Optimize tab's score.
- **`ragScoreOnIngest`**, **off** by default: whether every upload and
  re-process scores automatically, one model call per file. It only narrows
  the first key; with `ragReadinessScore` off, nothing scores.

The ingest default went to off on 2026-09-27 (spec D1). The measurements
found the score useful beside an edit, as Optimize's before and after, and
not as a grade on every file. A platform administrator changes either key in
**apps/admin → Features**, at any of the usual layers:

- **platform default**, for every organization on the installation
- **plan**, under Features → Subscription Plans
- **organization override**, for one organization

The first layer that sets a key decides it: override, then plan, then
platform default, then the code default.

With `ragReadinessScore` off, for that organization:

- ingest makes no scoring call, and a re-process clears the stored score
- a scoring job queued before the change ends without a model call
- "Analyse" suggests without scoring first
- the list, grid, Version history and Optimize tab show no score, including
  one stored earlier
- Optimize still generates and applies suggestions

Turning it back on brings back the scores stored before it was turned off.
A file re-processed while it was off has no score until it is re-processed
again or analysed in its Optimize tab.

It is a feature key, not an environment variable, because the call's cost
belongs to the organization, and an operator decides it per client.
Installation-wide choices that must be uniform, such as chunking, stay in
environment variables.

## Reading the number

**It has never been checked against measured retrieval.** The rubric dates from
April 2026 and was written for question-and-answer prose. It predates Docling
as the default parser, table chunks (ADR-43) and section-aware context
(ADR-19). The known consequences:

- **Tables score low however well they are indexed.** A table can earn almost
  nothing on three of the five dimensions (55 of the 100 points). When the
  demo spreadsheets were re-indexed through Docling into proper table chunks,
  their scores fell from 42 to 16 and from 45 to 20. ADR-43 measured the same
  kind of change as a retrieval *improvement*, 10/18 → 13/18 on its benchmark.
- **Long documents are judged on their opening.** Only the first 12,000
  characters are read, about three pages.
- **The same text could score differently twice.** A2 measured up to 15
  points between two ingests of one file. The call now runs at temperature 0,
  and the total is computed from the five dimensions rather than taken from
  the model.
- **Do not compare across document types.** A price list and a policy document
  are graded on a prose scale, and nothing supports ranking one against the
  other.

Phase A of the spec measures whether the score tracks retrieval, per document,
on the `rag-benchmark` corpora
([`apps/web/evals/rag-benchmark`](../apps/web/evals/rag-benchmark/README.md),
"By document"). The key's default may change after that measurement (spec D1).

## For developers

The key is checked at every place the score is produced or shown. Anything new
that produces or shows a score has to check it too:

| Where | Check |
| --- | --- |
| `apps/worker/src/handlers/parse-and-embed.ts` | `isRagScoringEnabled` before `scoreDocumentForRag` |
| `apps/worker/src/activities/documents/score-document-baseline.ts` (Optimize's "Analyse") | `isRagScoringEnabled`, returns no score when off |
| `apps/worker/src/handlers/score-document.ts` | `isRagScoringEnabled`, ends early when off. No producer queues this job since D3 |
| `RagScoreBadge`, `OptimizeTab`, `VersionHistoryTab` | `useOrgFeature('ragReadinessScore')` |

The worker resolves the key through `apps/worker/src/services/org-features.ts`.
That is the same `resolveFeatures` apps/web and apps/admin use, fed the same
three layers, so the worker and the panel cannot disagree.
