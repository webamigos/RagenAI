---
title: Mistral Document AI as a second document parser
status: approved
areas: [worker, rag, docs, infra]
adrs: [17, 18, 19, 20, 24, 37, 43]
---

# Mistral Document AI as a second document parser

## TLDR

Add `DOCUMENT_PARSER=mistral`, routing ingest through Mistral's hosted
`/v1/ocr` instead of the self-hosted Docling container, so a small install can
drop the heaviest supporting service (721 MB idle, CPU-bound, ~700 MB of image)
and still parse PDFs properly. The non-obvious part: this **inverts the reason
Docling is the default** — documents leave the deployment — so the trade-off is
not a footnote, it is the feature, and the fallback rules that exist to prevent
exactly this have to be rewritten rather than reused.

## Problem

Docling is the heaviest thing in the stack and the only reason a good number of
installs need more than a small VM.

From the repo's own measured table ([`README.md`](../../README.md), idle stack,
backing services only):

| Service           | Idle memory | Needed for             |
| ----------------- | ----------- | ---------------------- |
| Presidio analyzer | 959 MB      | PII masking (optional) |
| **Docling**       | **721 MB**  | local document parsing |
| LiteLLM           | 560 MB      | every model call       |
| Temporal          | 97 MB       | async ingest           |
| Postgres          | 93 MB       | everything             |
| …                 |             |                        |
| **Total**         | **~2.6 GB** |                        |

Plus ~700 MB of image to pull ([`.devcontainer/README.md`](../../.devcontainer/README.md)
leaves it out of the dev container for that reason), 500m CPU requested and 4 Gi
limit in [`deploy/helm/ragen/values.yaml`](../../deploy/helm/ragen/values.yaml)
with the comment "it is the heaviest supporting service by a wide margin", and
CPU-only inference that
[`docs/companion-services.md`](../companion-services.md) already warns is slow
on scanned PDFs.

What someone cannot do today: **run Ragen with competent PDF parsing without
hosting a parser.** The escape hatch that exists — `DOCUMENT_PARSER=legacy` —
is worse on both axes at once: it still sends PDFs off-site (as base64 to a
chat model), and it parses less well, because a chat model asked to transcribe
a PDF is not a layout engine. It has no page count, no bounding boxes, no
`column_header`, and it is the path ADR-18's structured prompt exists to prop
up. So the current menu is "host 721 MB" or "send it off-site _and_ parse
worse". There is no "send it off-site and parse well" option, which is the one
a small install actually wants.

Evidence this is the real shape of the demand rather than a hypothesis:

- [`apps/docs/docs/self-hosting.md`](../../apps/docs/docs/self-hosting.md)
  sizes installs against this table, and the dev container excludes Docling by
  name to stay small.
- `DOCUMENT_PARSER=legacy` is documented in
  [`README.md`](../../README.md) as the way to "skip Docling" — i.e. the
  footprint argument is already being answered with the worse parser.
- The bug report template asks for `DOCUMENT_PARSER` (`legacy` or `docling`),
  so the two-value world is already user-visible.

## Out of scope

- **Replacing Docling.** Docling stays the default. This adds a third value to
  `DOCUMENT_PARSER`, it does not change which one is chosen when nothing is set.
- **Retiring the `legacy` loaders.** They remain the only path for SRT and
  EPUB, and the only path for CSV/XLSX/Markdown/plain text under `mistral`
  (Mistral's OCR does not accept those formats).
- **Mistral's Annotations / Document QnA.** Deliberately excluded — see
  [Privacy posture](#privacy-posture-stated-precisely).
  Nothing in this spec sets `document_annotation_format`,
  `document_annotation_prompt` or `bbox_annotation_format`.
- **Self-hosting Mistral's OCR weights.** Mistral sells an on-prem deployment;
  it is a third posture (local parsing, commercial licence) and would be its own
  spec. Adding it later does not invalidate anything here — the client seam is
  the same, only the base URL changes.
- **Per-organization parser selection.** The parser is installation-wide, the
  same family as `DOCUMENT_PARSER`, `FEATURE_FLAG_RERANKING` and
  `FEATURE_FLAG_TABLE_CHUNKS` (ADR-43 argues this at length). Resolving it per
  organization would put two chunk shapes in one Qdrant collection — and, worse,
  two data-processing postures, when the posture is a contract-level property of
  the deployment rather than of a tenant.
- **Chat-side document handling** (`apps/web`'s client-side mammoth/SheetJS
  path, and PDFs attached to a chat turn as a data URL). This spec is the
  knowledge-base ingest in `apps/worker` only.
- **ADR-43 table chunks under Mistral** in v1. The excision path is built on
  Docling's cell model (`column_header`, `start_row_offset_idx`, spans);
  Mistral's equivalent is `table_format: "html"`, a different shape needing its
  own adapter. Deferred to Phase D and measured per ADR-20. Not a regression
  against the shipped default, because `FEATURE_FLAG_TABLE_CHUNKS` is off.
- **The source-highlight overlay for Mistral-parsed documents in v1.**
  `source_page` ships in Phase B — it is nearly free, because Mistral returns
  markdown already segmented by page — but `source_regions` waits for Phase C.
  In between, a Mistral-parsed document carries page labels and no overlay:
  degraded, not broken, and the absence discriminator in `vector-metadata.ts`
  already renders exactly that.
- **Batch API.** Mistral's batch endpoint halves the price but is asynchronous
  with its own job lifecycle; a Temporal activity that already owns retries and
  a 10-minute timeout is the wrong place to bolt that on. Worth its own spec if
  per-page cost becomes the binding constraint.

## What Mistral Document AI actually is

Researched 2026-09-14 against Mistral's own documentation; every number here
should be re-verified at implementation time, because the model line has moved
three times in nine months (OCR → OCR 3 → OCR 4 → OCR 4.1).

**Endpoint and model.** `POST /v1/ocr`. `mistral-ocr-latest` currently aliases
`mistral-ocr-4-1` (GA 2026-07-16). **Pin an explicit version**, not the alias —
the repo already pins Docling to `v1.32.0` for the reason spelled out in
`docker-compose.yml`, and an OCR model whose output shape changes under a
floating tag would change chunk content silently, which ADR-20 exists to
prevent.

**Input.** A `document` chunk, as one of: a public `document_url`, a `FileChunk`
referencing Mistral's Files API, or base64. Limits: **50 MB, 1000 pages.**

**Formats.** PDF, DOCX, PPTX, and images (PNG, JPEG, WEBP, GIF, BMP, TIFF,
AVIF). **Not XLSX, not CSV, not Markdown, not plain text** — the four formats
`DOCLING_SUPPORTED_TYPES` covers beyond Mistral's list.

**Parameters that matter here:**

| Parameter                                         | Use                                                                                                                                                |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages`                                           | not used — we want the whole document                                                                                                              |
| `table_format: markdown \| html`                  | `markdown` in v1; `html` is what Phase D needs                                                                                                     |
| `extract_header` / `extract_footer`               | interesting: lifts running heads out of the prose, which is the `page_header`/`page_footer` follow-up `readElementLabels` was plumbed for. Not v1. |
| `include_blocks` (default true)                   | paragraph-level bboxes + block labels, **OCR 4+ only**                                                                                             |
| `include_image_base64`                            | **off** — we do not store extracted images today                                                                                                   |
| `confidence_scores_granularity`                   | `page`, logged not stored; a cheap ingest-quality signal                                                                                           |
| `document_annotation_*`, `bbox_annotation_format` | **never set** — see privacy posture                                                                                                                |

**Response.** `{ pages[], model, usage_info }`. Each page: `index`, `markdown`,
`images[]` (each with `top_left_x/y`, `bottom_right_x/y`), `dimensions`
(`dpi`, `width`, `height`), plus `blocks[]` (`type`, `x`, `y`, `width`,
`height`, `text`) when `include_blocks`, and `tables` when
`table_format: "html"`. `usage_info` carries `pages_processed` and
`doc_size_bytes`.

**Price.** $4 per 1000 pages for OCR; $5 per 1000 pages when annotations are
used (which we do not). Batch API is 50% off. For scale: a 40-page contract
costs $0.16.

### Privacy posture, stated precisely

This is the part that earns or loses the feature, so it gets stated in the
terms a customer's counsel would use rather than in marketing terms:

- **The OCR endpoint is zero-data-retention by default.** Mistral's own help
  centre says so.
- **Annotations and Document QnA are not**, because they run a vision LLM
  rather than the OCR model. That asymmetry is exactly why this spec forbids
  the three annotation parameters: enabling one of them would silently move a
  deployment from ZDR to not-ZDR, and nothing in our stack would show it.
- **Mistral SAS is a French entity and La Plateforme runs primarily on EU
  infrastructure**; a DPA and EU data residency are available on the paid
  tiers. That makes this a materially different proposition from the `legacy`
  path for an EU customer — and it is a claim to verify against the current
  DPA at implementation time, not to restate from here.
- **No training on customer data** on the paid API tiers.

None of that changes the headline, which the docs must carry in plain words:
**with `DOCUMENT_PARSER=mistral`, every ingested document is transmitted to a
third party.** That sentence goes in `docs/security-and-privacy.md`,
`apps/docs/docs/security.md`, `apps/docs/docs/self-hosting.md` and the README —
not only in the configuration reference.

### Where each parser leaves us

|                         | `docling` (default)          | `mistral` (new)                     | `legacy`                                   |
| ----------------------- | ---------------------------- | ----------------------------------- | ------------------------------------------ |
| Documents go            | your hardware                | Mistral (EU, ZDR by default)        | the chat model behind `PDF_MODEL`          |
| Idle footprint          | 721 MB + 500m CPU            | none                                | none                                       |
| Marginal cost           | your CPU                     | $4 / 1000 pages                     | model tokens, per document                 |
| PDF, DOCX, PPTX, images | yes                          | yes                                 | PDF/DOCX/images only; **PPTX unsupported** |
| XLSX, CSV, MD, TXT      | yes (→ markdown splitter)    | **no** → legacy loaders             | yes                                        |
| SRT, EPUB               | no → legacy                  | no → legacy                         | yes                                        |
| Exact page count        | yes (`pages` map)            | yes (`pages.length` / `usage_info`) | PDF only (pdf-parse)                       |
| `source_page` per chunk | yes, via anchor walk         | yes, **natively per page**          | no                                         |
| `source_regions`        | yes, per text element        | yes, `blocks[]` (OCR 4+)            | no                                         |
| ADR-43 table cells      | yes (`column_header`, spans) | via `table_format: html` (Phase D)  | no                                         |
| Offline / air-gapped    | yes                          | no                                  | no                                         |

Two things in that table are worth saying out loud because they cut against the
expectation that a hosted parser must be a downgrade:

1. **Page attribution gets simpler and more reliable, not worse.**
   `buildTextElementAnchors` is a 60-line sequential `indexOf` walk with two
   documented invariants that "are broken by edits that look obvious, and
   neither fails loudly", and it produces a _sparse_ anchor list because an
   element whose text cannot be located verbatim is skipped. Mistral returns
   **markdown segmented by page**. Joining the pages and recording each join
   offset gives a dense, exact anchor per page with no string matching at all.
2. **`legacy` cannot parse PPTX at all** — the workflow throws
   `'PPTX files require DOCUMENT_PARSER=docling'`. Under `mistral` it can. So
   for the no-Docling install this is a capability _gain_ over the status quo
   escape hatch, in addition to being a quality gain.

## Relationship to the other 2026-09-14 specs

Four specs written on 2026-09-14 each remove a container from the default
install. They are **independent to build** — different seams, no shared
interface, none blocks another — and **coupled in where they land**, because
they converge on one compose file, one `create-ragen-app` first run, one README
footprint table, and in two places on one function.

| Spec                                                                           | Removes                       | Leaves behind                            |
| ------------------------------------------------------------------------------ | ----------------------------- | ---------------------------------------- |
| [A second worker runtime](2026-09-14-a-second-worker-runtime-bullmq.md)        | `temporal`, `temporal-ui`     | Redis becomes **required**, not optional |
| [pgvector](2026-09-14-pgvector-as-a-second-vector-store.md)                    | `qdrant`                      | a shared failure domain with Postgres    |
| [Mistral Document AI](2026-09-14-mistral-document-ai-as-a-second-parser.md)    | `docling`                     | documents leave the deployment           |
| [LiteLLM retirement](2026-09-14-replace-litellm-with-an-in-process-gateway.md) | `litellm`, `litellm-postgres` | provider keys in the app processes       |

Ten containers become four; the BullMQ spec's Phase F (BullMQ on Postgres) plus
Presidio staying optional takes it to one. **No single spec states that
destination**, which is why each carries this table — a reviewer holding any one
of them is looking at a quarter of a programme, and the reason to accept a
trade-off in one is usually written in another.

Three ADR numbers are reserved so the phases do not collide, since two of these
specs originally both claimed ADR-44: **44** the job runtime, **45** the vector
store, **46** the document parser. They are reserved, not ordered — whichever
lands first writes its own number.

Two couplings are specific enough to act on here:

1. **Under BullMQ, this parser is re-billable.** Every row in _Failure modes_
   that says "Temporal retries" or "Temporal owns that today" is written against
   `WORKER_RUNTIME=temporal`. The BullMQ spec keeps the same retry
   configuration but not its durability: a worker crash re-runs the whole job
   from the top, which re-issues the OCR call. At $4 per 1000 pages a
   1000-page document costs $4 per crash, and B2's pre-flight size guard does
   not help — the request was already made. Two consequences: the failure table
   needs a runtime-neutral rewrite when BullMQ lands, and caching a parse result
   by file content hash stops being a nicety. Neither is a reason to sequence
   these specs against each other; both are reasons to write the rows in terms
   of the seam rather than the engine.

2. **`MISTRAL_API_KEY` and the gateway.** _Alternatives considered_ says the
   LiteLLM retirement spec "gets a note saying so". It now does. Nothing else
   changes: the key lives in the worker's environment as a `@ragenai/env`
   fragment with its own rule, and the in-process gateway absorbs it if and when
   it grows a passthrough for `/v1/ocr`.

## Proposed solution

Add `'mistral'` as a third `DOCUMENT_PARSER` value, implemented as a sibling of
the existing Docling seam rather than as a branch inside it.

Concretely: `services/mistral-ocr-client.ts` next to `services/docling-client.ts`,
returning the **same result type**, consumed by an
`activities/loaders/load-mistral.ts` next to `load-docling.ts`, selected by the
same `getDocumentParser()` activity the workflow already calls. Everything
downstream of the loader — sanitize, language detection, PII masking, page
count, the markdown splitter, `attachSourcePages` — is untouched, because both
parsers produce one markdown string plus page anchors.

### Alternatives considered

**Make Mistral a Docling _fallback_ rather than a peer.** Rejected: it would
put an off-site transmission behind a failure path, which is the precise
mistake `DOCLING_STRICT` was added to prevent. A deployment must choose its
data-processing posture explicitly, not discover it during an outage.

**Route it through LiteLLM, so the key and the vendor live in one place.**
Rejected for v1: LiteLLM proxies chat, embeddings and rerank, but not
`/v1/ocr`, so this would mean a passthrough route config that the
[LiteLLM retirement spec](2026-09-14-replace-litellm-with-an-in-process-gateway.md)
is about to delete. **`MISTRAL_API_KEY` therefore lives in the worker's
environment**, declared as a `@ragenai/env` fragment with its own rule
(ADR-37) rather than as a loose `process.env` read. The in-process gateway is
the right long-term home and should absorb it when it lands — the seam here is
one function, so moving it later is cheap, and that spec gets a note saying
so.

**Generalise to a `DocumentParser` interface with a registry, so a third parser
is a plugin.** Rejected: ADR-38 is explicit that nothing loads in-process and
MCP is the extension API. Two implementations behind one result type is the
right amount of abstraction for two implementations; a registry for N=2 is
speculative generality, and the union type in `getDocumentParser` gives the
compiler the same exhaustiveness guarantee with none of the indirection.

**Use `document_annotation_format` to get structured output directly.** Rejected
on privacy grounds (it drops ZDR) and on ADR-20 grounds (it would change chunk
content via an unmeasured LLM step).

**Send a presigned S3 URL instead of bytes.** Rejected: Mistral requires a
publicly reachable URL, which means the document is briefly readable by anyone
holding the link, and it does not work at all for `STORAGE_PROVIDER=local`,
which is the default (ADR-27). Base64 in the request body keeps storage private
and matches what `convertWithDocling` already does with the local file.

### Naming: the transport keys have to be renamed

`load-docling.ts` writes `doclingPageCount`, `doclingPageAnchors`,
`doclingTables`, `doclingElementLabels` onto `doc.metadata`, the workflow and
`split-documents.ts` read them back, and `splitText` takes a
`parsedWithDocling` boolean. Under a second parser every one of those names is
a lie.

`docling-client.ts` argues against renaming `pageAnchors`: it is "the key a
completed loader activity already wrote into a running workflow's history".
That is a real hazard and it is narrow — it only bites a workflow that is
mid-flight across the deploy. [`docs/lessons/a-field-name-that-lies-outlives-every-comment.md`](../lessons/a-field-name-that-lies-outlives-every-comment.md)
argues the other way, from a case where a misleading name cost real money, and
its rule is unambiguous: _rename the field, then guard it._

**Decision: rename, with a one-release dual-read window.** Writers emit
`parserPageCount`, `parserPageAnchors`, `parserTables`, `parserElementLabels`
and `parsedToMarkdown` from day one; readers accept the old names as well for
one release, then the compatibility branch is deleted in a follow-up PR. That
satisfies the lesson without stranding an in-flight ingest across the deploy,
and the window is short because these keys never outlive a single workflow.

`tests/architecture/` gets a guard that the old names are not re-introduced,
the same shape as `chunk-metadata-has-no-page-number.test.ts`.

### `parser` never reaches Qdrant, and should

`load-docling.ts` sets `metadata.parser = 'docling'`, and `prepareMetadata`
drops it — that function "owns the canonical vector-store metadata shape" and
all other incoming keys are intentionally dropped. So **no chunk in Qdrant
records which parser produced it.**

With one parser that was merely untidy. With two it is an operational gap: the
answer to "which documents need re-indexing after we switched parsers" is not
derivable from the index, and neither is "is this bad answer coming from a
Mistral-parsed or a Docling-parsed chunk". Add `parser?: string` to
`VectorStoreDocumentMetadata` and carry it through. Absence is the
discriminator, as everywhere else in that file: a chunk written before this
field existed carries nothing and must not be assumed to be Docling's.

### Strictness is a property of the parser, not a Docling flag

`DOCLING_STRICT` means "do not fall back to a loader that may send the document
to an external model". Under `mistral` that sentence is incoherent — the
configured parser already does.

Rewrite the rule as: **never silently fall back to a processor the operator did
not choose.**

| `DOCUMENT_PARSER` | On parse failure, default                       | Reason                                                                                                                                |
| ----------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `docling`         | fall back to `legacy`, unless `PARSER_STRICT=1` | unchanged; an outage degrades rather than fails, and a confidential install opts out                                                  |
| `mistral`         | **fail**                                        | the fallback is a _different_ data processor, which is the unit a DPA is written in. An operator who wants it sets `PARSER_STRICT=0`. |
| `legacy`          | n/a                                             | no fallback exists                                                                                                                    |

`DOCLING_STRICT` is kept as a deprecated alias for `PARSER_STRICT` — it is set
to `1` in the shipped Helm values and in customer environments, and silently
changing what an existing variable does is how a confidential deployment starts
transmitting documents.

## Core surfaces touched

| Surface                                      | Change                                                                                                                                      | What catches a mistake                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                       | **none**                                                                                                                                    | —                                                                                                                       |
| `packages/rag-core`                          | `VectorStoreDocumentMetadata` gains optional `parser`                                                                                       | package tests + web/api/worker builds                                                                                   |
| `packages/env`                               | new `mistralOcr` fragment: `MISTRAL_API_KEY`, `MISTRAL_API_BASE`, `MISTRAL_OCR_MODEL`; merged into the worker schema with its rule (ADR-37) | `tests/architecture/provider-fragments-carry-their-rules.test.ts`, worker env tests, and the generated config reference |
| `packages/platform-contracts`                | **none** — parser choice is installation-wide, not a `FEATURE_KEYS` entry                                                                   | `tests/architecture/shared-contracts-are-not-recopied.test.ts`                                                          |
| `packages/create-ragen-app`                  | first-run must not start Docling when the operator picks Mistral, and must collect the key                                                  | `tests/architecture/create-ragen-app-manifest-is-current.test.ts`                                                       |
| `packages/crypto`, `storage`, `vault-client` | **none**                                                                                                                                    | —                                                                                                                       |
| auth / tenant scoping                        | **none** — no new query, no new route                                                                                                       | —                                                                                                                       |
| `apps/worker`                                | new client, new loader, renamed transport keys, parser union                                                                                | worker Jest suite + new contract tests                                                                                  |
| `docker-compose.yml`, Helm                   | Docling behind a compose profile so it is not started under `mistral`                                                                       | `npm run check:config-paths`, a manual `docker compose config` check                                                    |
| `infra/litellm/config.yaml`                  | **none**                                                                                                                                    | —                                                                                                                       |

The cheap news: no schema change, no migration, no new query, nothing touching
auth or tenant scope. The expensive news is entirely in packaging and docs.

## Data model

**No Prisma migration.** Nothing about a parser choice is per-row.

Three things change shape without a migration:

1. **`UserFile.pageCount`** is written from the parser's own count, as today.
   Under Mistral it comes from `pages.length`, cross-checked against
   `usage_info.pages_processed`. This feeds usage limits, so it is a billing
   input — the lesson above is explicit about that — and it must never fall
   back to the `ceil(chars / 3000)` estimate for a format Mistral paginates.
   If the two counts disagree, take `pages.length` (it is what we actually
   chunked) and log the discrepancy.

2. **Chunk metadata gains `parser`.** New chunks carry it; existing chunks do
   not, and their absence must not be read as "Docling". Nothing branches on it
   — it is for operators and for support.

3. **Rows written before this change**: untouched and still correct. A document
   ingested under Docling keeps its chunks, its `source_page` and its
   `source_regions`. Switching `DOCUMENT_PARSER` changes nothing already in
   Qdrant; only a re-index does, via `Workflow.REINDEX_DOCUMENT_VERSION`. The
   docs must say this, because "I switched the parser and my old documents
   didn't improve" is the obvious first support ticket.

## Failure modes

| Situation                                                       | Behaviour                                                                                                                                                                                           |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mistral API unreachable / 5xx                                   | Temporal retries (3 attempts, the existing `loadPdf`/`loadDocling` proxy). Then per the strictness table: fail under `mistral`.                                                                     |
| 401 — key wrong or revoked                                      | Non-retryable. Retrying a rejected credential five times just spends the retry budget; `ParsingStatus.FAILED` with a message naming the variable.                                                   |
| 429 — rate limited                                              | Retryable, with the existing exponential backoff. Log the limit; a bulk import of 500 documents will hit it and an operator needs to see why ingest slowed rather than why it failed.               |
| File > 50 MB or > 1000 pages                                    | **Rejected before the request**, non-retryable, with a message saying the limit and that `docling` has no such limit. Discovering a hard API limit as a 413 after uploading 60 MB is a bad failure. |
| Unsupported format (XLSX, CSV, MD, TXT, SRT, EPUB)              | Not an error — routed to its legacy loader, exactly as SRT and EPUB are under Docling today. The `MISTRAL_SUPPORTED_TYPES` set is what makes this explicit rather than accidental.                  |
| Empty `pages[]`, or every page's markdown blank                 | Treated as a failed parse, same as `convertWithDocling`'s empty-markdown check. An empty document that "succeeds" produces zero chunks and a file that looks ingested.                              |
| `blocks[]` absent (older model pinned, or `include_blocks` off) | `source_regions` omitted. Absence is the discriminator; the overlay simply does not render. Not an error.                                                                                           |
| `dimensions` missing or zero                                    | Region dropped, anchor kept — the same invariant `toRegion` already enforces for Docling.                                                                                                           |
| Response shape drifts after a model bump                        | The contract test (fixtures, mirroring `docling-parser-contract.test.ts`) fails in CI rather than in production. This is why the model is pinned.                                                   |
| Document contains prompt injection                              | Unchanged — `sanitizeDocuments` runs after every loader, before chunking.                                                                                                                           |
| Two ingests race on one file                                    | Unchanged — Temporal owns that today.                                                                                                                                                               |
| Operator sets `DOCUMENT_PARSER=mistral` with no key             | The worker **refuses to boot**, via the env fragment's rule. Not a per-ingest failure: a deployment that cannot parse anything should say so at boot, not once per upload.                          |
| Operator sets `mistral` and leaves Docling running              | Harmless, just wasteful. The compose profile means the default path does not do this.                                                                                                               |

## Phases

Each phase leaves the application working, with Docling still the default
throughout.

### Phase A — parser-neutral seam (no behaviour change)

- [ ] **A1.** Rename the result type and its fields to parser-neutral names
      (`ParsedDocument` in place of `DoclingConversion`), keeping
      `docling-client.ts` as the only implementation. Types only; no runtime
      change.
- [ ] **A2.** Rename the transport keys and `parsedWithDocling` per the naming
      decision, with readers accepting both spellings. Add the architecture
      guard against re-introducing the old names.
- [ ] **A3.** Turn `getDocumentParser()`'s `parser: string` into a union
      (`'docling' | 'mistral' | 'legacy'`), so the workflow's branch is
      exhaustive and an unknown value is rejected at the boundary rather than
      falling through to legacy silently.
- [ ] **A4.** Carry `parser` through `prepareMetadata` into
      `VectorStoreDocumentMetadata`. Docling-parsed chunks start recording
      `'docling'`; older chunks keep nothing.
- [ ] **A5.** Introduce `PARSER_STRICT` with `DOCLING_STRICT` as a deprecated
      alias, unchanged semantics for `docling`.

_Working state:_ identical behaviour, better names, one new metadata field.

### Phase B — the Mistral parser

- [ ] **B1.** `packages/env`: the `mistralOcr` fragment and its rule —
      `MISTRAL_API_KEY` required when `DOCUMENT_PARSER=mistral`. Regenerate the
      configuration reference.
- [ ] **B2.** `services/mistral-ocr-client.ts`: base64 request, size/page
      pre-check, the error taxonomy from the failure-modes table, page-joined
      markdown, dense per-page anchors, exact page count. Returns
      `ParsedDocument`. No `blocks`, no tables yet.
- [ ] **B3.** `activities/loaders/load-mistral.ts` + `MISTRAL_SUPPORTED_TYPES`
      (PDF, DOCX, PPTX, IMAGE — **not** XLSX/CSV/MD/TEXT).
- [ ] **B4.** Workflow routing and the strictness table. `mistral` fails rather
      than falling back, by default.
- [ ] **B5.** Contract tests against recorded fixtures; unit tests for page
      attribution, the size guard and each error class.

_Working state:_ `DOCUMENT_PARSER=mistral` parses PDF/DOCX/PPTX/images with
correct page counts and `source_page`; no highlight overlay; spreadsheets and
text go to their legacy loaders.

### Phase C — provenance parity

- [ ] **C1.** Read `blocks[]` and normalise each box against `dimensions` into
      `SourceRegion` (0–1, top-left origin), reusing the clipping rules
      `toRegion` already documents.
- [ ] **C2.** Attach regions to chunks through the existing
      `attachSourcePages` path.
- [ ] **C3.** Log `confidence_scores_granularity: 'page'` per ingest as a
      quality signal. Logged, not stored.

_Working state:_ the source-highlight overlay works for Mistral-parsed
documents.

### Phase D — tables (ADR-43 parity), measured

- [ ] **D1.** `table_format: 'html'`, adapting Mistral's HTML tables to the
      `ParsedTable` cell model (`<th>` → `columnHeader`, `rowspan`/`colspan` →
      spans).
- [ ] **D2.** Run the `tabele-bilingual-v1` benchmark under
      `FEATURE_FLAG_TABLE_CHUNKS=1` with `DOCUMENT_PARSER=mistral`, against
      `results/2026-09-12-tabele-bilingual-v1-baseline.md`. Publish the result
      whichever way it goes, per ADR-20.

_Working state:_ unchanged unless the flag is on, which it is not by default.

### Phase E — packaging and documentation

- [ ] **E1.** Docling behind a compose profile; `ragen:up:full` keeps starting
      it, a Mistral install does not.
- [ ] **E2.** `packages/create-ragen-app`: ask which parser, collect the key,
      skip the Docling container accordingly — the first-run path nothing else
      exercises.
- [ ] **E3.** Helm: `docling.enabled: false` documented as a supported
      combination with `DOCUMENT_PARSER: mistral`.
- [ ] **E4.** Docs — and this is the phase the spec exists for:
      `docs/security-and-privacy.md`, `apps/docs/docs/security.md`,
      `apps/docs/docs/self-hosting.md`, `README.md` (both the footprint table
      and the parsing section), `docs/companion-services.md`,
      `apps/worker/AGENTS.md`, `.env.example`, `apps/worker/.env.example`, and
      `.github/ISSUE_TEMPLATE/bug_report.md` (a third value).
- [ ] **E5.** ADR-46 (reserved — see _Relationship to the other 2026-09-14
      specs_) recording the decision: _a hosted parser is a supported posture,
      chosen explicitly, never fallen back into._
- [ ] **E6.** `docs/runbooks/mistral-ocr-upgrade.md`, mirroring the Docling
      runbook — how to move the pinned model version, what to smoke-test, and
      the reminder that the annotation parameters must stay unset.

## Testing

Per the Testing Requirements in [`AGENTS.md`](../../AGENTS.md).

**Unit (Jest, `apps/worker`)** — the bulk of it:

- `mistral-ocr-client`: page joining and anchor offsets; exact page count;
  `blocks` → `SourceRegion` normalisation including the clipping and
  origin cases `toRegion`'s tests already cover; each error class (401
  non-retryable, 429 retryable, 5xx retryable, oversize pre-rejected, empty
  pages rejected).
- `load-mistral`: `MISTRAL_SUPPORTED_TYPES` routing, and that an unsupported
  type reaches its legacy loader rather than erroring.
- Workflow: strictness — `mistral` + failure ⇒ `ParsingStatus.FAILED` and no
  legacy call; `docling` + failure ⇒ unchanged behaviour; `PARSER_STRICT` and
  the `DOCLING_STRICT` alias agree.
- Splitter: the renamed transport keys, and that the compatibility reader still
  accepts the old ones.

**Contract (fixtures)** — `mistral-parser-contract.test.ts`, mirroring
`docling-parser-contract.test.ts`: a recorded response is pinned so a model bump
that changes the shape fails in CI. Fixtures are committed responses, not live
calls — CI has no Mistral key and must not need one.

**Architecture** — the old transport key names do not come back; the
`mistralOcr` fragment ships with its rule.

**Package** — `@ragenai/env` tests for the new fragment;
`create-ragen-app` manifest test.

**E2E** — **none.** A `smoke-*`/`p0-*` test would need a live API key in CI,
which makes the gate depend on a third party's uptime and on a secret in every
fork. The behaviour that must not break — Docling stays the default, and an
unset `DOCUMENT_PARSER` changes nothing — is covered by the existing suite,
because this PR must not change it. A manual entry goes in
`docs/regression-checklist.md` instead: ingest one PDF, one DOCX, one PPTX and
one XLSX under `mistral`, and confirm page numbers appear and the XLSX still
gets row-group chunks.

**RAG quality** — Phase D only, per ADR-20. Phases B and C do not change
chunking: B changes which engine produces the markdown (and the markdown
differs, so answer quality can differ), but it is an opt-in parser and the
default is untouched. Worth stating plainly in the docs: **`mistral` is not
measured against the Docling baseline**, and an operator who cares should run
`evals/` on their own corpus. That is the same advice the security doc already
gives about self-hosted models.

## Rollout and rollback

**Flag.** `DOCUMENT_PARSER=mistral`, installation-wide, env only. No database
state, no migration, nothing to backfill.

**Order.** A → B → C → D → E, and each is independently mergeable. A ships with
Docling still the only parser. E can land before D.

**Rollback.** Unset `DOCUMENT_PARSER` (or set it back to `docling`) and restart
the worker; the next ingest uses Docling. Documents already ingested under
Mistral keep their chunks — they are not wrong, just produced by a different
engine — and a re-index converts them if the operator wants uniformity. If the
Phase A rename turns out to strand an in-flight workflow, the compatibility
readers are already there; that is what they are for.

**Revert the PR** is a complete answer for every phase except A, and even A has
no migration — its risk is a workflow mid-flight across the deploy, which the
dual-read window covers, and which a low-traffic window makes negligible.

**The one-way door.** None, technically. Contractually: an operator who turns
this on has sent documents to Mistral, and turning it off does not unsend them.
That belongs in the docs next to the flag, not in a release note.
