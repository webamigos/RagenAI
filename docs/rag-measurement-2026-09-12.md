# RAG measurement — 2026-09-12

The measurement [ADR-20](adrs/20-pause-and-measure-rag-quality.md) asked for on
2026-04-11, run for the first time against the current stack. The pause it
opened outran its one-week time-box by five months; the embedding and reranking
stack was replaced in the meantime, so nothing from April was comparable
anyway.

**Read this as the measurement, not as a decision.** ADR-20 asks for a path
(A/B/C/D) to be chosen once data exists. The data is below; the choice is a
separate call, and the evidence does not point where the April reasoning
assumed it would.

## What was actually measured, against ADR-20's four categories

| ADR-20 category | Status | Why |
|---|---|---|
| **1. Pipeline health via Langfuse** | **not run** | Needs production Langfuse traces. Nothing in a local checkout produces the `structured`/`flat`/`expand-queries` tag volumes the ADR wants a rate from. |
| **2. Qdrant collection health** | **run, on a local collection** | Schema, summary-chunk ratio and point counts verified — see below. Not run per production org, which needs production access. |
| **3. Real-user query spot-checks** | **not run — and it needs a decision first** | See "The spot-check problem" below. |
| **4. User feedback** | **not run — the mechanism still does not exist** | ADR-20 called this the highest-ROI item in April. A feedback-collection task has been at `ready for dev` in ClickUp since. |

What *was* built instead is the thing none of the four categories covered: a
repeatable, per-language retrieval benchmark that runs from a checkout. It does
not substitute for categories 1, 3 or 4.

## The stack these numbers describe

Recorded automatically into every result file, because the April numbers are
worthless precisely for want of this.

| | |
|---|---|
| chat model | `gemini-3-flash-preview` |
| rephrase model | `mistral-small-3.2` — **not** the `gemini-2.5-flash` AGENTS.md documents |
| embeddings | `bge-multilingual-gemma2`, 3584-dim, Scaleway |
| reranking | **on** — `scaleway` / `qwen3-embedding-8b` |
| multi-query variants | 1 (two queries per turn) |
| PII masking | **off** — the product default |
| judge / grader | `gemini-2.5-flash` through the same LiteLLM proxy |

The rephrase-model divergence is worth settling before anyone quotes these
numbers as "the documented stack": the local `.env.local` names
`mistral-small-3.2`, AGENTS.md and the `ragen-rag-change` skill both name
`gemini-2.5-flash`, and AGENTS.md says not to change that model without
explicit approval. One of the two is wrong.

## 1. promptfoo suites — answer quality over a fixed context

All six, run 2026-09-12. These use `fixtures/mock-vector-store.ts`, so they
measure **answer quality given roughly the right paragraph** and say nothing
about retrieval.

| Suite | Result | Note |
|---|---|---|
| `ci-gate` | 5/5 | |
| `rag-quality` | 37/38 assertions | the one failure is a language failure — see below |
| `red-team` | 10/10 | |
| `rephrase-quality` | 3/5 | both failures are rubric pedantry, not rephrase defects |
| `model-comparison` | 16/18 | both failures are the same Polish question |
| `citations` | 1/4 → **4/4 after repairing the suite** | the suite was wrong, not the product |

### `citations` was a false alarm, and the suite is now fixed

Three of four cases asserted that the answer spells the file name out in prose
(`According to 'file.md', …`). The product cites by numeric marker now;
`cited-sources.ts` parses `[n]` first and falls back to names only for answers
carrying no markers. `metadata.citedFiles` — the value that becomes
`DocumentCitation` rows, i.e. the number the Knowledge Analytics screen shows —
was correct in all four cases, in the same results row as the failing
assertion.

The dataset now asserts on `metadata.citedFiles` instead of on the answer text.
Lesson filed:
[`lessons/an-eval-asserting-the-old-prompt-contract-reports-a-regression-that-is-not-there.md`](lessons/an-eval-asserting-the-old-prompt-contract-reports-a-regression-that-is-not-there.md).

### Two of the remaining failures are language failures

- `rag-quality`: a **Spanish** question got a **Polish** answer
  (`¿Puedo subir archivos PDF y Markdown?` → `Tak, jest możliwe przesyłanie…`).
  The chain does not hold the question's language.
- `model-comparison`: `Jakie formaty plików są obsługiwane?` returns "I don't
  have that information" on both `gemini-2.5-flash` and `mistral-small-3.2`,
  while the identical English question passes. This one is a **fixture**
  artifact — the mock store scores English documents by keyword overlap, so a
  Polish query matches nothing — and it is the clearest possible demonstration
  that these suites cannot measure Polish at all.

## 2. `e2e-rag` — the shipped stack end to end

| Scenario | Result |
|---|---|
| `pdf` (ADR-18 section-aware chunking, PII masking on) | **7/7** |
| `xlsx` (ADR-17 row-group chunking) | **5/5** |

Still a smoke test: two documents, twelve questions, no slicing.

## 3. Qdrant collection health — ADR-20 category 2

Checked on the benchmark's collection after ingesting eight documents:

| Check | ADR-20 target | Measured |
|---|---|---|
| dense vector config | present | `dense`, 3584-dim, Cosine — agrees with `VECTOR_SIZE` |
| sparse vector config | present (Phase 1 rollout) | `sparse` present — hybrid is genuinely provisioned |
| summary chunks per file | ratio ≥ 0.8 | **8/8 = 1.0** |
| chunks per document | plausible | 3–5 per Markdown document |

## 4. The multilingual benchmark — the number worth publishing

New harness: [`apps/web/evals/rag-benchmark`](../apps/web/evals/rag-benchmark/README.md).
Eight invented documents in one collection — four Polish (Kolej Nadwiślańska
S.A.), four English (Wolfsbane Interurban Rail), parallel in structure and
different in **every** number — and 24 questions, 8 of them asked in one
language about a document written in the other.

Every figure exists nowhere outside this repository, so a correct answer is
evidence of retrieval rather than recall. Every question is also asked of the
same model with **no documents attached**; that column is the floor.

Run of 2026-09-12, corpus rev2, `results/2026-09-12-kolej-bilingual-v1-rev2.md`:

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| **all questions** | **22/24 (92%)** | **0/23 (0%)** |
| question asked in Polish | 10/12 (83%) | 0/12 |
| question asked in English | 12/12 (100%) | 0/11 |
| answer lives in a Polish document | 12/12 (100%) | 0/12 |
| answer lives in an English document | 10/12 (83%) | 0/11 |
| **question and document same language** | **16/16 (100%)** | 0/15 |
| **cross-lingual** | **6/8 (75%)** | 0/8 |

The control denominators are 23, not 24: one case never returned an answer, so
it was not measured either way — see below.

**This is one run.** An earlier run of the same corpus scored 16/24, and four of
the six differences had no instrument change at all — see
"Read one run as one run" below before quoting 92% anywhere.

By question type, everything monolingual is 2/2 or 6/6 — factual, numeric,
comparative, multi-hop, and both guards. The only non-perfect cell in the whole
table is cross-lingual.

One control-arm case (`en-mono-guard-sycophancy`) is an error rather than a
measured failure: its request to the proxy failed three times. It is reported as
**ungraded** and excluded from the control denominators above, because a cell
reading 0/24 would claim 24 measured refusals when 23 were made. The run's raw
record keeps the case with its transport error
(`results/2026-09-12-kolej-bilingual-v1-rev2.json`), and the rendered report
lists it under "Ungraded cases"; it has not been re-run, so nothing here
substitutes a guess for it.

### The control scoring zero is the point

The floor is 0/23 — every case that returned — because the corpus is invented. The model guesses fluently and
plausibly — 90% instead of 87%, 20 kg instead of 18, "16 PLN" instead of 31 zł —
and is wrong every time. That is the shape of the problem the product solves,
and it is why the gap, not the 92%, is the defensible claim.

An earlier revision of the corpus had three questions whose answers were single
digits (4, 6, 60); the control hit all three by inventing a plausible number and
happening to match. Those were replaced with figures carrying a decimal. **A
benchmark question whose answer is guessable measures nothing**, and it inflates
the result in the flattering direction, which is how it survives review.

### The one real weakness: cross-lingual retrieval anchors to the query's language

Both failures are the same failure, in the same direction, and neither is subtle:

| | asked | answer should come from | what came back |
|---|---|---|---|
| `xl-pl2en-refund-pct` | Polish, naming **Wolfsbane** | English refund policy (62%) | **87%** — the Polish operator's figure, cited `[1]` |
| `xl-pl2en-bike-fare` | Polish, naming **Wolfsbane** | English board minutes (EUR 3.40) | **9,80 zł** — the Polish operator's figure, cited `[2]` |

> `Ile procent ceny biletu zwraca Wolfsbane Interurban Rail przy rezygnacji przed odjazdem?`
> → *W przypadku rezygnacji … przysługuje zwrot **87% ceny biletu** [1].*

The retrieved document is about a different company, named in the question, and
nothing notices. The answer is confident, cited, and wrong — the worst
combination available.

The reverse direction is **4/4**: an English question about a Polish document
gets the Polish figure. So this is not "cross-lingual retrieval is hard", it is
an asymmetry, and the asymmetry points at a mechanism. Hybrid search fuses a
dense multilingual vector with a BM25 sparse vector, and BM25 has no Polish
stemming — a deferred item ADR-20 itself lists under "cross-cutting". A Polish
query's surface terms match the Polish documents strongly enough to dominate
RRF fusion; an English query has no such sparse anchor in the Polish documents,
so the multilingual dense half decides and gets it right.

That is a hypothesis with a cheap test: re-run with sparse retrieval disabled
and see whether the two cases flip. It has not been run. **Do not treat the
mechanism as established — treat the 6/8 as established and the explanation as
the next experiment.**

This matters commercially out of proportion to two test cases. Multilingual
knowledge bases are the positioning; a mixed-language KB is the case where this
fires; and it fires silently, with citations attached.

## 5. Findings that came out of running this

### PII masking analyses every document as Polish

`apps/worker/src/activities/documents/mask-pii.ts:39` hardcodes
`language: 'pl'` on the Presidio `/analyze` call, with no language detection.
The first benchmark run had `FEATURE_FLAG_PII_MASKING=1` set (it is required by
`e2e-rag`'s privacy case), and eight documents containing **no personal data at
all** came out of ingest with **23 masked spans**:

```
source : Flammable materials, gas cylinders over 4 litres, … are excluded from carriage.
stored : <PERSON> materials, gas cylinders over 4 litres, … are excluded <PERSON>.
```

Reproduced straight against the analyzer, which rules out everything else in
the pipeline:

| request | result |
|---|---|
| that sentence, `"language":"en"` | 0 entities |
| that sentence, `"language":"pl"` | `PERSON 0.85 'Flammable'`, `PERSON 0.85 'from carriage'` |

Masking is off by default, so a default install is unaffected. Any organisation
that turns it on and uploads non-Polish documents has its content silently
corrupted *before* embedding — the damage lands in the vector store and needs a
re-index to undo. `detectDocumentLanguage` already exists in the worker and is
already threaded into chunk payloads; it simply runs at
`parse-and-embed.ts:495`, long after `maskPii` at line 347.

Measured cost: `pl-mono-refund-pct` failed on the masked corpus (the answer said
100%) and passes on the clean one. That is one case out of a sample too small
to give a rate, but it is not zero.

### Deleting a file does not delete its vectors on every path

`e2e-rag` removes its fixture with `prisma.userFile.deleteMany`, which leaves
the Qdrant points behind — its README says so. The first benchmark run
therefore ranked against six stale chunks from the earlier `e2e-rag` runs.
`rag-benchmark` deletes through `DELETE /api/v1/files/:id` instead, which is the
product's own path and does remove vectors; the run says so plainly when
`INTERNAL_API_SECRET` is missing and it cannot.

This matters beyond the benchmark: any code path that removes a file record
without going through `deleteFileCommand` leaves retrievable content in the
collection.

## 6. The spot-check problem — ADR-20 category 3

ADR-20 asks for "10–20 recent real user questions from production". That was
written before two decisions this repository has since made, and it collides
with both:

- thread messages are encrypted per organisation ([ADR-06](adrs/06-thread-message-encryption.md), [ADR-42](adrs/42-thread-derived-content-is-encrypted-through-one-function.md)), and
- impersonation was deliberately deferred, on the grounds that admins must not
  read customer messages.

Langfuse traces are a third copy of the same content and are not exempt from
the reasoning behind either. So category 3 is not a task anyone can just pick
up — it needs an explicit decision about what may be looked at and by whom.
Three options, in increasing order of what they cost:

1. **Consented spot-checks.** Ask one or two design-partner organisations for
   permission to read a bounded set of their queries. Highest signal, needs a
   conversation, not code.
2. **Query text without answers.** Log the *question* against a retrieval
   outcome without storing the answer or the chunks, under an org-level
   opt-in. Weaker signal, much smaller exposure.
3. **Aggregate-only.** Ship the feedback mechanism from category 4 and read
   thumbs-down rates per query category. No content leaves the tenant at all.

Option 3 is the one that is already on the backlog and is the only one that
needs no new policy decision. Nothing here should be read as a recommendation
to start reading customer threads.

## 7. What these numbers do not support

The README promises "retrieval that was measured, not assumed", and these
numbers redeem that. They do **not** redeem a competitive claim of the kind
Onyx publishes.

A win rate against ChatGPT, Claude or Notion AI is a *head-to-head*: the same
questions put to those products' own interfaces, with a blind judge comparing
paired answers. Nothing in this repository does that, and publishing a
self-scored pass rate under that heading would be the same category of error
as the `citations` suite — a number measuring one thing presented as a number
about another.

What the control arm does support, and what is defensible to publish:

> On a corpus of documents whose contents exist nowhere in any model's training
> data, the same model answers **N%** of questions correctly with no retrieval
> and **M%** with Ragen's pipeline.

That is a claim about the product's contribution, it is reproducible by anyone
on their own documents with one command, and it does not require a competitor's
cooperation or their terms of service. If a genuine head-to-head is wanted, it
is a separate piece of work with its own legal and methodological questions —
scope it as such rather than relabelling this.

## 8. Reproducing this

```bash
docker compose up -d postgres qdrant redis temporal litellm-postgres litellm \
  presidio-analyzer presidio-anonymizer docling

# apps/web and apps/worker, both against a scratch database and one storage dir
DATABASE_URL=postgresql://postgres:pass123@localhost:55432/ragen_e2e \
STORAGE_PROVIDER=local STORAGE_LOCAL_PATH=/tmp/ragen-eval-storage npm run web:dev
DATABASE_URL=postgresql://postgres:pass123@localhost:55432/ragen_e2e \
STORAGE_PROVIDER=local STORAGE_LOCAL_PATH=/tmp/ragen-eval-storage npm run worker:dev

cd apps/web
npm run eval:ci && npm run eval:rag && npm run eval:redteam \
  && npm run eval:rephrase && npm run eval:citations && npm run eval:models
DATABASE_URL=postgresql://postgres:pass123@localhost:55432/ragen_e2e npm run eval:e2e-rag
DATABASE_URL=postgresql://postgres:pass123@localhost:55432/ragen_e2e npm run eval:benchmark
```

On your own documents:

```bash
npm run eval:benchmark -- --corpus /path/to/your/corpus
```

Port **55432**, not 5432 — a native Postgres on the standard port answers
instead of the container and reports success while writing to the wrong
database. Full prerequisites and the corpus format:
[`apps/web/evals/rag-benchmark/README.md`](../apps/web/evals/rag-benchmark/README.md).

## 9. Read one run as one run

The benchmark was run twice on 2026-09-12 — corpus rev1 (16/24) and rev2
(22/24). Six cases flipped, and **only two of the six had any instrument
change**:

| Case | rev1 | rev2 | Why |
|---|---|---|---|
| `en-mono-refund-pct` | FAIL | PASS | rubric corrected — it forbade mentioning the full-refund clause the document contains |
| `en-mono-compare-deadlines` | FAIL | PASS | rubric corrected — it demanded the word "longer" rather than the two figures |
| `pl-mono-guard-hallucination` | FAIL | PASS | **unchanged — run-to-run variance** |
| `en-mono-guard-hallucination` | FAIL | PASS | **unchanged — run-to-run variance** |
| `xl-en2pl-min-payout` | FAIL | PASS | **unchanged — run-to-run variance** |
| `xl-en2pl-bike-fare` | FAIL | PASS | **unchanged — run-to-run variance** |

Four cases, a sixth of the suite, changed verdict with nothing changed. On the
failing run, "what does it cost to carry a dog" reached for the excess-baggage
fee (61 zł / EUR 44) — a real failure mode that simply does not reproduce every
time.

Two consequences, and the second matters more than the first:

1. **24 questions on one run is a signal, not a baseline.** A number published
   for marketing should be the median of at least three runs and should say so.
   Treat any single-run delta under about three cases as noise. This is the same
   caution the worker load test wrote down
   ([lesson](lessons/worker-concurrency-load-test-2026-09-05.md)).
2. **The cross-lingual failure is the only thing that reproduced.**
   `xl-pl2en-refund-pct` and `xl-pl2en-bike-fare` failed in both runs, with the
   same wrong figure from the same wrong document each time, while everything
   around them moved. Of everything in this write-up, that is the finding with
   the most evidence behind it — and it is the one the roadmap has no item for.
