---
title: Each chunk is indexed with the context that places it in its document
status: approved
areas: [rag, worker, knowledge-base]
adrs: [14, 16, 17, 19, 20, 24, 50]
---

# Each chunk is indexed with the context that places it in its document

## TLDR

At ingest, every chunk gets a short prefix that says where it sits in its
document, for example "Section 4.2 of the 2025 service agreement, on response
times". The prefix is embedded, and indexed for BM25, together with the chunk.
This is Anthropic's contextual retrieval. The non-obvious parts:

- **Changing the embedded text re-indexes an organization's whole corpus.**
- **There is a free variant to beat first:** a deterministic prefix built from
  the title, the section and the ADR-16 summary, with no model call per chunk.

## Decisions

Answered 2026-09-29, each recommendation accepted.

- **D1 (was Q1). A per-org feature key**, `contextualChunks`, defaulting to
  `false` (ADR-50). The worker reads it at job time, as it reads
  `ragScoreOnIngest`.
- **D2 (was Q2). Existing documents are re-indexed on request.** An admin
  starts the re-index from the panel. Every point carries a
  `context_version`, so a collection that is only partly re-indexed is
  visible, and there is a backfill script for operators.
- **D3 (was Q3). The free prefix is measured first.** The per-chunk model
  call is built only if it clearly beats the free prefix.
- **D4 (was Q4). The prefix is measured in dense only and in dense plus BM25,
  as separate arms.** The better one ships.
- **D5 (was Q5). The per-chunk call reuses `SUMMARY_MODEL`, with a
  per-document cap.** Past the cap, the document gets the free prefix instead.
- **D6 (was Q6). The re-index gaps are fixed first**, in their own PRs:
  `reindexDocumentVersion` must mask PII and re-add the summary chunk. Only
  then does it learn to add context.

## Problem

- **A chunk is embedded as bare text.** Dense embedding and BM25 both use
  `pageContent` (`apps/worker/src/services/qdrant.ts`). Nothing about the
  document is prepended, not even the title or the section. Docling prose
  chunks do not carry `section_path` at all; only table chunks have it
  (`apps/worker/src/activities/splitters/split-documents.ts`).
- **A chunk that only makes sense in context is not found.** An example is
  "The fee is 4% of the contract value", which does not say which contract.
  The ADR-16 summary exists, but it is a separate retrieval candidate
  (`chunk_type: 'summary'`). It helps a question about the whole document,
  not one about that chunk.
- **Cross-lingual retrieval is the measured weak spot.** It scored 2/8, 3/8
  and 3/8 on the three unoptimized `kolej` Docling runs of 2026-09-27
  (`apps/web/evals/rag-benchmark/results/`).

## Out of scope

- Query-time selection and expansion. That is the sibling spec,
  [model-chosen sections](2026-09-29-llm-document-selection.md), which shares
  Phase A.
- Multipass indexing with small and large chunks.
- Changing chunk sizes or splitters (ADR-17), beyond giving Docling prose
  chunks the `section_path` they already should have.
- Translating the prefix into the question's language. If Phase A shows the
  prefix hurts cross-lingual questions, that becomes its own question.

## Design notes

How Anthropic's contextual retrieval is usually built. This is a starting
point, to be checked against our own numbers:

- **Default.** Off by default.
- **Calls.** One summary call per document, then one context call per chunk.
  The document is the cacheable prefix; the chunk and a request for a short
  context that situates it within the document follow.
- **Budget.** Space for the context is reserved inside the embedding window,
  so the chunk shrinks by that much. Contextualisation is skipped when the
  document fits in one chunk, or when too little content would remain.
- **Where it goes.** Into both the dense and the keyword index. It is stored
  in separate fields so it can be stripped before the chunk reaches the
  answer model or a citation.
- **Failures and cost.** A chunk whose call fails is indexed without context;
  indexing never fails because of it. The admin sees a deliberately high cost
  estimate before switching it on, and switching it on is a full re-index.

## Proposed solution

### What is stored, and what is embedded

**The prefix is stored beside the chunk, never inside it.**

- **Payload.** Each point gains two fields:
  - `context_prefix`, a string that may be empty;
  - `context_version`: absent or 0 for no prefix, 1 for the free prefix,
    2 for the model's prefix.
- **`pageContent` and `content` stay the bare chunk.** The answer model, the
  citation snippet, the source drawer and Optimize all read the chunk
  exactly as today. None of them needs to strip anything.
- **Dense text** is `context_prefix + "\n\n" + chunk`.
  - The prefix is capped at 400 characters.
  - The combined text is truncated at `MAX_EMBEDDING_TEXT_CHARS` as today,
    so the tail of a long chunk is what gets cut, not the prefix.
  - The combination is built by one function in `packages/rag-core`,
    `embeddingTextFor(chunk, prefix)`, beside `prepareEmbeddingBatches`,
    so the rule lives in one place.
- **BM25 text** is the same combination in the "dense + BM25" arm, and the
  bare chunk in the "dense only" arm. D4 picks one. The choice is a constant
  in rag-core, not a setting.
- **The query side is unchanged.** Queries are embedded and encoded as
  today. The prefix changes what documents look like, not what questions
  look like.

### The free prefix (version 1)

The free prefix is built without any model call:

- the file's title: the file name without its extension, or the Docling
  document title when the parser found one;
- the chunk's `section_path`, when present;
- the first sentence of the ADR-16 summary, when summaries are on, capped
  at 200 characters.

**Docling prose chunks get the `section_path` they lack today.** The markdown
splitter tracks the heading stack while it splits: `#`, `##` and so on, as
Docling emits them. It sets `sectionPath` on each prose chunk, as table
chunks already have it. This is useful on its own, because ADR-19 renders a
`section` attribute that today is empty for most Docling documents. So it is
Phase A's first step.

### The model's prefix (version 2, only if Phase A says so)

- **One call per chunk**, on `SUMMARY_MODEL` (D5), at temperature 0 with
  reasoning off. The answer is capped at 100 tokens, then at the prefix cap.
- **Input.** The whole document when it is at most 16,000 characters
  (about 4,000 tokens); otherwise the ADR-16 summary plus the chunk's
  `section_path`. The document part comes first, so a provider that caches
  prompts can reuse it. The spec does not assume caching exists: on the EU
  route it may not.
- **Per-document cap.** A document with more than 200 body chunks gets the
  free prefix instead. That is where the cost, chunks × document size, stops
  being small. The cap is a constant, recorded in the payload's
  `context_version`.
- **Skipped when the document is a single chunk.** There is nothing for the
  context to add.
- **Concurrency is bounded** to 8 calls per document, so one large upload
  cannot take a provider's rate limit from every other job.
- **A failed call falls back to the free prefix for that chunk.** Indexing
  never fails because of it, and `context_version` records which one the
  chunk got.
- **Usage.** It is recorded as a new `AiUsageStep.CHUNK_CONTEXT`, not as
  `CHAT_COMPLETION`, which would add one to the monthly **message** count per
  chunk (`check-usage-limits-query.ts` counts `CHAT_COMPLETION` rows as
  messages). It is shown on the AI-usage page.

### PII

**The prefix is built from masked text only.** The context step runs after
`maskPii`, on the same `docs` the summary reads (`parse-and-embed.ts`), so a
prefix can never carry a value that masking removed.

In `dual_content` mode the dense embedding uses the decrypted original. The
prefix is still the masked one, because it is stored in the payload in
plaintext, as `pageContent` is. So the embedded text is `masked prefix +
original chunk`, which is a deliberate asymmetry: the prefix is readable by
anyone who can read the collection, and the chunk original is not.

### Switch, and existing documents (D1, D2)

- **The switch.** The worker reads `contextualChunks` with
  `resolveOrgFeatures(orgId)` inside the ingest job, and a file is indexed
  with context from the moment it is on. The key decides whether new ingests
  get a prefix; which version they get is the deployment's constant
  (1 until Phase B, 2 after, if B ships).
- **Re-index on request.**
  - The organization's knowledge-base settings show how many files are
    indexed below the current `context_version`, read from Qdrant by a count
    per version, with a "Re-index" button.
  - The re-index goes through `runFileEmbeddings` for files with no edited
    version, and through `reindexDocumentVersion` for edited ones, never by
    overwriting a stored file (AGENTS.md).
  - It is throttled by the existing ingest ceiling (`DOCLING_MAX_CONCURRENCY`
    on BullMQ), so it cannot starve uploads beyond what a large upload
    already does.
- **Backfill script.** `apps/worker/src/scripts/reindex-for-context.ts --org
  <id> [--dry-run]` does the same for operators, and prints the count per
  version before and after.
- **Turning the key off.** New ingests stop adding a prefix; already
  prefixed chunks keep theirs until re-indexed. The count in the settings
  shows it.

## Core surfaces touched

| Surface | Change | What catches a mistake |
| --- | --- | --- |
| `packages/rag-core` | `embeddingTextFor`, prefix cap, `context_version` in the metadata type | package tests; worker build |
| `packages/platform-contracts` | `contextualChunks` feature key | `feature-keys-agree.test.ts` |
| `prisma/schema.prisma` | `AiUsageStep.CHUNK_CONTEXT` (Phase B only) | migration + `npm run verify`; `every-ai-usage-step-is-on-the-page.test.ts` |
| apps/worker ingest and re-index | prefix built and embedded | handler tests |
| apps/web settings | count per version, re-index action | component + action tests; `canManageOrg` guard |
| tenant scoping | the count and the re-index are per organization, from the session | action tests with a second org |

## Data model

- **Qdrant payload: `context_prefix` and `context_version`.** Points written
  before this change have neither, and they read as version 0. No backfill is
  needed for correctness, only for the prefix itself (D2).
- **One enum value**, `AiUsageStep.CHUNK_CONTEXT`, added only if Phase B
  ships.
- **Nothing in Postgres per chunk.** `UserFile.metadata` gains nothing; the
  version lives with the points it describes.

## Failure modes

- **The context model is down.** Each chunk falls back to the free prefix
  (version 1), and the file indexes normally.
- **It is rate-limited.** The same fallback, per chunk. The bounded
  concurrency makes it rarer, not impossible.
- **It returns a long or empty answer.** A long answer is cut at the cap; an
  empty one falls back to the free prefix.
- **A hostile document injects text into its own prefix.** The prefix is
  document-derived text in the document's own index, which is the same trust
  level as the chunk. It never reaches the answer model, which reads
  `pageContent`.
- **The prefix pushes a chunk past the embedding limit.** The chunk's tail
  is truncated, and this is logged as today's truncation is.
- **A re-index runs while a user edits the document.** The version's own
  re-index job replaces the file's points last, as today. `context_version`
  is per point, so a race shows up in the count instead of hiding.
- **The key is on but summaries are off** (`FEATURE_FLAG_DOC_SUMMARIES`
  unset). The free prefix has no summary sentence, and the model's prefix
  above 16,000 characters has only the section path. Both are still
  version-stamped.

## Phases

Each phase leaves the application working, with the new path behind a key
that defaults to `false`.

### Phase 0 — prerequisites (separate PRs, D6)

- [ ] **P1.** `reindexDocumentVersion` masks PII as ingest does.
- [ ] **P2.** `reindexDocumentVersion` re-adds the summary chunk.

### Phase A — the free prefix, measured

- [ ] **A0.** The shared measurement phase: the `retrieval` frame and
  evidence recall, Phase A of
  [model-chosen sections](2026-09-29-llm-document-selection.md). It lands
  once, for both specs.
- [x] **A1.** Docling prose chunks carry `section_path`, taken from the
  markdown heading stack. Splitter tests cover nested headings, a chunk that
  spans a heading, and a document without headings.

  *Done.* `attachSectionPaths` (`services/text-splitters/section-paths.ts`)
  locates each chunk in the source the way `attachSourcePages` does and files
  it under the heading stack in force where it starts. It runs on Docling
  output and on Markdown files, which is also how a re-indexed version is
  split. A chunk that already has a path (a table chunk) keeps it; one that
  cannot be located gets none. Documents indexed before this get paths when
  re-processed.
- [ ] **A2.** `embeddingTextFor` and the free prefix in the worker, behind
  `contextualChunks`, writing `context_prefix` and `context_version: 1`.
  Tests for the builder, the cap, the truncation order, and the masked-only
  rule in `dual_content` mode.
- [ ] **A3.** Measure four arms on `kolej` and `tabele`, three repetitions
  each:
  - no prefix;
  - title + section, dense only;
  - title + section + summary sentence, dense only;
  - the same, dense + BM25.

  Record evidence recall, the pass rate and the cross-lingual row here, and
  pick D4's arm.

### Phase B — the model's prefix (only if A3 leaves a gap)

- [ ] **B1.** The per-chunk call with its caps, the fallback and
  `AiUsageStep.CHUNK_CONTEXT`, writing `context_version: 2`. Tests on every
  fallback, the per-document cap, the single-chunk skip and the usage step.
- [ ] **B2.** Measure B1 against A3's best arm. The cost per document goes
  next to the numbers, so the default is decided on both.

### Phase C — existing corpora

- [ ] **C1.** The count per `context_version` and the re-index action in the
  knowledge-base settings. The action is guarded by `canManageOrg` and
  scoped by the session's organization.
- [ ] **C2.** `reindex-for-context.ts` with `--dry-run`, and a runbook
  section.

### Phase D — decide

- [ ] **D1.** On A3 and B2, decide whether `contextualChunks` defaults to
  `true`, and at which version. Then flip it (`feat`, plus a changelog line)
  or record why not.

## Testing

- **Unit (rag-core):** `embeddingTextFor` (prefix cap, truncation from the
  chunk's end, empty prefix), and the `context_version` type.
- **Unit (worker):**
  - the heading-stack tracking in the splitter;
  - the free prefix builder;
  - the model prefix: caps, fallbacks, the single-chunk skip, bounded
    concurrency with a fake model;
  - the handler writes the prefix only when the key is on, and never
    changes `pageContent`.
- **Unit (web):** the count query and the re-index action, including a
  second organization's files being untouched.
- **Evals:** Phase A's harness is the acceptance test for D4 and for
  Phase D. Evals do not run in CI, by design.
- **E2E:** none gates this. The key defaults to `false`, and the default
  ingest is unchanged until D1.

## Rollout and rollback

- **Rollout.** The key is off by default and turned on per organization in
  apps/admin; a turned-on organization re-indexes from its settings.
- **Rollback.** Turn the key off, then re-index to drop the prefix. The
  answer path never read the prefix, so a prefixed collection is safe to
  leave in place meanwhile. The only migration (Phase B) adds an enum value.
