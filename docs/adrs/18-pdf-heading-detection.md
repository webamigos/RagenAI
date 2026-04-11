# ADR-18: PDF Heading Detection via Structured Claude Output

**Status:** Accepted
**Date:** 2026-04-11

## Context

ADR-17 (Phase 4a) introduced type-specific chunking for CSV, XLSX, DOCX, and SRT but **explicitly deferred PDF heading detection** to a separate phase. The reason: PDFs are harder than the other structured file types because the format itself does not carry semantic headings. DOCX has style names (`Heading 1`, `Heading 2`); markdown has `#`; XLSX has sheet names and header rows. PDF has none of these — a "heading" in a PDF is just text rendered in a larger font or a different style, visible to a reader but invisible to a naive text extractor.

Meanwhile, the current Claude native PDF extraction path (`src/services/chains/pdf-process-rag/chain.ts`) already sends the entire PDF as a base64 content block to Claude via LiteLLM, and asks for flat-text output with inline structural preservation (markdown-ish headings, tables as markdown tables, image descriptions inline). This worked but lost the opportunity to surface the structure as machine-readable metadata for retrieval.

The status quo left PDF chunks with **no `sectionPath`** metadata despite Claude having the structural information internally while processing the document. Retrieval over PDFs had no section-semantic matching, and citations could only reference the document filename — unlike DOCX chunks, which (since ADR-17) carry hierarchical paths like `"Chapter 3 > 3.2 Revenue > Q3 Details"`.

## Decision

**Change the Claude native PDF extraction prompt to request structured JSON output instead of flat text.** Claude returns a `{ sections: [{ level, title, content }] }` array. We parse it with a Zod schema, walk the sections with a running heading stack, and emit one Document per section with `metadata.sectionPath` built from the stack. Sections that exceed the chunk budget get recursively split using the existing character splitter while preserving `sectionPath` on every sub-chunk.

The approach reuses the **exact same LLM call** as before — same Claude model, same PDF passed via base64. Only the prompt changes. So the happy-path cost is unchanged.

### Why this approach over the alternatives

Six options were considered. The summary:

1. **Font-size heuristic** — parse the PDF with `pdfjs-dist` / `pdfium`, extract text + font metadata per span, identify likely headings by larger-than-body font size, short length, position above paragraphs. **Rejected**: fast and cheap but fragile. Fails on scanned PDFs (no text data), PDFs with inconsistent typography, PDFs that use bold/italic instead of size variation, and PDFs where font size tiers don't correspond to semantic levels. Would also require a second extraction path alongside the existing Claude one.

2. **LLM-based outline extraction as a second call** — send the PDF to Claude twice: once for text extraction (existing flow), once for a structured outline. Map extracted text to the outline. **Rejected**: doubles the LLM cost on every PDF ingest. Adds complexity without quality improvement over option 3.

3. **Structured output from the existing Claude call (this decision)** — change the prompt so Claude produces JSON with sections in a single round trip. Leverages Claude's existing "reading" of the PDF for both text and structure. **Accepted**.

4. **Hybrid: font heuristic first, LLM fallback** — try font detection, if it finds too few headings fall back to LLM. **Rejected**: more complex than just doing the LLM version from the start, and the LLM cost savings only materialize on already-structured PDFs where the heuristic works — the hardest case (scanned, poorly formatted) still goes to the LLM anyway. The "common path is cheap" argument for heuristic-first falls apart when the hard cases are both non-trivial and the ones that matter most.

5. **`generateObject` from the AI SDK with Zod** — the cleanest "structured output" pattern for LLM calls in the AI SDK, already used in ragen-app for the multi-query expansion (ADR-15). **Rejected for now**: the existing `generateTextWithPdf` in the worker uses a direct `fetch` to LiteLLM because it needs to send the PDF as an `image_url` content block (the AI SDK's `generateObject` abstraction doesn't cleanly support multimodal base64 documents yet). Rewriting the provider function is a larger scope than Phase 4b warrants. Instead, we parse the string response with a Zod schema manually — same safety, fewer moving parts.

6. **Deferred again, tackle 4c (PDF tables) first** — the original priority list had PDF tables as a separate bullet. **Rejected**: heading metadata unlocks citation quality, section-semantic matching, and sets up Phase 4d (query-side filters on `section_path`). It's a bigger retrieval win than table extraction for typical documents. Table extraction stays deferred to a future phase.

### The new prompt

Lives in `systemTemplates.pdfExtractionStructured` in `src/services/chains/pdf-process-rag/config.ts`. Key rules:

1. Output is a single JSON object with a top-level `sections` array
2. Each section has `level` (1-6), `title` (string, may be empty), and `content` (verbatim body text)
3. Sections appear in document order
4. Text before the first heading is a single section with `level: 1` and empty title (not lost)
5. No invented headings — if the document has no explicit hierarchy, return a single section
6. Preserve the document's original language in every field
7. No commentary, no markdown code fences, no prose around the JSON — just the object
8. Tables, charts, images are described inline within the owning section's `content` (not split out as separate sections)

The prompt is carefully phrased to say "respond with JSON only" in both the system message and the user message, and to forbid the `\`\`\`json` code fence that Claude is particularly fond of. The parser also defensively strips code fences if Claude ignores the rule (see below).

### JSON parsing and fallback

`parseStructuredPdfOutput()` in `src/services/chains/pdf-process-rag/parse-structured-pdf-output.ts` implements the parsing with graceful failure:

1. **Strip BOM and trim** — handle leading whitespace and invisible characters
2. **Strip code fences** — if Claude wraps the JSON in \`\`\`json ... \`\`\` or bare \`\`\`, unwrap it
3. **`JSON.parse`** — try to parse the unwrapped string; return `null` on error
4. **Zod validation** — run the parsed object through `pdfSectionsOutputSchema.safeParse`; return `null` if the schema doesn't match
5. **Empty check** — if the parsed `sections` array is empty, return `null` (nothing to index)
6. **On any null return** — log a `warn` with a short reason and a content snippet, and let the caller fall back

`processPdfWithClaude()` has a three-step fallback chain:

1. **Structured extraction** (preferred) — single LLM call with the new structured prompt. If success, walk sections with heading stack, build Documents with `sectionPath`, reconstitute flat markdown for `createMarkdownDocument` UI preview.
2. **Legacy flat-text extraction** — if step 1 returns zero chunks (parse failure, schema mismatch, empty sections), make a **second LLM call** with the original `systemTemplates.pdfExtraction` prompt. One extra round trip, only on failure. Returns a single unstructured Document.
3. **pdf-parse** — if step 2 also produces no content, fall back to `pdf-parse` raw text extraction as a last resort. Produces page-level Documents.

The extra LLM call in step 2 only fires when structured extraction fails. In the common case, the cost is identical to the pre-ADR-18 path.

### Splitter dispatch

`split-documents.ts` gains a PDF case that calls the new `splitPdfDocuments()` from `src/services/text-splitters/pdf-section-splitter.ts`. The splitter is deliberately tiny:

- **Short sections pass through** — if a section's content fits the chunk budget, it's emitted as a single Document unchanged
- **Long sections recursively split** — sections that exceed the budget are sent through the existing `splitDocuments()` (generic recursive character splitter), which copies the incoming metadata (including `sectionPath`) onto every sub-chunk
- **No-sectionPath docs handled safely** — the legacy flat-text fallback path in step 2 of the chain returns Documents without `sectionPath`. The splitter handles these the same way the default branch used to — pure recursive character split.

### Metadata flow

No new metadata fields are needed. `section_path` was already added to `VectorStoreDocumentMetadata` in ADR-17 for DOCX. PDF simply produces the same camelCase `sectionPath` on intermediate metadata, and `prepareMetadata` already maps it to `section_path` in the Qdrant canonical form (set up by ADR-17 and the subsequent CodeRabbit-driven naming convention fix).

This means Phase 4b adds **zero** changes to the retrieval code in ragen-app. PDFs now produce chunks with the same `section_path` metadata shape that DOCX chunks have been producing since Phase 4a. Any future query-side use of `section_path` (citation templates, filter-aware retrieval) will work uniformly across DOCX and PDF.

### Vision path is unchanged

The legacy vision-based PDF path (`PDF_PROCESSOR=vision`, `PDFOCRDocumentLoader`) still produces page-by-page descriptions via a vision LLM. It does not naturally support cross-page heading hierarchy because it processes pages in isolation. **Leaving it as-is**: users who explicitly opt into `PDF_PROCESSOR=vision` accept the lack of heading metadata. The vast majority of PDFs use the default Claude path and get the Phase 4b improvements automatically.

## Consequences

**Retrieval quality improves on PDFs with explicit structure** — contracts, manuals, reports, academic papers, policy documents. Any PDF where a human reader would navigate by section now surfaces its sections as retrieval-grade chunks with semantic metadata.

**Citations become meaningful for PDFs** — the same ADR-16 citation prompting rule already in `basic-rag/config.ts` can now reference PDF sections by name, not just filename. "According to 'contract.pdf', Section 3.2 — Revenue terms" instead of "According to 'contract.pdf'". No prompt changes needed for this to take effect; the section info is in the context the LLM already sees.

**Happy-path LLM cost is unchanged** — same Claude model, same PDF, same number of calls. Only the prompt differs.

**Failure-path cost is at most 1 extra LLM call** — when structured extraction fails (parse error, schema mismatch), the chain falls back to the legacy flat-text prompt. This is a tradeoff for robustness: rather than failing the entire ingest when Claude returns malformed JSON, we pay one extra round trip and fall back to the known-good extraction.

**No schema migration needed** — `section_path` already exists in the metadata type from ADR-17. Old PDF chunks written before Phase 4b have no `section_path` field; Qdrant filters are permissive on absent fields, so old chunks continue to work. New uploads get the metadata automatically. No backfill is required.

**The structured prompt is a quality knob that depends on Claude's compliance** — if real-world PDFs produce malformed JSON at rates above ~5%, the fallback path will dominate and we lose the cost advantage. This needs real-world validation, not just unit testing. Production monitoring should track the rate of structured vs. flat-text fallbacks via Langfuse tags (`tags: [..., 'structured']` vs. `[..., 'flat']`).

**No feature flag** — consistent with Phases 1 and 4a, there's no toggle for this. Disabling it requires a code revert. If the structured prompt turns out to be worse than expected, the right fix is to improve the prompt or the parser, not to flag back to flat text. The fallback chain already handles per-document failures gracefully.

**New code surface in the worker:**
- `src/services/chains/pdf-process-rag/parse-structured-pdf-output.ts` — Zod schema, JSON parser, heading-stack helpers (~180 LOC)
- `src/services/text-splitters/pdf-section-splitter.ts` — splitter for oversized sections (~60 LOC)
- Two new test files with 35 unit tests (27 parser + 8 splitter)

**Minimal existing-code changes:**
- `config.ts` — add `pdfExtractionStructured` system and human prompts alongside the existing `pdfExtraction` templates
- `chain.ts` — rewrite `processPdfWithClaude` with the three-step fallback chain
- `split-documents.ts` — add a `FileType.PDF` branch calling `splitPdfDocuments`
- `text-splitters/index.ts` — export the new splitter

**Test coverage**:
- Before Phase 4b: 129 worker tests
- After Phase 4b: 164 worker tests (+35, zero regressions)

## Alternatives rejected (short)

See detailed discussion in "Why this approach over the alternatives" above. Summary:

1. Font-size heuristic — fragile, needs a second code path
2. Two-call LLM (text + outline) — doubles cost without quality gain
3. `generateObject` via AI SDK — blocked by the PDF base64 content block limitation in the current LiteLLM path
4. Hybrid heuristic + LLM fallback — complexity without common-case savings
5. Defer to 4c (tables first) — headings deliver more retrieval quality per unit of work

## Configuration

No new environment variables. `PDF_MODEL` (default `claude-haiku-4-5`) and `PDF_PROCESSOR` (default `claude`) are unchanged. The structured prompt is applied automatically whenever the Claude path is active.

To observe the structured-vs-flat fallback rate in production, filter Langfuse traces by the tags `structured` vs. `flat` on the `process-pdf-claude-structured` and `process-pdf-claude-flat` trace names.

## Key Files

| File | Role |
|------|------|
| `ragen-worker/src/services/chains/pdf-process-rag/parse-structured-pdf-output.ts` | Zod schema + JSON parser + heading-stack helpers |
| `ragen-worker/src/services/chains/pdf-process-rag/chain.ts` | `processPdfWithClaude` with three-step fallback chain |
| `ragen-worker/src/services/chains/pdf-process-rag/config.ts` | New `pdfExtractionStructured` prompts |
| `ragen-worker/src/services/text-splitters/pdf-section-splitter.ts` | Oversized-section handling |
| `ragen-worker/src/services/text-splitters/index.ts` | Exports `splitPdfDocuments` |
| `ragen-worker/src/activities/splitters/split-documents.ts` | `FileType.PDF` dispatcher branch |
| `ragen-worker/src/__tests__/parse-structured-pdf-output.spec.ts` | 27 unit tests |
| `ragen-worker/src/__tests__/pdf-section-splitter.spec.ts` | 8 unit tests |

## Relationship to previous ADRs

| ADR | Stage | Phase | Purpose |
|-----|-------|-------|---------|
| ADR-11 | Storage | — | Qdrant as vector store |
| ADR-12 | Post-retrieval | — | Cohere Rerank sharpens top-k |
| ADR-14 | Retrieval | Phase 1 | Hybrid dense + BM25 sparse |
| ADR-15 | Pre-retrieval | Phase 2 | Multi-query expansion |
| ADR-16 | Ingest | Phase 3 | Document-level summaries |
| ADR-17 | Ingest | Phase 4a | Type-specific chunking (CSV, XLSX, DOCX, SRT) |
| **ADR-18** | **Ingest** | **Phase 4b** | **PDF heading detection via structured Claude output** |

ADR-17 and ADR-18 are closely paired. ADR-17 established the `section_path` metadata field and the heading-stack walking pattern for DOCX. ADR-18 brings PDFs into the same metadata shape using a different extraction mechanism (Claude structured output instead of Mammoth HTML walking). The downstream retrieval code doesn't need to distinguish between them — a DOCX `section_path` and a PDF `section_path` are indistinguishable from Qdrant's perspective.

## Deferred work

- **Phase 4c: PDF table extraction.** Extract tables as atomic chunks with `chunk_type: 'table'`. Either via a PDF table library or by further refining the structured output prompt to emit tables as separate top-level entries instead of embedding them in section content.
- **Phase 4d: Query-side use of `section_path`.** Citation templates that reference section names, filter-aware retrieval ("only answer from Section 3"), and LLM prompts that explicitly cite the section in generated answers.
- **Vision-path structural detection.** If `PDF_PROCESSOR=vision` ever becomes a significant fraction of real-world ingests, a future phase could add a per-page structure detection step and aggregate across pages into a heading hierarchy.
- **Production monitoring of structured-vs-flat fallback rate.** Not a code change — a dashboard / alert on the Langfuse tags. If the structured path fails more than expected, the prompt needs tuning.
- **Page number preservation.** Currently `prepareMetadata` drops per-page metadata from both the Claude path and the vision path. Adding a `source_page_number` field to `VectorStoreDocumentMetadata` and preserving it through `prepareMetadata` is a small cleanup that would improve citation precision (users could jump directly to the cited page). Deferred as a separate cleanup PR, not in Phase 4b scope.
