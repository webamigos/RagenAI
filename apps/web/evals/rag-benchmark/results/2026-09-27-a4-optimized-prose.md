# A4 — does "Optymalizuj dla RAG" help retrieval, and does the score see it?

The last measurement Phase A of
[the readiness-score spec](../../../../../docs/specs/2026-09-26-rag-readiness-score-review.md)
asks for, run on 2026-09-27 against `ab3f91ead` (Phase B merged). The prose
corpus `kolej-bilingual-v1` is compared in two shapes:

- **as written**: the three `docling` runs of
  [`2026-09-27-rag-score-after-phase-b.md`](./2026-09-27-rag-score-after-phase-b.md)
- **after Optimize**: the same eight documents after every suggestion
  "Optymalizuj dla RAG" made for them was accepted

## How the optimized corpus was made

1. **Suggestions from the app.** The corpus was uploaded and ingested by the
   real worker. For each document, the app's own Optimize flow ran:
   `POST /api/documents/{id}/optimize-suggestions`, the `optimizeDocument`
   job, then the job's suggestions read back.
2. **All accepted, and applied to the original files.** Every suggestion was
   accepted and applied to the **original** `.md` files, not to
   `UserDocument.content`, which is the chunks joined with each overlap
   duplicated.
3. **Whitespace-tolerant matching.** Suggestions are written against Docling's
   rendering of the file. Docling joins wrapped lines and writes `**9,80 zł** ,`
   with a space before the comma. So a suggestion's `before` was matched with
   any whitespace, or none, between its words. This applied **86 of 89**
   suggestions; exact matching applied 37.
4. **Kept for audit.** The resulting documents and every suggestion are in
   [`2026-09-27-kolej-optimized/`](./2026-09-27-kolej-optimized)
   (`optimization-report.json`).

The questions and their expected answers are unchanged.

## Retrieval

| Shape | Runs | Median |
| --- | --- | --- |
| as written | 19, 18, 19 of 24 | **19** |
| after Optimize | 23, 22, 22 of 24 | **22** |

The questions that changed, across the three runs of each:

| Question | As written | After Optimize |
| --- | --- | --- |
| `xl-en2pl-baggage-liability` | 0/3 | 3/3 |
| `xl-en2pl-bike-fare` | 0/3 | 3/3 |
| `xl-en2pl-min-payout` | 0/3 | 3/3 |
| `xl-en2pl-refund-pct` | 0/3 | 2/3 |
| `xl-pl2en-bike-fare` | 0/3 | 3/3 |
| `en-mono-multihop-cockatrice` | 3/3 | **0/3** |

**Where the gain comes from.** Almost all of it is English questions about the
Polish documents. As written, these failed by answering from the wrong
company: the corpus holds two parallel operators, and a fragment with no
company name in it cannot say whose policy it is. Optimize's suggestions
restate the company's name in each section and add question-shaped headings
and synonyms. That is exactly what the rubric rewards as `selfContainedness`
and `qaAdherence`, and here it disambiguates.

**What it cost.** Optimize translated English into Polish: all four English
documents came back partly in Polish, with 87–178 Polish diacritics each
against none before. The prompt
(`apps/worker/src/activities/documents/optimize-document-suggestions.ts`) asks
for "all text fields" in Polish, and the model applies that to the replacement
text too. The Cockatrice section of the English board minutes is now in
Polish, so its English answer, "31 October 2026", is no longer in the document.
That is the one question lost. Some of the `xl-pl2en` gain may equally come
from the translation, since a Polish question now meets Polish text.

## The score

| Document | As written | After Optimize |
| --- | --- | --- |
| `en-01-refund-policy.md` | 66.5 | 91.5 |
| `en-02-baggage-policy.md` | 61.5 | 88 |
| `en-03-delay-compensation.md` | 61.5 | 80.5 |
| `en-04-board-minutes.md` | 56 | 55 |
| `pl-01-regulamin-zwrotow.md` | 57 | 85.5 |
| `pl-02-regulamin-bagazu.md` | 65.5 | 86.5 |
| `pl-03-polityka-opoznien.md` | 59 | 87 |
| `pl-04-protokol-zarzadu.md` | 61 | 69.5 |
| **mean** | **61.0** | **80.4** |

Every score was stored (24 of 24), and each document's score was identical
across its three runs. The score rises with retrieval under this controlled
change. The one document whose score did not rise, `en-04-board-minutes.md`,
is the one that lost its question.

## Run-to-run variance, as A4 asks

Ten scoring calls on the unchanged text of `pl-01-regulamin-zwrotow.md`
returned **60, ten times**. After B1 the score is deterministic on identical
input. Ingest scored the same document 57, because ingest scores the joined
chunks rather than the file: the input difference B2 is about.

## The finding, for the spec

- **Tables (A2 and after Phase B).** The score ranks parse shapes in
  retrieval's order, but predicts a single document weakly (ρ 0.40).
- **Prose, under a controlled change.** Accepting Optimize's advice raised
  retrieval (19 → 22 of 24), and the score rose with it (61 → 80). The advice
  helps retrieval here, and the score sees it.
- **Across documents, prose is weak.** ρ is 0.49 over eight documents in one
  shape.
- **The advice has a defect independent of the rubric.** It translates non-Polish
  documents into Polish. The gain above was measured with that defect in place.

Two caveats limit how far this generalises. The corpus was built to make
"which company?" the hard part, which is exactly what restating names fixes.
And the result is eight documents, three runs each.
