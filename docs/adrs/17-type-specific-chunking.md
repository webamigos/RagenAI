# ADR-17: Type-Specific Chunking at Ingest

**Status:** Accepted
**Date:** 2026-04-11

## Context

The RAG improvements landed in ADR-14 (hybrid dense + sparse), ADR-15 (multi-query expansion), and ADR-16 (document summaries) all improved what retrieval *does* with chunks. None of them changed **how chunks are produced**. Until this ADR, every file type flowed through the same recursive character-based splitter with different `chunkSize` / `chunkOverlap` constants. That works reasonably well for prose (Markdown, text, EPUB) but systematically destroys structural information in everything else:

- **CSV and XLSX files** were fed to the character splitter as raw text. The **header row appeared only in the first chunk**. Chunks 2, 3, 4, ... were just rows of numbers with no column names. A user asking "what was Q3 revenue?" had to match their query against a chunk containing `1,200,000` with no nearby indication that the column means revenue. Dense embeddings couldn't rescue that, hybrid BM25 couldn't either — the information was thrown away before indexing.
- **DOCX files** were extracted via `mammoth.extractRawText()`, which **discards all heading styles**. A 50-page contract became flat prose. Chunks had no section context for retrieval matching or for citations. The LLM couldn't reference "Section 3.2 — Revenue terms" because that structure was invisible.
- **XLSX multi-sheet files** had sheet identity leaking into pageContent as a `[Sheet: name]\n` prefix — a hybrid of data and metadata that confused both the splitter and downstream retrieval.
- **SRT subtitle files** were semantically segmented by an LLM call (retaining Phase 3-tier quality) but **timestamps were thrown away** before the LLM saw the text. There was no way to cite back to a specific timestamp in the source video/audio, and no path toward time-range filtering.

The practical impact: ingestion was leaving retrieval-quality on the table for every structured file type. The ingested chunks worked for prose and mostly worked for Markdown (which already had its own heading-aware splitter), but everything else lost its structural backbone.

## Decision

Replace the one-size-fits-all splitter dispatcher with **type-specific chunking strategies**. Each file type gets a splitter that understands its natural structure. The metadata schema is extended with optional fields that carry the structural information through the ingest pipeline into the Qdrant payload, where future query-side features can filter on it.

### File type strategies

| File type | Strategy | Key metadata added |
|---|---|---|
| **CSV** | Row-group chunker: header row repeated at the top of every chunk; body rows packed to the chunk-size budget | none (inherits file metadata) |
| **XLSX** | Same row-group chunker, one document per sheet from the loader | `sheet_name` |
| **DOCX** | Heading-aware splitter: Mammoth HTML output walked to track an `<h1>`/`<h2>`/`<h3>` stack; paragraphs chunked under each heading path; oversized paragraphs fall through to recursive character split with the same `section_path` | `section_path` (e.g. `"Chapter 3 > 3.2 Revenue > Q3 Details"`) |
| **SRT** | Raw file parsed into timestamped blocks **before** the LLM semantic segmentation call (unchanged); after the LLM returns segments, each segment is matched back to its source blocks via normalized substring search; min/max timestamps flow into chunk metadata. Unmatched segments leave the fields unset. | `timestamp_start_ms`, `timestamp_end_ms` |
| **MARKDOWN** | Existing heading-aware Markdown splitter — no change | — |
| **PDF** | No change in Phase 4a — deferred to Phase 4b (heading heuristic) and 4c (table extraction) | — |
| **TEXT**, **EPUB**, **URL**, **IMAGE** | Generic recursive character splitter — no change | — |

> **Note on field names in the "Key metadata added" column:** the names shown (`sheet_name`, `section_path`, `timestamp_start_ms`, `timestamp_end_ms`) are the **Qdrant canonical snake_case field names** — what appears on chunk payloads at query time. Loaders and splitters internally use camelCase (`sheetName`, `sectionPath`, `timestampStartMs`, `timestampEndMs`), and `prepareMetadata` is the boundary that maps between the two. See the **Naming convention** subsection below for details.

### Metadata extension

`VectorStoreDocumentMetadata` (the Qdrant canonical shape, snake_case throughout) gains four optional fields, all sparsely populated by the file types that produce them:

```typescript
section_path?: string;          // DOCX heading hierarchy
sheet_name?: string;            // XLSX sheet identity
timestamp_start_ms?: number;    // SRT segment start time
timestamp_end_ms?: number;      // SRT segment end time
```

All four are `undefined` on chunks from file types that don't produce them. The retrieval path, reranker, and answer prompt remain generic over metadata — they don't need to know about the new fields to function, but they can be enhanced later (query-side filters, citation templates) without another round of ingest-side changes.

### Naming convention: camelCase in loaders, snake_case in Qdrant

Loader and splitter intermediate metadata uses **camelCase** (`sheetName`, `sectionPath`, `timestampStartMs`, `timestampEndMs`) to match the existing loader convention where adjacent fields like `fileName`, `fileType`, and `source` are camelCase. The final Qdrant payload uses **snake_case** (`sheet_name`, `section_path`, `timestamp_start_ms`, `timestamp_end_ms`) matching the rest of `VectorStoreDocumentMetadata`.

`prepareMetadata` is the boundary that maps between the two. It reads the camelCase intermediate form from `doc.metadata`, drops all other fields, and writes the canonical snake_case form into the Qdrant payload. This keeps loader code consistent with the existing convention without requiring a repo-wide rename of `fileName` / `fileType` / `source`, and centralizes the schema ownership in one place (`prepareMetadata`) rather than letting it leak across a dozen loaders.

Same `...(x !== undefined ? { x } : {})` pattern as the existing `chunk_type` mapping from ADR-16.

### Splitter dispatcher

`src/activities/splitters/split-documents.ts` becomes a pure dispatcher on `FileType`. The branches are:

- `MARKDOWN` → `splitMarkdownDocuments`
- `CSV` + `XLSX` → `splitCsvDocuments` (shared strategy; XLSX metadata carries the sheet identity)
- `DOCX` → `splitDocxDocuments`
- `SRT` → pass-through (the SRT loader already produces chunks via `parseSrtToSegmentsUsingLLM`, and with ADR-17 those chunks carry timestamps)
- everything else → generic recursive character splitter

### Pure-TS implementations, no new dependencies

The CSV parser is a ~60-line inline tokenizer (quoted fields, escaped quotes, CRLF/LF). The DOCX HTML walker is a regex-based block extractor (Mammoth output is well-formed enough that a full HTML parser is overkill for this use case). The SRT block parser handles both comma and dot millisecond separators. None of the new code pulls in a dependency — it keeps Phase 4a self-contained and preserves the worker's tight dep list.

## Alternatives Considered

1. **"Just convert everything to Markdown and reuse the Markdown splitter."** Tempting — the Markdown splitter already handles headings. Rejected because:
   - CSV → Markdown table conversion destroys column alignment once the table is larger than what fits on a row
   - XLSX with multi-sheet workbooks would need an invented `## Sheet: name` convention that the Markdown splitter doesn't know about
   - SRT converted to Markdown doesn't have a natural representation of timestamps
   - The "universal Markdown" approach leaks formatting concerns into every loader; type-specific splitters keep the strategies localized to where the knowledge lives.

2. **LLM-based universal chunking.** Feed every document to an LLM and ask it to produce chunks. Rejected because:
   - Cost scales linearly with document size at ingest time (currently only PDF vision does per-page LLM calls, and that's expensive enough)
   - Non-determinism: the same document might chunk differently between runs
   - Quality for structured data (CSV, spreadsheets) is worse than rule-based row grouping because LLMs don't reliably repeat headers in every chunk

3. **Do type-specific chunking but only for the file types with the biggest wins.** Considered CSV + XLSX only for v1. Rejected because DOCX and SRT are both small incremental additions on top of the same metadata-extension scaffolding, and shipping them together keeps the "type-specific chunking" narrative coherent for ADR purposes.

4. **Drop LLM segmentation from SRT and chunk by N-block groups.** Simpler and gives perfect timestamp accuracy (each chunk = N adjacent blocks, timestamps trivially derived). Rejected because LLM segmentation produces noticeably better semantic chunks — a full sentence ending mid-block is respected, topic transitions are detected, and the content that ends up in a single chunk is much more self-contained. Keeping the LLM segmentation and recovering timestamps via matching is worth the matching complexity.

5. **papaparse for CSV parsing.** Well-tested library, handles all RFC 4180 edge cases. Rejected for v1 because the inline parser is ~60 lines, covers the common cases (quoted fields, escaped quotes, CRLF/LF), and avoids adding a dependency. Can upgrade if production CSVs start hitting edge cases the inline parser doesn't handle.

6. **cheerio / jsdom for DOCX HTML walking.** Full HTML parsing. Rejected — Mammoth output is well-formed and constrained to a small tag set (`h1`-`h6`, `p`, `li`, `th`, `td`, plus inline formatting tags). A ~30-line regex-based block extractor is enough and keeps the dependency list stable.

7. **Heading-aware PDF chunking in the same phase.** Bundled originally into "type-specific chunking" but split out. PDF heading detection is a research problem — fonts vary, not all PDFs have structural markers, and the heuristic approaches (font-size deltas, whitespace patterns) are fragile. Deferred to Phase 4b where it gets its own dedicated design pass.

## Consequences

**Retrieval quality improves on structured content:**
- CSV/XLSX: every chunk has column context, so numeric-heavy tables become queryable by column-semantic phrases
- DOCX: section-aware chunks are retrievable by section-semantic phrases and carry citation-grade hierarchy metadata
- SRT: future query-side features can filter by time range or cite timestamps; no immediate user-facing change until those features ship

**No change to retrieval code in ragen-app.** The new metadata fields flow through the existing Qdrant payload without any filter/query code updates. This is intentional — Phase 4a is ingest-only, Phase 5 can add query-side filters on top of the data Phase 4a produces.

**Existing Qdrant data is unaffected.** Chunks written before Phase 4a have no `section_path`, `sheet_name`, or `timestamp_*` fields. Qdrant filters on absent fields are permissive, so old chunks continue to match as they did before. No backfill is required; re-ingesting a document is the natural upgrade path.

**New code surface in the worker:**
- `src/services/text-splitters/csv-row-group-splitter.ts` (~180 lines including inline CSV parser)
- `src/services/text-splitters/docx-heading-splitter.ts` (~180 lines including HTML walker)
- `src/services/document-loaders/srt-block-parser.ts` (~150 lines including block parser and segment matcher)
- Three new test files with 43 unit tests total (CSV splitter 14, DOCX splitter 12, SRT block parser 17)

**Minimal existing-code changes:**
- `vector-store.ts` type extended with 4 optional fields
- `prepare-metadata.ts` extended to preserve them (mirrors the ADR-16 `chunk_type` pattern)
- `load-xlsx.ts` stops prefixing `[Sheet: name]\n` and renames `sheetName` → `sheet_name` for consistency with the snake_case metadata convention
- `load-docx.ts` switches from `extractRawText()` to `convertToHtml()`
- `srt-llm-loader.ts` calls the new block parser and segment matcher
- `split-documents.ts` gains a proper switch dispatcher

**Test coverage:**
- Before Phase 4a: 86 worker tests
- After Phase 4a: 129 worker tests (+43 new, all passing, zero regressions)

**No feature flag.** The new splitters replace the old strategy for their file types — there's no legacy-compatible path to flag between. If a type-specific strategy turns out to be worse than the generic recursive splitter for some subset of real-world files, the fix is to improve the specific splitter, not to flag back to recursive. Rollback requires a code revert; hybrid search (ADR-14) followed the same principle.

## Configuration

No new environment variables. All strategies use the existing `CHUNK_SETTINGS[FileType]` constants from `src/utils/splitters.ts` for per-type chunk size budgets. If a specific type's budget needs tuning based on production data, it's a one-line change to that constant.

## Deferred work

- **Phase 4b: PDF heading detection.** Font-size heuristic first, LLM-assisted upgrade if the heuristic isn't enough. Adds `section_path` to PDF chunks alongside the existing page-level metadata.
- **Phase 4c: PDF table extraction.** Extract tables as atomic chunks with `chunk_type: 'table'` metadata. Either via a PDF table library or via Claude's native PDF understanding.
- **Phase 4d: Query-side use of the new metadata.** `section_path` in citation templates, `sheet_name` as a filter, `timestamp_*` for time-range queries. All of these are ragen-app (retrieval-side) changes that build on the metadata Phase 4a produces.
- **RFC 4180 edge cases in CSV parsing.** Specifically, newlines inside quoted fields. The inline parser handles the common cases but not that one. Upgrade to papaparse if it bites real uploads.
- **Richer DOCX list/table handling.** The current HTML walker extracts list items and table cells as plain paragraphs. Treating tables as atomic chunks (parallel to the PDF work in 4c) is a natural extension.

## Key Files

| File | Role |
|------|------|
| `ragen-worker/src/services/text-splitters/csv-row-group-splitter.ts` | CSV parser + row-group chunker, shared by CSV and XLSX file types |
| `ragen-worker/src/services/text-splitters/docx-heading-splitter.ts` | Mammoth HTML walker + heading-stack chunker |
| `ragen-worker/src/services/document-loaders/srt-block-parser.ts` | SRT timestamp block parser + segment→block matcher |
| `ragen-worker/src/services/text-splitters/index.ts` | Exports for the new splitters |
| `ragen-worker/src/activities/splitters/split-documents.ts` | File-type dispatcher |
| `ragen-worker/src/services/llm/types/vector-store.ts` | `VectorStoreDocumentMetadata` with the four new optional fields |
| `ragen-worker/src/activities/embeddings/prepare-metadata.ts` | Preserves incoming metadata fields |
| `ragen-worker/src/activities/loaders/load-xlsx.ts` | Removes the `[Sheet: name]` prefix, sets `sheet_name` metadata |
| `ragen-worker/src/activities/loaders/load-docx.ts` | Uses `mammoth.convertToHtml()` to preserve heading structure |
| `ragen-worker/src/services/document-loaders/srt-llm-loader.ts` | Calls the block parser + segment matcher to attach timestamps |
| `ragen-worker/src/__tests__/csv-row-group-splitter.spec.ts` | 14 unit tests |
| `ragen-worker/src/__tests__/docx-heading-splitter.spec.ts` | 12 unit tests |
| `ragen-worker/src/__tests__/srt-block-parser.spec.ts` | 17 unit tests |

## Relationship to previous ADRs

| ADR | Stage | Phase | Purpose |
|-----|-------|-------|---------|
| ADR-11 | Storage | — | Qdrant as vector store |
| ADR-12 | Post-retrieval | — | Cohere Rerank sharpens top-k |
| ADR-14 | Retrieval | Phase 1 | Hybrid dense + BM25 sparse |
| ADR-15 | Pre-retrieval | Phase 2 | Multi-query expansion |
| ADR-16 | Ingest | Phase 3 | Document-level summaries |
| **ADR-17** | **Ingest** | **Phase 4a** | **Type-specific chunking** |

ADR-16 and ADR-17 are both ingest-side improvements. ADR-16 added *what* each document indexes (a summary chunk); ADR-17 changed *how* the body chunks are produced. They compose cleanly: a CSV uploaded today gets both a document summary (as a synthetic chunk) and row-group chunks (with header context). The summary chunk doesn't carry `section_path` or `sheet_name` because summaries are document-level, not structural.
