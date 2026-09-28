# Document diagnostics on the Phase A corpora — 2026-09-27

## Findings

**Every expectation holds** (table below). The raw-XML shape raises
`markup`, on 24 of its 25 chunks; Docling with table chunks on raises nothing
about headers; no parse is reported as a fallback that was not one.

**The run found two defects in C1's checks, fixed in this change:**

1. **`table-without-header` missed the mechanism that matters.** C1 looked at
   Docling's table chunks and at CSV header rows. It did not look at a
   Markdown table the splitter cut, whose rows after the cut have no column
   names — the case ADR-43 measured (10/18 → 13/18) and the reason
   `tabele-bilingual-v1` exists. With that case added (`source: split`, three
   or more table rows in a chunk with no header row), the check fires on
   every Markdown table document in the `docling` and `legacy` shapes and on
   none in `docling-table-chunks`.
2. **`empty-chunks` badged every Docling spreadsheet with table chunks on.**
   Once the table is excised, the prose is only its pointer, `[Table 1]`,
   which `table-chunks.ts` keeps on purpose. A placeholder whose table exists
   as a table chunk no longer counts; one without a table chunk still does.
   The pointer is still indexed as a chunk of its own. That is a splitter
   question, not the user's, and is noted here rather than changed.

**Against measured retrieval.** The 15 document × shape points of
`tabele-bilingual-v1` from `2026-09-27-rag-score-after-phase-b.md`, whose pass
rates are medians of three runs:

| `table-without-header` | Points | Mean pass rate | Range |
| --- | --- | --- | --- |
| fires | 9 | 0.50 | 0.33–0.67 |
| silent | 6 | 0.88 | 0.50–1.00 |

No flagged point passes more than 0.67; five of the six silent ones pass 0.80
or more. The exception is the spreadsheet with table chunks (0.50, silent):
its header is repeated correctly, and what it retrieves badly is not a header
problem, which the check does not claim to see. For comparison the LLM score
on the same 15 points reaches ρ = 0.40. Fifteen points on one corpus is a
direction, not a calibration.

**Prose says nothing.** `kolej-bilingual-v1` in four shapes — Docling,
legacy, after Optimize, and as re-indexed version text — produced no finding
at all. That is the intended silence: the checks name defects of the parse
and split, and these documents have none. Whether the prose is *good* for
retrieval is a question the checks do not answer, and the badge does not
pretend to.

**`partial-markup` is the case only the chunk-level check sees.** A prose
document with one worksheet part pasted in passes ingest's whole-text
refusal and is indexed; 3 of its 9 chunks are the XML.

Thresholds are unchanged from C1 (named constants in
`apps/worker/src/services/document-diagnostics.ts`), plus
`MIN_SPLIT_TABLE_ROWS = 3`.

Commit `e2ba17764`. Spec 2026-09-26-rag-readiness-score-review, C4.
Produced by `apps/worker/src/scripts/document-diagnostics-corpora.ts`:
the worker's own loaders and `splitText` on each file, then
`computeDocumentDiagnostics`. No model call, no embedding, no database.

## Expectations

| Shape | Check | Must fire on | Files | Firing | Result | Why |
| --- | --- | --- | --- | --- | --- | --- |
| raw-xml | `markup` | every file | 1 | 1 | pass | C4: the raw-XML shape must raise "Parsed as markup" |
| partial-markup | `markup` | every file | 1 | 1 | pass | a document ingest accepts, with one part of it XML |
| docling-table-chunks | `table-without-header` | no file | 5 | 0 | pass | C4: nothing about headers when Docling flagged them |
| docling | `fallback-parser` | no file | 21 | 0 | pass | Docling parsed it, so there is no fallback to report |
| legacy | `fallback-parser` | no file | 13 | 0 | pass | a deployment that chose the legacy parser has not fallen back |

## By file

`W n` is a warning on n chunks, `i` information, `·` nothing. Ingest
column: why ingest refuses the whole text, if it does.

| Corpus | Shape | File | Ingest | Chunks | Tables | `markup` | `table-without-header` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tabele | docling | en-01-equipment-limits.md | indexes | 16 | 0 | · | W 11 |
| tabele | docling | en-02-service-rates.md | indexes | 16 | 0 | · | W 12 |
| tabele | docling | pl-01-limity-sprzetowe.md | indexes | 16 | 0 | · | W 11 |
| tabele | docling | pl-02-stawki-serwisowe.md | indexes | 16 | 0 | · | W 12 |
| tabele | docling | pl-03-rejestr-wytopow.xlsx | indexes | 13 | 0 | · | W 12 |
| tabele | legacy | en-01-equipment-limits.md | indexes | 10 | 0 | · | W 6 |
| tabele | legacy | en-02-service-rates.md | indexes | 8 | 0 | · | W 4 |
| tabele | legacy | pl-01-limity-sprzetowe.md | indexes | 10 | 0 | · | W 6 |
| tabele | legacy | pl-02-stawki-serwisowe.md | indexes | 8 | 0 | · | W 4 |
| tabele | legacy | pl-03-rejestr-wytopow.xlsx | indexes | 5 | 0 | · | · |
| kolej | docling | en-01-refund-policy.md | indexes | 3 | 0 | · | · |
| kolej | docling | en-02-baggage-policy.md | indexes | 2 | 0 | · | · |
| kolej | docling | en-03-delay-compensation.md | indexes | 3 | 0 | · | · |
| kolej | docling | en-04-board-minutes.md | indexes | 4 | 0 | · | · |
| kolej | docling | pl-01-regulamin-zwrotow.md | indexes | 4 | 0 | · | · |
| kolej | docling | pl-02-regulamin-bagazu.md | indexes | 3 | 0 | · | · |
| kolej | docling | pl-03-polityka-opoznien.md | indexes | 3 | 0 | · | · |
| kolej | docling | pl-04-protokol-zarzadu.md | indexes | 4 | 0 | · | · |
| kolej | legacy | en-01-refund-policy.md | indexes | 3 | 0 | · | · |
| kolej | legacy | en-02-baggage-policy.md | indexes | 2 | 0 | · | · |
| kolej | legacy | en-03-delay-compensation.md | indexes | 3 | 0 | · | · |
| kolej | legacy | en-04-board-minutes.md | indexes | 4 | 0 | · | · |
| kolej | legacy | pl-01-regulamin-zwrotow.md | indexes | 4 | 0 | · | · |
| kolej | legacy | pl-02-regulamin-bagazu.md | indexes | 3 | 0 | · | · |
| kolej | legacy | pl-03-polityka-opoznien.md | indexes | 3 | 0 | · | · |
| kolej | legacy | pl-04-protokol-zarzadu.md | indexes | 4 | 0 | · | · |
| kolej-optimized | docling | en-01-refund-policy.md | indexes | 5 | 0 | · | · |
| kolej-optimized | docling | en-02-baggage-policy.md | indexes | 5 | 0 | · | · |
| kolej-optimized | docling | en-03-delay-compensation.md | indexes | 7 | 0 | · | · |
| kolej-optimized | docling | en-04-board-minutes.md | indexes | 5 | 0 | · | · |
| kolej-optimized | docling | pl-01-regulamin-zwrotow.md | indexes | 5 | 0 | · | · |
| kolej-optimized | docling | pl-02-regulamin-bagazu.md | indexes | 6 | 0 | · | · |
| kolej-optimized | docling | pl-03-polityka-opoznien.md | indexes | 6 | 0 | · | · |
| kolej-optimized | docling | pl-04-protokol-zarzadu.md | indexes | 5 | 0 | · | · |
| kolej-optimized | version-text | en-01-refund-policy.md | indexes | 5 | 0 | · | · |
| kolej-optimized | version-text | en-02-baggage-policy.md | indexes | 5 | 0 | · | · |
| kolej-optimized | version-text | en-03-delay-compensation.md | indexes | 7 | 0 | · | · |
| kolej-optimized | version-text | en-04-board-minutes.md | indexes | 5 | 0 | · | · |
| kolej-optimized | version-text | pl-01-regulamin-zwrotow.md | indexes | 5 | 0 | · | · |
| kolej-optimized | version-text | pl-02-regulamin-bagazu.md | indexes | 6 | 0 | · | · |
| kolej-optimized | version-text | pl-03-polityka-opoznien.md | indexes | 6 | 0 | · | · |
| kolej-optimized | version-text | pl-04-protokol-zarzadu.md | indexes | 5 | 0 | · | · |
| tabele | raw-xml | pl-03-rejestr-wytopow.xlsx | markup | 25 | 0 | W 24 | · |
| kolej | partial-markup | en-01-refund-policy.md | indexes | 9 | 0 | W 3 | · |
| tabele | docling-table-chunks | en-01-equipment-limits.md | indexes | 7 | 6 | · | · |
| tabele | docling-table-chunks | en-02-service-rates.md | indexes | 6 | 5 | · | · |
| tabele | docling-table-chunks | pl-01-limity-sprzetowe.md | indexes | 7 | 6 | · | · |
| tabele | docling-table-chunks | pl-02-stawki-serwisowe.md | indexes | 6 | 5 | · | · |
| tabele | docling-table-chunks | pl-03-rejestr-wytopow.xlsx | indexes | 7 | 6 | · | · |
