---
title: The model chooses which retrieved sections to read, and how much around each
status: draft
areas: [rag]
adrs: [12, 14, 15, 19, 20]
---

# The model chooses which retrieved sections to read, and how much around each

## TLDR

After hybrid search and fusion, a model reads the candidate sections side by
side and keeps the ones that answer the question. For each kept section, a
second, small call decides whether to add its neighbouring chunks — a known
alternative to cross-encoder reranking. The non-obvious part is
that none of it can be judged today: `rag-benchmark` grades answers, not
retrieval, and has never run with reranking off, so **the first phase is a
measurement, and the reranker is only replaced if the measurement says so.**

## Open Questions

<!--
Delete this block once every question is answered. While it is here, the spec
is not ready to implement and no code should be written from it.
-->

- **Q1. One spec or two?** Selection (which sections to keep) and expansion
  (how much context around each) work independently. Expansion alone can even
  run without a model: fetch ±N neighbouring chunks through the
  `previous_chunk_id`/`next_chunk_id` pointers that are already stored. Split
  into two specs, or keep one spec with separate phases? *Recommendation: one
  spec, with expansion as its own phase that ships without selection.*
- **Q2. Replace the reranker, or add a third option?** Is the target
  "`FEATURE_FLAG_RERANKING` is deleted", or "a per-org choice between off /
  reranker / model selection", with the default picked from the measurement?
  *Recommendation: a third option first; delete the reranker only if Phase A
  shows it adds nothing over selection.*
- **Q3. Which model?** The chat model with reasoning off is one option. A
  cheap model set by an env var (as `REPHRASE_MODEL` is) keeps the cost
  predictable, but it is a model call on every question, which AGENTS.md
  treats as a cost decision. Chat model, or a dedicated `SELECTION_MODEL`
  defaulting to the rephrase model? *Recommendation: dedicated, defaulting to
  the rephrase model.*
- **Q4. Where does it live?** The retrieval chain exists twice, in
  `apps/web/src/libs/chains/basic-rag/` and `apps/api/src/chains/basic-rag/`.
  AGENTS.md calls that duplication the repo's most-repeated bug source. Build
  selection and expansion once in `packages/rag-core` and call them from both
  chains, or write them twice? *Recommendation: once, in `rag-core`, with an
  architecture test that both chains call it.*
- **Q5. Latency budget.** Selection adds one serial call to every turn;
  expansion adds up to N parallel calls. Is there a ceiling that decides the
  outcome, such as "no more than +1.5 s at p50"? Or does the measurement set
  one?
- **Q6. Is the measurement prerequisite its own PR, shared with the contextual
  RAG spec?** Both specs need retrieval-level numbers that `rag-benchmark`
  cannot produce today (see Problem). *Recommendation: yes, one shared PR
  first, then each spec's arms.*

## Problem

- **The reranker has never been shown to help.** On 2026-09-04, off, Scaleway
  and Cohere all scored 11/12 (`docs/rag-roadmap-status.md`: "neither eval
  suite can currently tell them apart"). Every `rag-benchmark` result since was
  run with reranking on; there is no off run to compare against.
- **The default reranker is not a cross-encoder.** Scaleway's `/v1/rerank`
  runs `qwen3-embedding-8b`, which the code itself calls a bi-encoder
  (`apps/web/src/libs/reranker/scaleway-reranker.ts`). ADR-12's case for
  reranking was cross-encoder quality.
- **The reranker sends only the standalone question and bare chunk text** — no
  title, no section, and the second query variant is ignored
  (`apps/web/src/libs/chains/basic-rag/operations.ts`).
- **ADR-19 renders sections but never widens them.** A chunk reaches the model
  exactly as retrieved; the neighbour pointers written at ingest
  (`apps/worker/src/activities/embeddings/prepare-metadata.ts`) have no reader.
  An answer that spans a chunk boundary has half its evidence missing.
- **`rag-benchmark` cannot measure any of this.** It grades the answer
  (assertions + a judge). It does not record which chunks reached the model,
  and its report stamps the stack from the *runner's* environment, not the
  server's, so a run can be mislabelled (`apps/web/evals/rag-benchmark/run.ts`).

## Design notes

How the pattern is usually built — a starting point for the design, to be
checked against our own numbers:

- **Selection.** Fused candidates are trimmed to a token budget, wider than
  what finally reaches the answer model, because fusion ranks without reading
  the content and relevant sections land just below the cut. The model sees
  each section's title, metadata and a few chunks, and returns only the IDs
  to keep, up to a fixed maximum. The prompt leans towards keeping a section
  when in doubt.
- **Expansion.** One parallel call per kept section, with its neighbours
  visible. The model returns one digit:
  - drop the section, for "same topic, wrong subject";
  - keep the main chunk only;
  - add the adjacent chunks;
  - add a wider window.
- **Cheap failures.** Every step falls back: selection to fusion order,
  expansion to the unexpanded section. Each call has a timeout, and
  reasoning is off.

## Out of scope

- Changing hybrid search, fusion or multi-query (ADR-14, ADR-15).
- Contextual chunk text at ingest — the sibling spec
  `2026-09-29-contextual-chunks.md`.
- Agentic, multi-step search (ClickUp "Agentowe wyszukiwanie").

## Proposed solution

*To be written after the open questions are answered.* The expected shape is:

- **Phase A: measure.** Retrieval-level metrics in `rag-benchmark`, plus runs
  with reranking off, Scaleway and Cohere.
- **Phase B: expansion.** First deterministic, then decided by the model.
- **Phase C: selection**, as a per-org option.
- **Phase D: decide the default** from the numbers, and whether the reranker
  stays.
