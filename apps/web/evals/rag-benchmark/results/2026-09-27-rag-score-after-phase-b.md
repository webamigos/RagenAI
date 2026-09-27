# The RAG readiness score after Phase B — against the A2 baseline

The same measurement as
[`2026-09-26-rag-score-vs-retrieval.md`](./2026-09-26-rag-score-vs-retrieval.md)
(the A2 baseline), repeated on 2026-09-27 against `a9b493dd5`, which has the
spec's Phase B fixes:

- **B6 (#1401):** a long suggestion no longer throws the score away.
- **B2 (#1402):** the button and ingest score the same, decrypted text. Ingest
  was already sending the same text, so this run measures B1 and B6.
- **B1 (#1404):** the total is computed from the dimensions, at temperature 0.

It ran in the same private database, with the same corpora, shapes, models and
stray `example.com` page, three runs per shape. The raw-XML shape and the
control arms were not repeated: ingest now refuses raw markup, and the controls
scored 0 on both corpora and do not depend on the scorer. Docling Phase A
(#1403, the ingest ceiling of 4) was also on `main`. It changes how many files
parse at once, not what they parse into.

## The score, before and after

| | Baseline, 09-26 | After Phase B, 09-27 |
| --- | --- | --- |
| Scoring calls that stored a score | 44 of 69 | **69 of 69** |
| One document's score across three ingests (spread) | median 6.8, max 15.5 points | **0.0**: identical every time, all 23 document × shape cells |
| Tables: Spearman ρ, score vs pass rate, 15 points | 0.20 | 0.40 |
| Prose: Spearman ρ, 8 points | 0.58 | 0.49 |

**The two defects are gone.** No score is lost, and the same text gets the same
number. That is B6 and B1 doing exactly what they were for.

## What the score now does and does not say

By shape, on `tabele-bilingual-v1`:

| Shape | Mean score | Mean pass rate |
| --- | --- | --- |
| `docling-table-chunks` | 42.9 | 0.87 |
| `legacy` | 33.2 | 0.65 |
| `docling` | 31.5 | 0.44 |

The score now ranks the three shapes in the order retrieval does. With no
run-to-run noise, the 11-point gap between the best and worst shape is real. A
spreadsheet re-indexed into table chunks now scores higher than before, not
lower, which is the reverse of the demo drop that started the spec.

Per document it is still weak. ρ = 0.40 on 15 points is a tendency, not a
predictor. For example, `en-02-service-rates.md` scores 25.5 to 45 depending on
the shape while its questions pass 0 to 1.00 across runs, but `pl-02-stawki-serwisowe.md`
scores 35.5 in every shape whatever its pass rate. The prose corpus stays a
narrow band (56–66.5) with a weak relation over eight documents.

The pass rates themselves are within yesterday's ranges:

| Shape | 09-26 | 09-27 |
| --- | --- | --- |
| `docling` | 7, 7, 8 | 9, 7, 11 |
| `docling-table-chunks` | 15, 14, 14 | 15, 15, 17 |
| `legacy` | 13, 13, 12 | 10, 11, 12 |
| `kolej` (`docling`) | 19, 17, 17 | 19, 18, 19 |

Nothing that affects retrieval changed between the two days.

## For A4

- **The score is now a stable, deterministic reading of the rubric.** It is no
  longer noise, and it no longer disappears.
- **It orders parse quality correctly across shapes on tables.** A document
  whose table was chunked properly scores higher than the same document badly
  parsed.
- **It still does not tell a user which of their documents will be found**
  (ρ 0.40 on tables, 0.49 on prose). Comparing two documents' numbers is not
  supported by this data, which is what Q2 decided for the file list.

Still unmeasured: the prose shape "after Optimize", which A4 asks for.
