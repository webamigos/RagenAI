# RAG baseline before the in-process gateway

The measurement Phase B2 compares against: what retrieval delivers today,
through the LiteLLM proxy, before `packages/llm-gateway` serves any traffic.
Taken on **2026-09-14** at commit `e19088f76`.

[The spec](specs/2026-09-14-replace-litellm-with-an-in-process-gateway.md)'s B2
asks for the retrieval evals under both paths per
[ADR-20](adrs/20-pause-and-measure-rag-quality.md), with the comparison recorded
here. This is the first half — the proxy arm. The gateway arm goes in beside it
when B2 lands.

## The number

Median of three runs of `evals/rag-benchmark` over `kolej-bilingual-v1` rev 2,
24 questions, two arms each.

|                                            | runs       | **median**       | spread      |
| ------------------------------------------ | ---------- | ---------------- | ----------- |
| all questions                              | 17, 20, 21 | **20/24 (83%)**  | 4 questions |
| question and document in the same language | 14, 16, 16 | **16/16 (100%)** | 2 questions |
| cross-lingual                              | 3, 4, 5    | **4/8 (50%)**    | 2 questions |
| control — same model, no documents         | 0, 0, 0    | **0/23 (0%)**    | 0           |

Raw reports: `apps/web/evals/rag-benchmark/results/2026-09-14-kolej-bilingual-v1-rev2*.md`.

### Stack under test

|                      |                                        |
| -------------------- | -------------------------------------- |
| chat model           | `gemini-3-flash-preview`               |
| judge model          | `gemini-2.5-flash`                     |
| rephrase model       | `mistral-small-3.2`                    |
| embeddings           | `bge-multilingual-gemma2` (3584-dim)   |
| reranking            | on — `scaleway` / `qwen3-embedding-8b` |
| multi-query variants | 1 (default)                            |

## Read the spread before the median

**Three identical runs scored 71%, 83% and 88%.** Four questions separate the
best from the worst, which is seventeen points on a 24-question corpus.

That is the most important line in this document, and it is a statement about
the instrument rather than about retrieval. A gateway arm scoring 79% against
this 83% would be **indistinguishable from the same path measured twice**. So a
median of three is enough to characterise the pipeline and _not_ enough to
compare two routing paths.

When B2 measures the gateway, compare **per question**, not per total: run both
paths over the same 24 questions and look at which individual cases differ and
why. A summary rate hides a swap of four questions in either direction, and four
is the noise floor.

## The control column is what makes the rest mean anything

Every figure in the corpus was invented for it. The control arm — same model,
same question, no documents — scored **0/23 in all three runs, with one case
ungraded**. Nothing here can be answered from the model's own knowledge, so
every pass is evidence that retrieval worked rather than that the model
remembered.

The ungraded case is the denominator being honest rather than a rounding
convenience: `en-mono-guard-sycophancy` exhausts its retries on a timeout, and
the harness declines to score it — counting a case that never got an answer as
a failure would flatter the control arm's floor. It is the **same case in all
three runs**, which makes it a reproducible timeout rather than flakiness and
worth a look on its own. Not length — it is seventh of twenty-four by prompt
size — so something else about that case is slow.

## Where the loss is

Same-language retrieval is effectively solved on this corpus: 100% median, with
two of three runs perfect. Every point of the shortfall is **cross-lingual** —
a question in Polish about a fact recorded in an English document, or the
reverse — at 50%, and no run exceeded 5/8.

That is a stable, reproducible weakness rather than run-to-run noise, and it is
the one worth work. It is also **unrelated to Phase B**: routing a model call
through a different provider does not change how a Polish query embeds against
an English chunk. Expect it to be just as bad after the cutover, and do not read
it as a regression when it is.

## A fixture nearly cost us the number

The first run scored 18/24 and it was wrong, in a way worth recording because
nothing about it looked like contamination.

The benchmark shares `ragen_e2e` with the Playwright suite.
`p0-22-projects.spec.ts` exercises the project-instructions dialog by saving
"You are a helpful test assistant. Always respond in Polish." — and never
restores it. Every English question was then answered in Polish, correctly, by
a system following an instruction it had been given.

Six of the eight English cases still passed, because an assertion on a number
survives a change of language: "18 kg" and "87%" read the same either way. The
two asserting an English phrase failed, and their rubric passed on content —
which reads exactly like a grading bug and is not one. The assertion was right,
the rubric was right, and they were measuring different things.

Two wrong diagnoses came before the right one, both disproved by experiment
rather than argument: that the Polish citation example in the answer prompt was
steering the model (it was not — five of five English answers with either
example), and that the rephrase step was translating the question (it was not —
both candidate models kept English).

`run.ts` now pins the project instruction rather than inheriting it, so the run
states its assumptions instead of trusting the database's mood. The 18/24 report
is kept under a `-CONTAMINATED-` name as the evidence for this section.

**For B2 this is the operational warning:** these two paths get compared on
these figures, and anything that writes to the eval project between two runs
moves them for a reason that has nothing to do with routing. Run both arms in
one sitting, and check the "cleared a leftover project instruction" line in the
output.

## What this does not measure

- **Answer quality on a fixed context.** That is the promptfoo suites next door,
  which use a mock vector store — see [`apps/web/evals/README.md`](../apps/web/evals/README.md).
- **Anything about the gateway.** The corpus exercises retrieval; a difference
  after the cutover could come from the model, the provider's own defaults, or
  the noise floor above, and attributing it to routing needs the per-question
  comparison rather than these totals.
- **Latency or cost.** Neither is recorded here, and both change when the proxy
  leaves the path. Worth measuring separately before B4 flips the default.
