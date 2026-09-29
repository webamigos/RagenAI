# Document diagnostics on demo, against C4 — 2026-09-29

Spec 2026-09-26-rag-readiness-score-review, **D4**. Demo is the only
deployment, so its findings are compared with what C4 measured on the Phase A
corpora (`2026-09-27-document-diagnostics-on-the-phase-a-corpora.md`), per
document type.

## How

Demo's files were indexed on 2026-09-26, before ingest wrote diagnostics. They
were backfilled, not re-processed, with
`apps/worker/src/scripts/backfill-document-diagnostics.ts`:

- It read each indexed file's chunks back from Qdrant and ran
  `computeDocumentDiagnostics` with `parser: 'unknown'`.
- It wrote `metadata.diagnostics`: `--dry-run` first, then for real.
- No model call and no change to the index.

The backfill covered the demo organization ("Demo Org"): 28 indexed files,
28 written, 0 skipped, 0 without chunks. The worker on demo runs with
`DOCUMENT_PARSER=docling`, `DOCLING_STRICT=1`, and `FEATURE_FLAG_TABLE_CHUNKS`
unset.

## Findings

| Type | Files | Badged | `table-without-header` |
| --- | --- | --- | --- |
| DOCX | 8 | 1 | 1 |
| MARKDOWN | 4 | 0 | 0 |
| PDF | 8 | 0 | 0 |
| XLSX | 8 | 8 | 8 |

## Against C4

The same pattern, type by type:

- **Spreadsheets fire, all eight.** With table chunks off, Docling turns a
  sheet into a Markdown table and the splitter cuts it, so the rows after the
  cut have no column names. C4 measured exactly this shape: `docling`, where
  `table-without-header` fires on every Markdown table document. The same
  finding went with a mean pass rate of 0.50, against 0.88 without it, on
  `tabele-bilingual-v1`. The check names a real retrieval problem here, not a
  false alarm, and turning on `FEATURE_FLAG_TABLE_CHUNKS` is what would clear
  it (ADR-43).
- **Prose is silent.** PDF and Markdown raised nothing, as the
  `kolej-bilingual-v1` corpus did in all four of C4's shapes.
- **One DOCX fires.** A Word document with a table in it goes the same way as
  the spreadsheets. The other seven raised nothing.
- **Nothing else fired.** There was no `markup`, no `empty-chunks`, and no
  check C4 would not have predicted. `fallback-parser` and the section-path
  check do not run on a backfill, because stored chunks do not record their
  parser.

## Decision

The key was turned on for the demo organization in apps/admin on 2026-09-29,
by a person. The comparison holds, so `documentDiagnostics` defaults to
`true`, in the same change as this note.
