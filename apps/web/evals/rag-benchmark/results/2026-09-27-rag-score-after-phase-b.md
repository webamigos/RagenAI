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

**How ρ is computed.** One point per document × shape: the **median of its
stored scores** over the three runs, against the **median of its per-run pass
rates**. Those are the questions naming the document in `expectedFiles`, as
graded. Spearman uses average ranks for ties. Taking each run as its own point
instead (45 points on tables, 24 on prose) gives ρ = 0.33 and 0.43, the same
reading. The 15 table points:

| Shape | Document | Score (median) | Pass (median) |
| --- | --- | --- | --- |
| `docling` | `en-01-equipment-limits.md` | 22.5 | 0.60 |
| `docling` | `en-02-service-rates.md` | 29 | 0.33 |
| `docling` | `pl-01-limity-sprzetowe.md` | 25.5 | 0.33 |
| `docling` | `pl-02-stawki-serwisowe.md` | 35.5 | 0.50 |
| `docling` | `pl-03-rejestr-wytopow.xlsx` | 45 | 0.50 |
| `docling-table-chunks` | `en-01-equipment-limits.md` | 43 | 0.80 |
| `docling-table-chunks` | `en-02-service-rates.md` | 45 | 1.00 |
| `docling-table-chunks` | `pl-01-limity-sprzetowe.md` | 43 | 1.00 |
| `docling-table-chunks` | `pl-02-stawki-serwisowe.md` | 35.5 | 1.00 |
| `docling-table-chunks` | `pl-03-rejestr-wytopow.xlsx` | 48 | 0.50 |
| `legacy` | `en-01-equipment-limits.md` | 29.5 | 0.40 |
| `legacy` | `en-02-service-rates.md` | 25.5 | 0.67 |
| `legacy` | `pl-01-limity-sprzetowe.md` | 35.5 | 0.67 |
| `legacy` | `pl-02-stawki-serwisowe.md` | 35.5 | 0.50 |
| `legacy` | `pl-03-rejestr-wytopow.xlsx` | 40 | 1.00 |

The eight prose points (`kolej-bilingual-v1`, `docling`), as score and pass rate:

| Document | Score | Pass |
| --- | --- | --- |
| `en-01-refund-policy.md` | 66.5 | 1.00 |
| `en-02-baggage-policy.md` | 61.5 | 1.00 |
| `en-03-delay-compensation.md` | 61.5 | 1.00 |
| `en-04-board-minutes.md` | 56 | 0.50 |
| `pl-01-regulamin-zwrotow.md` | 57 | 0.83 |
| `pl-02-regulamin-bagazu.md` | 65.5 | 0.50 |
| `pl-03-polityka-opoznien.md` | 59 | 0.50 |
| `pl-04-protokol-zarzadu.md` | 61 | 0.50 |

The baseline's ρ was computed the same way, on median stored scores. There,
several cells rested on one or two scores, because of the scores the schema
rejected.

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

The pass rates move per shape between the two days, but by no more than the
harness's own run-to-run noise. The README treats a single-run delta under
about three cases as noise, and `docling` alone spans 7 to 11 within one day.
Taken across shapes, the ranges overlap:

| Shape | 09-26 | 09-27 |
| --- | --- | --- |
| `docling` | 7, 7, 8 | 9, 7, 11 |
| `docling-table-chunks` | 15, 14, 14 | 15, 15, 17 |
| `legacy` | 13, 13, 12 | 10, 11, 12 |
| `kolej` (`docling`) | 19, 17, 17 | 19, 18, 19 |

Nothing that affects retrieval changed between the two days.

## Where the judge alone failed an answer

The same protocol as the baseline applies: totals are as graded, with no hand
adjudication. Three of the judge-only failures on 09-27 are the judge's
mistake, not the answer's:

- **`xl-pl2en-refund-pct`** (`kolej`, run 1). The answer gives 62%, which is
  what the rubric asks for ("Podaje 62%, wartość z angielskiego dokumentu
  Wolfsbane"). The judge read the rubric backwards.
- **`pl-cap-extensometer`** (`docling-table-chunks` run 3, and `legacy` run 2).
  It fails for adding the correct unit `zł`, which the rubric does not
  prohibit. This is the same mistake the baseline recorded.

Correcting all three would move `docling-table-chunks` from a median of 15 to
16 of 18, and leave every other median and every finding here unchanged. The
others follow what the rubric asks for: a missing GBP currency, a cap not tied
to `TF-3369`, and an uncommitted charge mass.

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
