# The RAG readiness score against measured retrieval — A2 baseline

Phase A2 of [the readiness-score spec](../../../../../docs/specs/2026-09-26-rag-readiness-score-review.md).
This measures the scorer **as it is on `main` before any Phase B change**, which
is the baseline B1 and B2 wait for.

Run on 2026-09-26 against commit `fa90ed9ba` plus this PR's harness changes.
Chat `gemini-3-flash-preview`, judge `gemini-2.5-flash`, reranking on
(Scaleway), scorer `SUMMARY_MODEL` (default). The scores are the ones ingest
wrote to `UserFile.metadata.ragScore` for each run's own upload.

## The runs

| Corpus | Shape | Worker settings | Runs | RAG pass | Control |
| --- | --- | --- | --- | --- | --- |
| `tabele-bilingual-v1` | `docling` | `DOCUMENT_PARSER=docling`, table chunks off | 7, 8, 7 of 18 | **7** | 0/18 |
| `tabele-bilingual-v1` | `docling-table-chunks` | `FEATURE_FLAG_TABLE_CHUNKS=1` | 15/17, 14, 14 of 18 | **14** | |
| `tabele-bilingual-v1` | `legacy` | `DOCUMENT_PARSER=legacy` | 13, 12, 13 of 18 | **13** | |
| `tabele-bilingual-v1` | `raw-xml` | the XLSX uploaded as its sheet XML | — | **refused at ingest** | |
| `kolej-bilingual-v1` | `docling` | default | 17/23, 19, 17 of 24 | **17** | 0/23 |

Each shape re-ingested its corpus with the worker configured that way. The
control arm scored 0 on both corpora, so the RAG column is retrieval, not
recall. `ungraded` cases are excluded from their run's denominator, as the
harness README describes.

The raw-XML shape cannot be produced any more: ingest now refuses text that is
mostly markup (`findUndecodableText`, the `markup` branch in
`parse-and-embed.ts`). The demo's 42–65 scores for spreadsheets indexed as XML
come from before that guard.

## Finding 1 — the scorer loses more than a third of its answers

**25 of 69 scoring calls stored no score.** In every case examined, the model
returned a complete score, and `generateObject` rejected the whole response
because one of its `suggestions` was over the schema's 300-character limit
(`suggestions[n]: too_big`). The worker logs that as "RAG scoring failed" and
writes `ragScore: null`, so the badge disappears.

The prompt never tells the model the limit. This is a defect whatever the rest
of this page concludes, like B1: a correct score should not be discarded over
the length of an advisory string.

## Finding 2 — unchanged text moves by up to 15 points

The same document, re-ingested with the same settings, scored:

| Document (shape) | Stored scores |
| --- | --- |
| `en-02-service-rates.md` (`docling-table-chunks`) | 40, 24.5, 28 |
| `pl-01-limity-sprzetowe.md` (`docling-table-chunks`) | 27.5, 42 |
| `pl-02-stawki-serwisowe.md` (`docling`) | 35.5, 45 |
| `en-01-equipment-limits.md` (`docling`) | 24.5, 35 |

The scores the schema rejected (read back from the worker log) spread the same
way, for example 29.5 to 45.5 for `pl-02-stawki-serwisowe.md`. The badge moves
by more between two ingests of one file than it does between most files.

## Finding 3 — on tables, the score does not predict which document is found

Per document and shape, the median stored score against the median pass rate
of that document's questions (`expectedFiles`):

| Shape | Document | Score | Pass |
| --- | --- | --- | --- |
| `docling` | `pl-01-limity-sprzetowe.md` | 30 | 0.00 |
| `docling` | `pl-02-stawki-serwisowe.md` | 40 | 0.75 |
| `docling` | `pl-03-rejestr-wytopow.xlsx` | 35 | 0.00 |
| `docling` | `en-01-equipment-limits.md` | 30 | 0.50 |
| `docling` | `en-02-service-rates.md` | 32 | 0.33 |
| `docling-table-chunks` | `pl-01-limity-sprzetowe.md` | 35 | 1.00 |
| `docling-table-chunks` | `pl-02-stawki-serwisowe.md` | 40 | 1.00 |
| `docling-table-chunks` | `pl-03-rejestr-wytopow.xlsx` | 60 | 0.50 |
| `docling-table-chunks` | `en-01-equipment-limits.md` | 41 | 1.00 |
| `docling-table-chunks` | `en-02-service-rates.md` | 28 | 0.50 |
| `legacy` | `pl-01-limity-sprzetowe.md` | 48 | 0.67 |
| `legacy` | `pl-02-stawki-serwisowe.md` | 39 | 0.50 |
| `legacy` | `pl-03-rejestr-wytopow.xlsx` | 45 | 1.00 |
| `legacy` | `en-01-equipment-limits.md` | 42 | 0.40 |
| `legacy` | `en-02-service-rates.md` | 30 | 1.00 |

**Spearman ρ ≈ 0.2–0.3 over these 15 points**: no usable relation. It is 0.20
on the unrounded medians and 0.27 on the rounded values shown. Several cells
rest on a single stored score, because of Finding 1.

Across shapes the order is closer:

| Shape | Mean score | Mean pass |
| --- | --- | --- |
| `docling` | 33 | 0.35 |
| `docling-table-chunks` | 38 | 0.75 |
| `legacy` | 41 | 0.75 |

The score does put the shape that retrieves worst last. It also ranks `legacy`
above `docling-table-chunks`, which retrieve equally well here. The gap between
shapes (8 points) is smaller than the run-to-run spread of one document
(Finding 2), so a user comparing two badges cannot tell a better parse from a
second ingest.

## Finding 4 — on prose, a weak relation in a narrow band

`kolej-bilingual-v1`, one shape, eight documents: scores 52–63, ρ = 0.58. The
two documents scored lowest (52.5) are `en-04-board-minutes.md` (0/2) and
`pl-04-protokol-zarzadu.md` (1/2), the two board minutes, so the rubric's
dislike of minutes-shaped prose may track something real. Eight points in an
11-point band do not settle it.

**Not measured yet:** the second prose shape the spec asks for, the same
documents after accepting "Optymalizuj dla RAG" suggestions. That needs the
Optimize flow driven per document and is left for A4.

## Something this was not looking for

With these settings, the legacy loader retrieves tables as well as Docling
with table chunks (13 and 14 of 18) and far better than Docling without them
(7). ADR-43's baseline on 12 September measured Docling without table chunks at
10. That is a retrieval question, not a scoring one, and per ADR-20 it needs its
own measurement before anyone acts on it.

## Where the judge alone failed an answer

A case passes only when both the substring assertions and the LLM judge pass.
These are the RAG cases where the assertions passed and the judge did not:

| Shape | Run | Question | Judge's reason, shortened |
| --- | --- | --- | --- |
| `docling` | 1 | `en-heat-charge-mass` | no `kg` unit |
| `docling` | 2, 3 | `pl-ask-en-microscope-cap` | no GBP currency |
| `docling-table-chunks` | 2 | `pl-cap-extensometer` | answer *adds* `zł` |
| `docling-table-chunks` | 3 | `en-extensometer-cap-and-period` | does not name TF-3369 |
| `legacy` | 1, 2 | `pl-ask-en-microscope-cap` | no GBP currency |
| `legacy` | 2 | `en-extensometer-cap-and-period` | does not name TF-3369 |

Most follow what the rubric asks for. One is plainly the judge's mistake: the
`zł` case, where the rubric says the number is enough and the judge failed the
answer for giving the unit as well. Correcting it would move
`docling-table-chunks` from a median of 14 to 15 of 18. The totals above are
left as graded: this protocol has no hand adjudication, and correcting one
shape's errors while leaving the others would tilt the comparison. None of the
findings depends on that one case.

## Conditions a reader should know

- **Database and queue:** a private database (`ragen_e2e_a2`), seeded with the
  e2e seed, and a separate Redis database. The shared queue held jobs from other
  databases.
- **An extra page in every run:** the organization also held one leftover
  indexed page (`https://example.com`, "Example Domain"), created by a stale
  queued job before the queue was isolated. It was present for every run
  above, so the shapes are comparable, but it was one extra document in
  retrieval.
- **An interrupted run, deleted:** one `kolej` run hung when the network
  dropped. Its files were deleted through the product's delete path and the run
  repeated. It is not in the table.
- **Rejected scores are supplementary:** the rejected-but-answered scores quoted
  in Finding 2 come from the worker logs. They are what the model answered, not
  what the product stored, and they are not in the tables.
