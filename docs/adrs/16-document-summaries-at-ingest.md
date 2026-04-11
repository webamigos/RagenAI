# ADR-16: Document Summaries at Ingest Time

**Status:** Accepted
**Date:** 2026-04-11

## Context

ADR-14 added hybrid dense+sparse retrieval. ADR-15 added multi-query expansion. Both improved how the retrieval pipeline **probes** the vector store, but neither changed what is actually stored in the store. Every chunk is still a flat slice of document text with no document-level context.

This matters for two reasons:

1. **Vocabulary mismatch survives into the index.** A chunk in the middle of a 200-page contract says "Party A shall remit payment within 30 days." The user's question is "how long until I need to pay?" Neither dense nor sparse retrieval links the two reliably because no chunk restates the document's high-level topic.

2. **Retrieval has no concept of a "document."** The top-k result list can be five chunks from five different documents, or five chunks from the same document. The LLM sees them as an unordered bag of text, which degrades citation quality ("I can't tell which document this came from") and makes answers less trustworthy.

A **document-level summary** generated at ingest time addresses both. The summary is a single dense block of text written in the document's own language that captures what the document is about, what it contains, and which named entities matter. That block lives in two places:

1. **On `UserFile.metadata.summary`** — for the UI (document previews in the knowledge base list) and for future summary-first retrieval paths.
2. **As a synthetic "summary chunk" in the same Qdrant collection** — so it participates in the same hybrid retrieval pipeline as every other chunk, but matches on queries that the flat body chunks would miss.

## Decision

During ingest in `ragen-worker`, after parsing and text extraction but before or alongside embedding, generate a 1-2 paragraph summary of the document with a single cheap LLM call. Prepend the summary as a synthetic chunk in the list sent to the vector store so it becomes retrievable immediately. Persist the same summary to `UserFile.metadata.summary` after embedding succeeds.

### Where the work happens

**Worker side (ragen-worker):**
- New activity `generateDocumentSummary` in `src/activities/documents/`
- New db activity `mergeFileMetadata` in `src/activities/db/` backed by a JSONB `||` merge (preserves existing keys such as Google Drive import fields)
- Both wired into `src/workflows/parse-and-embed.ts` between parsing and embedding

**App side (ragen-app):**
- No retrieval changes — the summary chunk participates in hybrid retrieval automatically
- Small citation-quality rule added to the answer prompt template (`basic-rag/config.ts`) so the LLM mentions source document names when relevant. This is the *only* change ragen-app needs for this feature.

### Summary generation activity

The activity is best-effort and **never throws**. Failures in the LLM call return an empty string; the caller treats that as "no summary" and continues. Rationale: summaries are an enrichment, not a correctness requirement. A document must still ingest successfully even if its summary can't be generated.

Behavior:
- **Feature flag off** (`FEATURE_FLAG_DOC_SUMMARIES=0` or `=false`) → return `""`, no LLM call
- **Empty or whitespace-only input** → return `""`, no LLM call
- **Input longer than 50,000 characters** → truncate to first 50,000 before sending (≈12k tokens, safely under model context window; the beginning of a document typically contains the most summary-worthy content)
- **LLM error** (rate limit, network timeout, etc.) → log warning, return `""`
- **LLM returns empty text** → log warning, return `""`

### Synthetic summary chunk

When a summary is generated successfully, it is prepended to the `docs` list with `metadata.chunk_type: 'summary'`:

```
{ pageContent: <summary>, metadata: { chunk_type: 'summary' } }
```

It then flows through the same `prepareMetadata` → `addDocumentsToVectorStore` pipeline as every other chunk. It gets a dense vector, a sparse BM25 vector, and lives in the same Qdrant collection as the body chunks — no separate collection, no filter-driven routing.

Why this shape:
- Zero changes to the retrieval path in ragen-app. Hybrid search naturally surfaces the summary chunk when it matches, alongside body chunks.
- `chunk_type: 'summary'` is filterable via Qdrant payload if we ever want summary-only retrieval (hierarchical retrieval path) as a follow-up — this ADR defers that.
- Rerank (ADR-12) sees the summary as a candidate and scores it on the same basis as any other chunk.

### Database persistence

After embedding succeeds, the workflow calls `mergeFileMetadata` with `{ summary }`. The db layer uses `COALESCE(metadata, '{}'::jsonb) || ?::jsonb` to merge into the existing JSONB column, preserving Google Drive import fields (`driveFileId`, etc.) that may already be set.

`UserFile.metadata` is already typed as `Json?` in the Prisma schema — no migration required.

### Model choice

`SUMMARY_MODEL` env var, default `gpt-5.4-nano`. Rationale:
- Smallest and cheapest model currently provisioned in the LiteLLM proxy (`litellm/config.yaml`). Per-document summarization cost matters — this runs once per uploaded file.
- Summarization is a well-trodden task for small models; quality is sufficient for retrieval-matching purposes (we are not writing journalism).
- Aligns with CLAUDE.md's guidance "do not upgrade cheap models without explicit approval."

**Note**: CLAUDE.md previously referenced `gpt-4.1-nano` as the cheap/fast default. That model is no longer provisioned in the proxy — the 5.4 family and Claude 4-6 replaced the 4.x tier. CLAUDE.md should be updated as a follow-up; this ADR sets the corrected reference.

### Feature flag

`FEATURE_FLAG_DOC_SUMMARIES` — **default on**. Any value that isn't `"0"` or `"false"` (case-insensitive) is treated as enabled. Flag is checked inside the activity, so Temporal workflow replay stays deterministic regardless of env var changes.

## Alternatives Considered

1. **Summary on `UserFile.metadata` only, not in Qdrant.** Simpler data flow, but the summary never participates in retrieval. Users benefit only when they browse the KB UI, not when they ask questions. Rejected: the retrieval win is the main motivation.

2. **Summary in Qdrant only, not on `UserFile.metadata`.** Removes the JSONB write and the new db activity. Rejected: the UI benefit is real and low-cost (one more activity call), and future features (summary-based document previews, summary-first retrieval) need it on the row.

3. **Generate summaries asynchronously after embedding** (a separate Temporal workflow triggered after ingest). More resilient in theory — a slow LLM doesn't block ingest. Rejected: adds orchestration complexity, creates a window where documents exist without summaries, and the "best-effort, returns empty string" error handling in the inline path already protects against LLM slowness. Inline is simpler and the latency hit is ~3-10 seconds on gpt-5.4-nano per document, acceptable for an ingest pipeline that already runs parsing, chunking, and embedding serially.

4. **Structured summary** (title, abstract, key facts, entities as JSON). Richer output, more useful downstream. Rejected for v1: requires prompt complexity and JSON parsing, adds failure modes, and the simple "1-2 paragraphs of prose" approach is enough for retrieval matching. Structured output is a candidate for a follow-up ADR if quality data shows plain summaries plateau.

5. **Parent-document retrieval** (embed small chunks, return larger parent chunks). Different architectural approach to the same "chunks lack document context" problem. Rejected for v1: requires restructuring chunk IDs and metadata, and a summary-as-chunk approach delivers most of the same benefit with far less code churn. Parent-doc retrieval remains a candidate for a later phase.

6. **Larger model for summarization** (`claude-haiku-4-5`, `gemini-2.5-flash`). Better summary quality, higher cost. Rejected: nano-tier quality is sufficient for retrieval matching, which is the load-bearing purpose of the summary. UI preview quality is a lower bar. Switchable via `SUMMARY_MODEL` env var if data shows a quality shortfall.

## Consequences

**Improved retrieval on vocabulary-mismatch queries** — the most common failure mode for dense-only or even hybrid retrieval. The summary chunk acts as a "topic anchor" that rephrases the document in different words than its body.

**Improved citation quality** — with summaries in the context and a citation-quality prompt rule, the LLM can reference source documents by name. Users can verify answers against the source.

**Added ingest cost** — one extra LLM call per uploaded document on the cheapest provisioned model. Negligible compared to the embedding cost (which makes dozens of calls per document via `embedMany`).

**Added ingest latency** — ~3-10 seconds per document on `gpt-5.4-nano`, running synchronously between parsing and embedding. Acceptable for an already-async Temporal pipeline.

**One extra Qdrant point per document** — the summary chunk. Storage cost is trivial.

**No schema migration** — `UserFile.metadata` is an existing `Json?` column.

**Worker-app coordination** — the `chunk_type: 'summary'` metadata is produced by the worker and consumed (transparently) by the retrieval path in ragen-app. Neither side needs the other to explicitly handle it: worker writes it, Qdrant indexes it, ragen-app receives it like any other chunk.

**Rollback safety** — `FEATURE_FLAG_DOC_SUMMARIES=0` disables the entire feature at runtime in the worker. No effect on existing documents; new uploads simply skip the summary step.

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `FEATURE_FLAG_DOC_SUMMARIES` | `1` (on) | Set to `0` or `false` to disable summary generation |
| `SUMMARY_MODEL` | `gpt-5.4-nano` | LLM model used for summarization. Must be provisioned in LiteLLM. |

## Key Files

| File | Role |
|------|------|
| `ragen-worker/src/consts.ts` | `SUMMARY_MODEL` constant |
| `ragen-worker/src/activities/documents/generate-document-summary.ts` | LLM summarization activity with feature flag + error handling |
| `ragen-worker/src/activities/documents/__tests__/generate-document-summary.test.ts` | 11 unit tests |
| `ragen-worker/src/activities/db/merge-file-metadata.ts` | Wrapper that logs and swallows db errors |
| `ragen-worker/src/services/db/db.ts` | `mergeFileMetadata` JSONB `||` merge |
| `ragen-worker/src/workflows/parse-and-embed.ts` | Wiring: summary call, chunk prepend, metadata merge |
| `ragen-worker/src/__tests__/workflow.spec.ts` | Two new integration tests for summary flow |
| `ragen-app/src/libs/chains/basic-rag/config.ts` | Citation-quality rule in answer prompt |

## Relationship to previous ADRs

| ADR | Stage | Purpose |
|-----|-------|---------|
| ADR-11 Qdrant | Storage backend | Named-vector collection host |
| ADR-12 Cohere Rerank | Post-retrieval | Reorders by cross-encoder precision |
| ADR-14 Hybrid search | Retrieval | Widens each probe (dense + BM25) |
| ADR-15 Multi-query | Retrieval | Widens probes (multiple phrasings) |
| **ADR-16 Summaries** | **Ingest** | **Widens what's in the index** |

ADR-14, ADR-15, and ADR-16 are complementary and compose cleanly. ADR-14 and ADR-15 improve how we search; ADR-16 improves what we're searching over.

## Deferred work

- **Structured summaries** (JSON with title, abstract, key facts, entities)
- **Hierarchical retrieval** (summary-first: retrieve summaries → filter chunks to those docs → rerank)
- **Summary-based document previews in the KB UI**
- **Parent-document retrieval**
- **Section/heading metadata per chunk** (originally bundled with this phase; split out because PDF heading detection is non-trivial)
- **Entity extraction** beyond what the summary prose naturally includes

These are all candidates for follow-up ADRs as quality data informs prioritization.
