# ADR-19: Section-Aware Context Rendering for Citations

**Status:** Accepted
**Date:** 2026-04-11

## Context

Phases 4a (ADR-17) and 4b (ADR-18) populated the `section_path` metadata field on DOCX and PDF chunks, and `sheet_name` on XLSX chunks, with the goal of eventually using that structural information at query time for better citations and filtering. At the end of Phase 4b, that metadata was sitting in the Qdrant payload **unused by the retrieval code**. The answer prompt already had a citation rule from ADR-16 ("reference the source document by name where it helps the user verify the answer"), but it could only cite file names because that's all the LLM saw in the context — `combineDocuments` was concatenating bare `pageContent` strings with double newlines, throwing away every metadata field.

Concrete example before ADR-19:
- User asks "what does Section 3.2 of the employment contract say about revenue?"
- Retrieval returns a chunk from `contract.pdf` with `metadata.section_path = "Chapter 3 > 3.2 Revenue terms"`
- `combineDocuments` passes only the raw chunk text to the answer LLM
- LLM can only answer with "According to contract.pdf, ..." — the section name is invisible
- User has no way to verify which section the answer came from without reading the whole document

The data was there; the prompt just couldn't see it. This ADR closes the gap.

## Decision

Update `combineDocuments` in `src/libs/chains/utils/chain-utils.ts` to render each retrieved chunk inside a `<chunk>` XML element with attributes exposing the source metadata the LLM can use for citation. Update the answer prompt in `src/libs/chains/basic-rag/config.ts` to read those attributes and cite them in the response.

### Chunk wrapper format

```
<chunk file="contract.pdf" section="Chapter 3 > 3.2 Revenue terms">
Chunk body content here...
</chunk>
```

The `<chunk>` wrapper is generated per retrieved Document by `renderDocumentChunk` (exported from the same file). Attributes:

- **`file`** — source document name, from `metadata.file_name` (populated for every chunk by `prepareMetadata` at ingest time in the worker). Always present when the wrapper is used.
- **`section`** — heading path for DOCX/PDF chunks, from `metadata.section_path` (set by ADR-17 for DOCX, ADR-18 for PDF). Omitted when the field is missing, empty, or whitespace-only.
- **`type`** — set to `"summary"` for synthetic summary chunks with `metadata.chunk_type === 'summary'` (from ADR-16). Omitted for regular body chunks.

All attribute values are XML-escaped (`&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`) so metadata values with those characters don't break the wrapper. Section paths in particular contain literal `>` characters (`"Chapter 3 > 3.2 Revenue terms"`) which are escaped to `&gt;` inside the attribute.

### Graceful fallback

Chunks with no `file_name` metadata (legacy chunks, edge cases, or chunks from future file types that don't populate it) are rendered as **bare `pageContent`** — no wrapper at all. This preserves the exact pre-ADR-19 behavior for chunks that don't have the required metadata, so legacy documents indexed before Phase 4a are unaffected, and so any future code path that returns chunks without `file_name` doesn't get broken by the wrapper logic.

The fallback is also defensive: if `file_name` is the wrong type (not a string — e.g., `null`, `undefined`, a number, an object), the wrapper is skipped. Same for `section_path`.

### Answer prompt changes

The citation rule in `systemTemplates.answerChain` is extended to:

1. **Explain the wrapper format** to the LLM — `file`, `section`, `type` attributes and what they mean
2. **Prefer the most specific citation form**:
   - With a section: `"According to 'contract.pdf', Section 3.2 — Revenue terms, ..."`
   - Without a section: `"According to 'filename.pdf', ..."` (fallback — no regression from ADR-16 behavior)
3. **Forbid fabrication** — only cite file names and section paths that actually appear in the chunk attributes. This was already in the ADR-16 rule; Phase 4d.1 extends it to section paths too.
4. **Tell the LLM to NOT include the `<chunk>` tags in its response** — the wrapper is for the model's reference, not for the user.

### Why XML-style wrapper instead of alternatives

Four options were considered:

1. **XML-ish `<chunk file="..." section="...">...</chunk>` (chosen)** — clear structural separation, LLM-friendly (Claude and GPT-5.x handle XML tags well, and Anthropic's own docs recommend XML tags for structured context), minimal token overhead, escaping is well-understood.

2. **Markdown-style fenced block with front-matter**:
   ```
   ---
   file: contract.pdf
   section: Chapter 3 > 3.2 Revenue terms
   ---
   Content here...
   ```
   Rejected: more verbose (3 lines of overhead per chunk instead of 2), and LLMs sometimes misinterpret YAML front-matter as part of the content.

3. **Inline prose annotation** — `[From contract.pdf, Section 3.2] Content here...`. Rejected: easier for the LLM to get wrong (it might treat the annotation as part of the source content when generating its answer) and the structure is less obvious to the model.

4. **JSON array of chunk objects** — `[{file: "...", section: "...", content: "..."}]`. Rejected: heavier token overhead, forces the LLM to reason about JSON structure, doesn't match the existing context template which uses XML-like tags (`<project_knowledge>`, `<thread_documents>`, `<rules>`).

Option 1 (XML wrapper) is consistent with the existing prompt template style, which already uses `<project_knowledge>`, `<thread_documents>`, and `<rules>` as section delimiters. Adding `<chunk>` as a sub-element inside `<project_knowledge>` fits naturally.

### What does NOT change

- **Retrieval code is unchanged.** Hybrid search, multi-query expansion, reranking — all identical to pre-ADR-19. `combineDocuments` is the single rendering boundary that changes.
- **Worker-side code is unchanged.** `prepareMetadata` has been writing `file_name` and (since ADR-17/18) `section_path` to the Qdrant payload all along. No ingest-side changes needed.
- **Summary chunks from ADR-16** now get a `type="summary"` attribute they didn't have before, but their retrieval behavior is unchanged. The attribute just gives the LLM a signal to treat them as topic overviews when formulating answers.
- **Chunks without `file_name` metadata** render exactly as they did before (bare `pageContent` with double-newline join). No legacy data is affected.
- **Thread documents** (`thread_documents` section in the prompt) use a separate rendering path (`retrieveThreadDocuments` → `combineDocuments`) and automatically benefit from the same wrapper logic. No separate code path needed.

## Alternatives Considered

See "Why XML-style wrapper instead of alternatives" above for the format choice. Other architectural alternatives:

1. **Query-time filtering on `section_path`.** Parse the user's question for section hints (e.g., "what does Section 3 say about X") and apply as a Qdrant payload filter before retrieval. Higher ROI on specific kinds of questions but requires entity extraction at query time and reliable section-name matching. **Deferred to Phase 4d.2** as a larger piece of work. This ADR ships the simpler half first.

2. **Rich citation metadata in the LLM output** — ask the LLM to produce structured citations as JSON alongside its answer, then render them in the UI as clickable links. Needs UI changes (not just a prompt change) and changes to the streaming response format. **Deferred**: valuable but larger scope than Phase 4d.1 warrants.

3. **Expose ALL metadata fields to the LLM** — `sheet_name`, `timestamp_start_ms`, `timestamp_end_ms`, etc. Rejected for v1: `sheet_name` is rare (only XLSX chunks have it), timestamps are even rarer, and adding all of them to the wrapper bloats every chunk's token budget. They can be added later if real-world usage shows specific query patterns would benefit. The trio chosen for v1 (`file`, `section`, `type`) covers the common citation cases.

4. **Dedicated citation template separate from the answer template** — send citation instructions in a separate message or as a structured tool call. Rejected: more complexity for a prompt-engineering task that's small enough to fit in the existing answer template's rules section.

## Consequences

**Citations become section-aware for DOCX and PDF documents.** Users can verify answers against specific parts of long structured documents without re-reading the whole thing. "According to 'contract.pdf', Section 3.2 — Revenue terms, ..." instead of "According to 'contract.pdf', ...".

**Summary chunks are distinguishable to the LLM.** When a chunk with `type="summary"` is retrieved alongside body chunks, the LLM has signal that the summary is a topic overview (not a verbatim excerpt), which lets it blend multiple chunks more coherently in its answer.

**Token overhead per chunk is small but non-zero.** The wrapper adds approximately 40-80 tokens per chunk depending on file/section lengths. For a typical RAG context of ~20 chunks, that's ~800-1600 tokens of wrapper overhead — noticeable but well within GPT-5.4 and Claude 4.6 context budgets, and worth the citation quality gain.

**Prompt compatibility risk is low.** GPT and Claude both handle XML tags in the context cleanly — they don't leak the tags into their answers provided the prompt tells them not to (which the updated rule explicitly does). Real-world validation should still confirm this, and if the model occasionally includes `<chunk>` tags in responses, the rule can be strengthened.

**No retrieval changes, no worker changes, no ingest reprocessing needed.** This is purely a rendering boundary change. Chunks already in Qdrant from Phases 4a and 4b get the benefit immediately on their next query.

**No feature flag.** Consistent with Phases 1, 4a, and 4b — there's no toggle. Rollback requires a code revert. The graceful fallback for chunks without `file_name` means this change cannot make retrieval *worse* than before, only better for chunks with the right metadata.

**Test coverage**:
- 14 new unit tests for `combineDocuments` covering: wrapper format, attribute omission when metadata is missing/empty, XML escaping, mixed legacy/new chunk batches, non-string metadata types, empty input
- Full ragen-app suite: 482 passing (was 468, +14 new, zero regressions)

## Configuration

No new environment variables. The wrapper logic is unconditional (any chunk with `file_name` gets wrapped; any chunk without falls back to bare text).

## Key Files

| File | Role |
|------|------|
| `src/libs/chains/utils/chain-utils.ts` | `combineDocuments` + `renderDocumentChunk` + `escapeXmlAttribute` |
| `src/libs/chains/basic-rag/config.ts` | Citation rule in `systemTemplates.answerChain` |
| `src/libs/chains/utils/__tests__/combine-documents.test.ts` | 14 unit tests |

## Relationship to previous ADRs

| ADR | Stage | Phase | Purpose |
|-----|-------|-------|---------|
| ADR-12 | Post-retrieval | — | Cohere Rerank sharpens top-k |
| ADR-14 | Retrieval | Phase 1 | Hybrid dense + BM25 sparse |
| ADR-15 | Pre-retrieval | Phase 2 | Multi-query expansion |
| ADR-16 | Ingest + answer prompt | Phase 3 | Document summaries + basic citation rule |
| ADR-17 | Ingest | Phase 4a | Type-specific chunking: `section_path`, `sheet_name`, timestamps |
| ADR-18 | Ingest | Phase 4b | PDF `section_path` via structured Claude output |
| **ADR-19** | **Answer prompt** | **Phase 4d.1** | **Surface `section_path` + `chunk_type` in the LLM context** |

ADR-19 is the query-side counterpart to ADR-17 and ADR-18. Those two ADRs produced the `section_path` metadata at ingest; ADR-19 is the first time that metadata actually influences the LLM's output. Together they close the loop: structure detected at ingest → structure cited at answer time.

## Deferred work

- **Phase 4d.2: Query-driven metadata filters.** Parse section hints from the user's question and apply as Qdrant payload filters. Requires entity extraction at query time and reliable section-name matching. Larger scope, research-y, probably a week of work.
- **Query-time filtering on `sheet_name`** ("in the 2024 budget spreadsheet's Expenses sheet"). Same pattern as section filtering, smaller scope, specific to XLSX.
- **Query-time filtering on `timestamp_*_ms`** for SRT ("what was said in the first 10 minutes"). Needs a time-range parser for the query.
- **UI changes to render citations as clickable links.** Requires a structured citation format in the LLM output and a UI rendering layer. Out of scope for Phase 4d.1.
- **Exposing more metadata fields to the LLM** (`sheet_name`, timestamps) via the chunk wrapper. Deferred until we see real-world usage patterns that would benefit.
- **Validation of whether GPT and Claude both consistently honor the "do not include `<chunk>` tags in your response" rule in practice.** Unit tests confirm the rule is in the prompt but can't prove the model obeys it — that's a production observation.
