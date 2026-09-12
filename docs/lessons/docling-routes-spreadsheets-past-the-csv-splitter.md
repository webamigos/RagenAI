---
title: 'Docling parses CSV and XLSX too, and the dispatcher returns to the markdown splitter before the FileType switch — so ADR-17 no longer reaches the two types it was written for'
modules: ['worker']
areas: ['architecture', 'rag']
topics: ['docling', 'chunking', 'splitters', 'adr-drift', 'csv', 'xlsx', 'dispatch-order']
---

# Docling routes spreadsheets past the CSV splitter, so ADR-17's fix stopped reaching them

**Context**: scoping table chunking, which needed a plain answer to "what
happens to a table today". ADR-17 reads as settled on this: it describes the
failure in full — _"the header row appeared only in the first chunk; chunks 2,
3, 4 … were just rows of numbers with no column names"_ — and its strategy
table records CSV and XLSX as fixed by the row-group splitter, with only PDF
deferred to a later phase.

**Problem**: on the default parser, CSV and XLSX no longer reach that splitter.
`DOCLING_SUPPORTED_TYPES` (`apps/worker/src/utils/docling.ts`) contains `CSV`,
`XLSX`, `MARKDOWN` and `TEXT` alongside the document formats, and
`split-documents.ts` opens with an early return —

```ts
if (parsedWithDocling) {
  const chunks = splitMarkdownDocuments(rawDocs, { … });
```

— **before** the `switch (fileType)` whose `case FileType.CSV: case
FileType.XLSX:` routes to `splitCsvDocuments`. So with `DOCUMENT_PARSER=docling`
(the default) a spreadsheet becomes a markdown pipe table, is cut at a newline
by the character splitter, and the header row survives only in the first chunk.
That is the exact failure ADR-17 wrote down, for the exact file types ADR-17
fixed.

`load-docling.ts` documents the routing and calls it intentional — _"For
spreadsheets (XLSX/CSV), Docling produces Markdown tables rather than raw CSV,
which means the output goes through the markdown splitter instead of the CSV
row-group splitter. This is intentional."_ Whatever the intent, the ADR is the
document a reader reaches for, and it now describes the non-default path only.
The two together read as "handled" from either end while the behaviour is
unhandled in the middle.

**Rule**: an ADR that fixes a behaviour _per file type_ stops being true the
moment a parser change moves that type onto another code path, and neither
document mentions the other. Before citing an ADR as settled, read the
dispatcher **top to bottom** rather than jumping to the branch you expect to
hit: a capability-shaped early return (`if (parsedWithDocling)`) silently
supersedes every branch behind it, for every type that capability happens to
cover. The tell is a `Set` of supported types that has grown since the
dispatcher was written.

**Applies to**: `split-documents.ts` dispatch order, ADR-17's CSV/XLSX claims,
and anything else gated on `DOCLING_SUPPORTED_TYPES` — it also swallows
`MARKDOWN` and `TEXT`, so their branches are equally unreachable on the default.
Same shape as
[a documented env flag that grep cannot find](a-missing-env-flag-may-be-a-moved-gate.md):
the gate was not removed, it was superseded somewhere the original document does
not look.
