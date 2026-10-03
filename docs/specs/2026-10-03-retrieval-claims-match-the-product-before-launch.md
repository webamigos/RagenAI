---
title: What Ragen says about retrieval matches what it does, before public launch
status: draft
areas: [rag, worker, knowledge-base, admin, settings]
adrs: [12, 15, 16, 19, 20, 50]
---

# What Ragen says about retrieval matches what it does, before public launch

## TLDR

Before Ragen is promoted publicly, every retrieval claim the product makes,
in its settings pages, its docs and its marketing, must be true of the
default install. Where a claim is false, it gets a number behind it or it is
dropped. The other half is behaviour: what an assistant says when the
documents do not hold the answer. The non-obvious part is that **no new
retrieval technique is needed for launch.** A review of a public catalogue of
39 RAG techniques found that the ones worth having are already on `main`. What
is missing is three settings that misreport the pipeline, a model that may
answer from general knowledge, and no published number.

## Open Questions

<!--
Each question carries a recommendation, and the phases below are written
assuming it. If an answer differs, only the phase named in the question
changes, because the phases deploy independently (see "Why one spec" and
"Phases" for the two places a later phase reads an earlier one's result).
-->

- **Q1 (Phase A).** The per-org `docSummariesEnabled` setting does nothing.
  Should the worker read it (**recommended**), or should it be deleted?
- **Q2 (Phase B).** If B1 shows the table gain comes from the **wider pool**,
  does the default install retrieve the wider pool with no reranker
  (**recommended**: no extra call, no provider)? If it comes from the
  **reranker's order**, does Scaleway become the default for the demo and for
  `create-ragen-app`? Cohere is measured only if someone provides an endpoint
  (`RERANK_COHERE_BASE_URL`); none exists on the measuring machine today.
- **Q3 (Phase C).** Who gets "answer only from the documents"?
  - **(a)** A per-assistant setting. It defaults to strict for a project with
    the chatbot enabled, and stays as today everywhere else.
    **Recommended.**
  - **(b)** Strict everywhere.
  - **(c)** A per-org setting.
- **Q4 (Phase D).** May the benchmark numbers be published on the website and
  in ragen-docs, together with their control arm and their method
  (**recommended**)? Or are they internal only?

## Problem

The review compared `main` at `0ab7dc40d` with the technique catalogue at
github.com/NirDiamant/RAG_Techniques. Hybrid fusion (ADR-14), query rewriting
and multi-query (ADR-15), document summaries (ADR-16), contextual chunk
headers (`contextualChunks`), neighbour-chunk expansion (`contextExpansion`),
type-specific chunking (ADR-17/18/43) and element-level citations are all
present. The rest is deferred in ADR-15, ADR-16 and ADR-20 for reasons that
still hold. See "Out of scope".

These are what someone evaluating Ragen after a launch post would actually
hit.

### 1. Three settings report a pipeline that is not running

`/organization/rag-settings` (`RagSettingsView.tsx`) shows read-only
switches, and apps/admin edits the same columns.

- **Document summaries.** The worker never reads `docSummariesEnabled`.
  `apps/worker/src/activities/documents/generate-document-summary.ts` reads
  only `FEATURE_FLAG_DOC_SUMMARIES`. An admin who switches summaries off for
  one organization changes nothing.
- **Reranking shows "on" when nothing reranks.** The switch shows
  `rerankingEnabled`, which defaults to `true`. Reranking only runs when
  `FEATURE_FLAG_RERANKING=1` is set *and* credentials are present
  (`isRerankingEnabled()`, `apps/web/src/libs/reranker/`). That env flag is
  off by default, so a default install shows reranking as enabled while not
  running it.
- **Reranking is described as something it is not.** The description reads
  "Re-score retrieved documents using a cross-encoder model". The default
  provider is Scaleway `qwen3-embedding-8b`, and
  `scaleway-reranker.ts:25` says in its own words that it is "a bi-encoder
  … not a true cross-encoder".

### 2. Reranking helps on one corpus, and we do not know why

The 2026-09-04 comparison was a three-way tie between off, Scaleway and
Cohere. The selection spec's A3 measured again on 2026-10-01, three runs per
arm on both corpora
(`apps/web/evals/rag-benchmark/results/2026-10-01-a3-reranker-baseline.md`):

| corpus | off, median | Scaleway, median | evidence recall, off vs Scaleway |
|---|---|---|---|
| `kolej` | 17/24 | 18/24 | identical in every pairing |
| `tabele` | 7/18 | 10/17 | 8 vs 14 of 18 |

On prose it changes nothing measurable. On tables it helps by more than
noise — but the "reranker" arm changes two things at once: with reranking on,
the chain retrieves three times as many candidates and cuts them back. The
`tabele` gain belongs to the wider pool *and* the reranker's order, and the
run cannot split them. Cohere was not run (no endpoint on that machine), and
both arms predate contextual chunks and context expansion becoming the
default. So "reranking improves answers" is not a claim we can make, and the
cheaper fix — a wider pool with no reranker call — may be the real one.

### 3. The model is told it may answer from its own knowledge

The answer prompt (`apps/web/src/libs/chains/basic-rag/config.ts`, copied in
`apps/api/src/chains/basic-rag/config.ts`) contains this rule:

> If the answer is not directly in the provided context but you believe you
> know the answer, explain this to the user. Clearly indicate that the answer
> is based on your own knowledge, not the provided context.

That is reasonable for a member asking in the panel. It is wrong for a
customer's public chatbot. There, a visitor asking about something the
documents do not cover gets a general-knowledge answer that sounds like the
company's answer. A disclaimer in the middle of a reply does not change what
the visitor takes away. This is the most likely embarrassing screenshot after
launch.

The benchmark barely measures it. `guard-hallucination` covers two questions
in `kolej` and one in `tabele`. There is no **near-miss** case at all: the
topic is in the documents, but the specific fact is not. That is the case
where a model fills the gap most confidently.

### 4. No number to quote

`rag-benchmark` is the right instrument. It uses invented figures, has a
control arm, breaks results down by language and reads evidence back from
Qdrant. Its results live in `apps/web/evals/rag-benchmark/results/`, split
across 190 files from different flag combinations. None of them is a
"this is the default install" figure someone could cite. Evals do not run in
CI, by design (the 2026-09-29 specs, and
`docs/lessons/a-secret-guarded-ci-step-fails-open.md`). That is fine, but
nothing makes a release run them either.

### 5. The pipeline doc is a month old

- `docs/rag-pipeline.md` does not mention contextual chunks, context
  expansion or section selection. All three have shipped, and two of them are
  on by default.
- The benchmark README's prerequisites still list `temporal` and `litellm`
  containers. ADR-44 replaced Temporal with BullMQ as the default runtime,
  and B6 removed LiteLLM.

Launch copy written from these files would describe the product as it was
in early September.

## Out of scope

Each item below would be a reasonable thing to expect here, and is not
included:

- **New retrieval techniques.** HyDE, HyPE, query decomposition, proposition
  or semantic chunking, RAPTOR, GraphRAG/LightRAG, Dartboard, ColPali,
  Self-RAG and agentic multi-step search are all out. The reasons are in
  ADR-15, ADR-16 and ADR-20, in the contextual-chunks spec (the free prefix
  already scored 24/24 on `kolej`) and in the README's "Not planned". Nothing
  in this review contradicts them.
- **A retrieval score threshold.** See "Proposed solution", Phase C. The
  scores we have cannot support one.
- **A web-search fallback (CRAG's second half).** Some installs deliberately
  have no outbound path, and the README lists web search as a later opt-in
  tool.
- **Captioning images inside PDFs and DOCX**
  (`docling-client.ts` `imageExportMode = 'placeholder'`), **flipping
  `FEATURE_FLAG_TABLE_CHUNKS`**, and **feeding message ratings back into
  retrieval**. All three are worth doing after launch, and each gets its own
  spec.
- **Rewriting ragen-docs.** That is a separate repository. Phase E corrects
  this repository's docs, which ragen-docs is regenerated from. The
  ragen-docs follow-up is listed, not done here.
- **Unifying the duplicated answer prompts** in apps/web and apps/api.
  Phase C edits both copies and adds a test that they agree. Collapsing them
  into `rag-core` is a separate change.

## Why one spec

These are five independently deployable changes. Each phase is useful
without the others, and each ships as its own PR (ADR-50). They share one
spec because they share one deadline and one test: *is every claim true of
the default install?* Splitting them into five specs would scatter that
test. If a phase grows past one or two PRs (Phase C is the candidate), it
moves into its own spec and this one links to it.

## Proposed solution

### Phase A — settings report the pipeline that runs

- **Summaries (Q1: wire it).**
  - The worker reads `OrganizationSettings.docSummariesEnabled` at job time,
    as `applyContextPrefix` reads `contextualChunks`.
  - A summary is generated when **both** the env flag and the org setting
    allow it. The env flag stays as the installation-wide off switch.
  - If the setting cannot be read, the worker generates the summary and logs
    a warning. That is today's behaviour, and a summary costs one call.
  - The contextual prefix already handles a document with no summary (its
    third component is optional). A test pins that.
  - Rejected alternative: deleting the column. The admin UI, the defaults
    propagation and the API already carry it, so deleting it is more work
    than wiring it, and loses a per-org cost lever.
- **Reranking shows its effective state.**
  - The panel row shows reranking on only when the org setting **and**
    `isRerankingEnabled()` are both true.
  - When the org setting is on but the installation has no reranker, the row
    carries a note saying so, the same pattern as the existing
    `content-moderation-saas-note`.
  - The other three rows get the same check: each switch must show what
    actually happens at query time.
- **The reranking description stops naming a model class.**
  - The new text is "Re-score retrieved passages with a reranking model
    before they reach the answer model", in all 17 locale files, regenerated
    from `en.json` and a key list (see the locale-conflict lesson).
  - Rejected alternative: making the text depend on the provider. A settings
    description is not where the provider is documented, and the text would
    be wrong again the next time the default changes.

### Phase B — reranking gets a number, then a decision

- **B0. A knob that widens the pool without reranking.** The candidate pool
  is `maxDocuments × RERANK_RETRIEVAL_MULTIPLIER` only when reranking runs.
  Add a server setting (env, default unchanged) that retrieves the same wider
  pool and cuts it by fused rank, so the two effects can be told apart.
- **B1.** Run `kolej-bilingual-v1` and `tabele-bilingual-v1` on today's
  default install (contextual chunks and context expansion on), three runs
  each, reporting the median, in three arms: off, **off with the wide pool**,
  and Scaleway. Cohere v3.5 is a fourth arm only if an endpoint is provided.
- **Decision (Q2):**
  - **The wide pool alone recovers the table gain:** it becomes the default
    (one setting, no extra call), reranking stays opt-in, and launch copy
    does not claim reranking.
  - **Only Scaleway's order recovers it:** Scaleway becomes the demo default
    and the `create-ragen-app` default whenever its credentials are offered;
    ADR-12 is updated with the numbers.
  - **Neither beats off beyond the spread:** nothing changes, and launch copy
    does not mention reranking.
  - In every outcome the Scaleway provider is documented as a similarity
    re-sort, not a cross-encoder (A3 already fixes the settings text).

### Phase C — an assistant can be told to answer only from its documents

Three parts, in order. The measurement comes first, so the change is judged
against a baseline (ADR-20).

1. **A guard corpus.**
   - Add `guard-bilingual-v1`, or extend `kolej` to rev3, with about 24 guard
     questions. Two thirds are out-of-corpus (the topic is absent) and one
     third are near-miss (the topic is present, the fact is not). They are
     split evenly between Polish and English, plus a handful of false
     premises.
   - Grading:
     - the answer must state the absence;
     - it must contain no figure that is not in the corpus;
     - and, per the existing citation rule, it must carry **no citation**.
   - The judge rubric separates "said it does not know" from "said it does
     not know, then answered anyway".
2. **A strict-grounding rule (Q3: per assistant).**
   - New column: `ProjectSettings.answerFromDocumentsOnly`
     (`Boolean?`, `null` means "the default for this project's surface").
   - When strict, the own-knowledge rule in the answer prompt is replaced
     with: "If the context does not contain the answer, say that the
     documents do not cover it, and do not answer from general knowledge."
   - The **effective** default is strict when `chatbotEnabled` is true, and
     today's rule otherwise.
   - Both prompt copies (web and api) change, and an architecture test
     asserts that their rule lists match.
   - The assistant settings page gets one switch.
3. **A relevance grader, only if (2) is not enough.**
   - If strict grounding leaves more than an agreed share of guard cases
     failing, add a CRAG-style check: one cheap model call that grades
     whether the retrieved context bears on the question. When the grade is
     "not relevant", the context is not sent at all, so the answer model
     sees no documents, rather than documents it might misuse.
   - This runs on the rephrase model (the "Model Defaults" rule: no upgrade
     without approval). It is behind a feature key defaulting to `false`.
   - It would add a call to every turn, which is why it is conditional.

**Why there is no score threshold.**

- Retrieval fuses dense and BM25 with RRF inside Qdrant
  (`query: { fusion: 'rrf' }`). An RRF score encodes rank only, so a fused
  score of 0.03 means the same thing whether the passage is perfect or
  unrelated.
- A dense-only cosine threshold would need tuning per embedding model and
  per language, and the cross-lingual case scores systematically lower.
- Reranker scores are closer to calibrated, but reranking is off by default
  (Phase B).
- A threshold on any of these would be a number that looks like a guard and
  is not one.

**Why prompt-level strictness comes first.** It costs nothing per turn. It is
reversible per assistant. And the guard corpus will say whether it is
enough, which is the only evidence that would justify a per-turn call.

### Phase D — a number we can quote, produced by every release

- **A "default install" profile.**
  - `npm run eval:benchmark -- --profile default` refuses to run unless the
    flags match the platform defaults, so a result cannot be mislabelled.
  - It writes to `results/published/<date>-<corpus>.md`, one file per corpus
    per release, recording the RAG column, the control column and the gap.
- **A release-gate step.**
  - `docs/regression-checklist.md` gets a P0 item: run the default profile
    on all three corpora, and fail the release if the gap shrinks by more
    than the spread recorded in the previous published file.
  - It stays manual and local. The decision that evals do not run in CI is
    not reopened.
- **A methodology note (Q4).**
  - It covers invented figures, the control arm, the median of three, the
    two-gate grading, and what the number does *not* measure.
  - It names no other product: we describe the technique, not a comparison.
  - It is written here, in `apps/web/evals/rag-benchmark/README.md`, so
    ragen-docs can link to it or copy it.

### Phase E — docs describe `main`

Phase E documents what is on `main` when it ships, so it can go early.
What B and C will change is documented by B's and C's own PRs, not here:
a doc line for a result that does not exist yet would be the same kind of
false claim this spec removes.

- Update `docs/rag-pipeline.md`:
  - add contextual chunks, context expansion and section selection, each with
    its feature key and default;
  - make the reranking row state that it is opt-in.
- Fix the benchmark README's prerequisites (no Temporal or LiteLLM
  containers).
- Follow-up, not done here: open an issue in ragen-docs listing the pages to
  regenerate.

Each user-visible phase (A, C, and B2 when it changes a default) adds its
own line to `docs/changelog-notes.md` in its PR, as `AGENTS.md`'s post-task workflow
asks; B2 adds what it found to the reranking row, and C2 adds the
strict-grounding rule to `docs/rag-pipeline.md`.

## Core surfaces touched

| Surface | Change | What catches a mistake |
|---|---|---|
| `prisma/schema.prisma` | Phase C only: one nullable column on `ProjectSettings` | migration + `npm run verify` |
| `packages/platform-contracts` | Phase C3 only: one feature key, default `false` | `shared-contracts-are-not-recopied` |
| `packages/create-ragen-app` | Phase B only, if Q2 is yes: the reranking default | its own tests + the manifest test |
| apps/worker ingest | Phase A: one setting read before summary generation | worker tests |
| answer prompts (web + api) | Phase C: one rule, both copies | new architecture test that the two rule lists agree |
| auth / tenant scoping | none: settings are read by `organizationId` and project id already resolved from the session | existing guards |

## Data model

- **Phase A.** No schema change. Rows written before it are unaffected:
  existing summary chunks stay in Qdrant whatever the setting says, and the
  setting governs new ingests and re-indexes only. The settings page says so.
- **Phase C.** `ProjectSettings.answerFromDocumentsOnly Boolean?`, with no
  backfill. `null` resolves to the surface default at read time. As a result,
  every existing chatbot-enabled project becomes strict on deploy, and every
  other project keeps today's behaviour. That flip is intended (Q3), and it
  is called out in the PR and in the changelog.

## Failure modes

- **Phase A: settings row missing or unreadable in the worker.** The summary
  is generated, a warning is logged, and ingest continues. The warning is
  never an ingest failure.
- **Phase A: an org turns summaries off.** New documents get the contextual
  prefix without the summary sentence. Retrieval for those documents
  degrades in the way ADR-16 measured, and the setting description says
  this.
- **Phase B: the Cohere/Bedrock call fails at query time.** The existing
  fallback to the fused order applies (ADR-12). No change.
- **Phase C: strict mode on a vague question.** The model may refuse a
  question the documents do answer, phrased differently. The guard corpus
  measures refusals of answerable questions as well (the 22 `kolej`
  questions that are not `guard-hallucination` must not regress). That is the
  over-refusal arm.
- **Phase C: a prompt-injected document instructs the model to answer
  freely.** The existing SECURITY rule already treats chunk content as data,
  and strictness lives in the system prompt, which a chunk cannot override.
  `red-team` gets one case for it.
- **Phase C3: the grader call fails or times out.** The context is sent as
  if the grade were "relevant". That is fail-open on quality, never on
  access, and it is logged. Dropping context on a grader outage would turn an
  outage into wrong refusals.
- **Phase D: the default profile is run with a flag overridden in
  `.env.local`.** The profile check refuses to run, naming the flag.

## Phases

Each phase leaves the application working and ships as its own PR. The
phases are independently deployable, but not independently completable:
B2 and C2 each document their own result (Phase E documents only what is
already on `main`), and D3 needs a release that ships A–C. The suggested order is A, E,
B, C, D: A and E are
cheapest and remove false claims, B needs a few hours of runs, C is the real
work, and D packages the result.

### Phase A — settings report the pipeline that runs

- [ ] **A1.** The worker reads `docSummariesEnabled` (env AND org), fails
  open, with a unit test per branch, plus a test that the context prefix
  tolerates a missing summary.
- [ ] **A2.** The reranking row shows its effective state with a note when
  the installation has no reranker. All four rows are audited, and a
  component test covers each combination.
- [ ] **A3.** The reranking description is rewritten in 17 locales.

### Phase B — reranking gets a number, then a decision

- [ ] **B0.** The wide-pool setting, default unchanged, with a unit test that
  it widens the pool and cuts by fused rank without calling a reranker.
- [ ] **B1.** Three arms (off, off + wide pool, Scaleway; Cohere if an
  endpoint exists) × two corpora × three runs, on today's default install.
  Results are committed, and ADR-12 gets an update with the medians.
- [ ] **B2.** The decision from Q2 is applied: the demo env, the
  `create-ragen-app` default, and the Scaleway label, each only as the
  numbers allow. The reranking row of `docs/rag-pipeline.md` records what
  B1 found.

### Phase C — an assistant can be told to answer only from its documents

- [ ] **C1.** The guard corpus with its loader and rubric. A baseline is run
  on today's prompt and committed.
- [ ] **C2.** `answerFromDocumentsOnly`: migration, read path (web + api +
  guest chatbot), the prompt rule in both copies, the architecture test
  that the copies agree, the settings switch, and a `p0-*` e2e test that a
  chatbot-enabled assistant refuses an out-of-corpus question. The rule goes
  into `docs/rag-pipeline.md`, and a line into `docs/changelog-notes.md`.
- [ ] **C3.** Measure C2 against C1's baseline, including the over-refusal
  arm. Build the grader (behind a key, default off) only if the agreed
  threshold is missed; otherwise mark this step "not needed", with the
  numbers.

### Phase D — a number we can quote

- [ ] **D1.** `--profile default` with its flag check, and the
  `results/published/` layout.
- [ ] **D2.** The regression-checklist P0 item and the methodology section.
- [ ] **D3.** The first published run on the release that ships A–C.

### Phase E — docs describe `main`

- [ ] **E1.** `docs/rag-pipeline.md` (the three shipped stages, reranking as
  opt-in) and the benchmark README prerequisites.
- [ ] **E2.** The ragen-docs follow-up issue.

## Testing

- **Unit.**
  - Worker summary gating: env × org × read failure.
  - The context prefix with no summary.
  - The effective-state resolver for each settings row.
  - Resolving `answerFromDocumentsOnly` for null, true and false, crossed
    with chatbot on and off.
  - The prompt builder picks the right rule.
- **Architecture.** The web and api answer-prompt rule lists agree.
- **Component.** `RagSettingsView` renders each effective-state combination,
  including the note.
- **E2E.** A `p0-*` test for strict grounding on a chatbot-enabled
  assistant. It must gate the merge, so it is not `p1`–`p3`. It asserts on
  the refusal and on the absence of a citation marker, not on wording.
- **Evals.** Guard corpus baseline and after (C1/C3). Reranking arms (B1).
  The default profile (D). All local, per the existing decision.

## Rollout and rollback

- **A.** No flag and no migration, so reverting the PR undoes it. A1 can
  only *stop* summaries for an org that already has them switched off, which
  is what that org asked for.
- **B.** Env and installer defaults only. To roll back, unset
  `FEATURE_FLAG_RERANKING` on the demo, and revert the installer default.
- **C.**
  - The migration adds a nullable column, so it is safe to leave in place
    when the code is reverted.
  - If strict mode misbehaves, an admin sets the column to `false` per
    assistant, and reverting the read path restores today's prompt
    everywhere.
  - C3's grader is behind a feature key defaulting to `false`.
- **D, E.** Docs and a script flag. Revert.
