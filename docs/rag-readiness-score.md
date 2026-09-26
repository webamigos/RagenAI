# The RAG readiness score

The `RAG: NN` badge on a knowledge-base file, and the "Oceń dla RAG" / "Score
for RAG" menu item that recomputes it. This page covers what the number is,
when it is computed, how to turn it off, and why it should not be read as a
retrieval-quality measurement yet.

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
| Cost | one call per ingest, per re-process and per click, recorded as `rag_scorer` usage |
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
| Upload, or re-process | yes, automatically, after embedding |
| "Score for RAG" in the file's menu | yes |
| Rollback to an earlier version | no; the target version's score is copied to the new version and to the badge |
| "Apply suggestions", or a manual edit | no; the new version is unscored and the badge is cleared until the file is scored again |

A call that fails writes `null`, so no badge is shown. The previous score is
not kept, because it would describe text that has since changed.

## Turning it off

The score is the feature key **`ragReadinessScore`** in
`@ragenai/platform-contracts`, and its code default is **on**. A platform
administrator changes it in **apps/admin → Features**, at any of the usual
layers:

- **platform default**, for every organization on the installation
- **plan**, under Features → Subscription Plans
- **organization override**, for one organization

The first layer that sets the key decides it: override, then plan, then
platform default, then the code default.

With the key off, for that organization:

- ingest makes no scoring call, and a re-process clears the stored score
- a scoring job queued before the change ends without a model call
- "Score for RAG" is not in the menu, and the server action refuses
- the list, grid, Version history and Optimize tab show no score, including
  one stored earlier
- Optimize still generates and applies suggestions

Turning it back on brings back the scores stored before it was turned off.
A file re-processed while it was off has no score until it is re-processed
again or scored from its menu.

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
- **The same text can score differently twice.** No temperature is pinned and
  the model's own total is stored as returned.
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
| `apps/worker/src/handlers/score-document.ts` | `isRagScoringEnabled`, ends early when off |
| `apps/web/src/features/documents/services/commands/score-file-command.ts` | `isFeatureEnabledQuery(orgId, 'ragReadinessScore')`, throws `UnauthorizedException` |
| `RagScoreBadge`, `ToolbarActions`, `OptimizeTab`, `VersionHistoryTab` | `useOrgFeature('ragReadinessScore')` |

The worker resolves the key through `apps/worker/src/services/org-features.ts`.
That is the same `resolveFeatures` apps/web and apps/admin use, fed the same
three layers, so the worker and the panel cannot disagree.
