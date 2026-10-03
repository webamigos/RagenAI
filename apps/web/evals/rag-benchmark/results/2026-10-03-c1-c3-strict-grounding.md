# C1 and C3 — today's grounding rule against "answer only from the documents"

Phases C1 (baseline) and C3 (measurement) of
[the retrieval-claims spec](../../../../../docs/specs/2026-10-03-retrieval-claims-match-the-product-before-launch.md),
run on 2026-10-03 against `97eb510d5`. That commit is a local merge of
`origin/main` with `test/guard-corpus` (#1519: the `guard-bilingual-v1`
corpus, the no-citation gate and the judge labels) and
`feat/answer-from-documents-only` (#1520: `ProjectSettings.answerFromDocumentsOnly`
and the strict prompt rule). The question is whether the strict rule cuts
general-knowledge answers and citations on questions the documents do not
answer, and what it costs on questions they do answer.

**Corpus revision.** These runs used `guard-bilingual-v1` **v1**. In v1, eleven
Polish rubrics have broken label clauses: the positive `refused-then-answered`
/ `answered` clauses are negated. The pass/fail sentence of every rubric is
correct, so pass rates stand. The **Polish label counts are suspect**. The
verdict below rests on the pass rate, the forbidden-figure assertions and the
citation gate, not on the labels. v2 (#1519, `da9a36e3c`) fixes the clauses.

## What was run

- **Arms**, on the project and thread the runs used:
  - `baseline` (today's rule, C1): `answer_from_documents_only = false`;
  - `strict` (C3): `answer_from_documents_only = true`.

  In both arms `chatbot_enabled = false`, so the explicit column decides the
  rule, not the chatbot default.
- **How the arms were set:** SQL on `project_settings` and `projects`. The
  setting is read on every turn (`getAnswerFromDocumentsOnlyQuery`), so no
  restart was needed. The two columns were read back and logged before every
  run. All 13 runs show the value their arm expects.
- **Confirming the rule reached the prompt.** No trace field carries the rule.
  It was confirmed by sending a general-knowledge question ("What is the
  capital of France?", and the same in Polish) to a separate probe thread in
  the same project:
  - Under `false`, the answer was "Paris … based on my own knowledge, as it is
    not mentioned in the provided documents".
  - Under `true`, both languages answered "the provided documents do not
    contain information" and named no city.
  - The probe was repeated after the last strict run, with the same result.
  - In the runs themselves, the strict arm had no forbidden general-knowledge
    figure on any out-of-corpus question (below).
- **Corpora:**
  - `guard-bilingual-v1` v1: 28 questions. 24 must carry no citation: 22
    `guard-hallucination` and 2 false premises about something absent.
  - `kolej-bilingual-v1` rev 2: 24 questions, the over-refusal arm. 22 have an
    answer in the documents (`expectedFiles`), including the 2 premise
    corrections.
- **Repetitions:** three per arm and corpus, `--arms rag`, plus one `--arms
  no-rag` control on guard. That makes 13 runs.
- **File names:**
  - guard: the baseline runs are `…-c1-baseline`, `-run2` and `-run3`, and
    the control is `…-c1-baseline-run4`. It took the next suffix because the
    suffix counts by shape, not by arm. The strict runs are `…-c3-strict`,
    `-run2` and `-run3`.
  - kolej: the same names, without a control.
- **Stack:** chat `gemini-3-flash-preview`, judge `gemini-2.5-flash`, rephrase
  `mistral-small-3.2`, embeddings `bge-multilingual-gemma2`, one multi-query
  variant. Reranking was off (`FEATURE_FLAG_RERANKING=0` and the
  organization's `reranking_enabled` false). `contextualChunks` and
  `contextExpansion` were on (code defaults), and `sectionSelection` was off.
  `crossQueryFusion` does not exist on this commit, so the first query's hits
  win, which is the same as "off". The server reported `fusion + neighbours`
  on every case.
- **Docling** was down, so the Markdown went through the legacy loader. Every
  arm ingested the same way. The RAG readiness score shows "failed" for every
  file. It is not read here.
- **Setup:**
  - a private database (`ragen_e2e_c3`, migrated with this branch's
    migration), Redis db 8 and local storage;
  - apps/web as a production build on port 3410, and apps/worker (BullMQ)
    from the same worktree;
  - the seeded project and thread cloned under new ids, as in B1.

## Results — `guard-bilingual-v1` v1

On must-not-cite questions:

- **forbidden figure** means the answer contained an `expectNone` figure (a
  neighbouring tariff, a computed price, a sibling operator's number).
- **cited** means the `citations` event named a file on a case of the 24.

| arm | run | pass | refused / refused-then-answered / answered (of 24) | forbidden figure (all 28) | cited (of 24) |
|---|---|---|---|---|---|
| baseline | 1 | 14/28 | 22 / 2 / 0 | 5 | 13 |
| baseline | 2 | 16/27¹ | 23 / 1 / 0 | 4 | 10 |
| baseline | 3 | 16/28 | 22 / 2 / 0 | 4 | 11 |
| strict | 1 | 17/28 | 24 / 0 / 0 | 2 | 10 |
| strict | 2 | 18/28 | 24 / 0 / 0 | 2 | 9 |
| strict | 3 | 19/28 | 24 / 0 / 0 | 2 | 8 |
| control (no retrieval) | 1 | 3/27² | 2 / 7 / 14 (of 23) | 1 | — |

¹ `pl-premise-xl-wolfsbane-b5` was ungraded: the judge returned unreadable
JSON. ² `en-ooc-onboard-surcharge` was ungraded: the control call timed out 3
times. Both are excluded from the denominator, as the harness does.

Medians:

| arm | pass | refused-then-answered | answered | forbidden figure | cited |
|---|---|---|---|---|---|
| baseline | 16/28 | 2 | 0 | 4 | 11/24 |
| strict | 18/28 | 0 | 0 | 2 | 9/24 |

**Labels by language.** All of the RAG arms' `refused-then-answered` labels
are on Polish questions: 2/1/2 on baseline and 0/0/0 on strict. English is
12/12 `refused` in every RAG run. Given the v1 clause bug, the Polish counts
are not evidence on their own. The Polish cases behind them were read by hand:

- `pl-ooc-fare-evasion` and `pl-near-w1-fare` quote a neighbouring fee;
- `pl-premise-absent-student` says, in effect, "if I rely on general
  knowledge…" and computes 19,60 zł.

Their `expectNone` assertions catch all three. So the forbidden-figure column
measures the same thing deterministically.

**Strict failures by cause, over three runs** (30 failures out of 84):

- **24 fail only on the citation gate.** The text is a correct refusal with no
  figure, judged a pass, and it carries a source.
- **3 are `pl-near-w1-fare`.** The refusal quotes the bicycle fare "9,80 zł"
  as context.
- **3 are `en-premise-xl-kolej-voucher`.** It does not correct the false
  premise. This fails in every arm, the control included.

Baseline over its 83 graded cases had 37 failures: 24 citation-only and 13 on
content.

## Results — `kolej-bilingual-v1` rev 2 (over-refusal arm)

| arm | run | pass | answerable (of 22) | guard-hallucination (of 2) | evidence | cross-lingual evidence |
|---|---|---|---|---|---|---|
| baseline | 1 | 22/24 | 21/22 | 1/2 | 25/26 | 7/8 |
| baseline | 2 | 19/24 | 19/22 | 0/2 | 25/26 | 7/8 |
| baseline | 3 | 20/23³ | 19/21 | 1/2 | 24/25 | 7/8 |
| strict | 1 | 22/24 | 21/22 | 1/2 | 25/26 | 7/8 |
| strict | 2 | 22/24 | 21/22 | 1/2 | 25/26 | 7/8 |
| strict | 3 | 22/24 | 21/22 | 1/2 | 25/26 | 7/8 |

³ `pl-mono-refund-pct` was ungraded: `fetch failed` on the chat request,
once. The server stayed healthy.

Medians: baseline 20/23 pass and 19/22 answerable, against strict 22/24 pass
and 21/22 answerable. Evidence is 25/26 on both.

Answerable failures, by run:

- **baseline:** `xl-en2pl-bike-fare` ×3, `pl-mono-refund-deadline` ×1,
  `en-mono-refund-deadline` ×1, `en-mono-baggage-weight` ×1 (a judge failure
  on a correct "24 kg").
- **strict:** `xl-en2pl-bike-fare` ×2 and `xl-en2pl-refund-pct` ×1.

**Over-refusal:** there is one candidate, `xl-en2pl-refund-pct` in strict
run 1. It answered "the documents only cover Wolfsbane". Baseline answered it
in all three runs. It is not a rule effect. In that case the evidence was
0/1: retrieval did not hand the model the 87 % chunk. Without the figure, no
rule could have produced the right answer, so strict refusing is the correct
behaviour given that context. No other answerable question that baseline
answered was refused under strict. `xl-en2pl-bike-fare` is the cross-lingual
retrieval miss that B1 also saw. It fails in both arms, and in two runs per
arm it answers with the sibling operator's EUR 3.40.

## What it says

**Strict removes the general-knowledge answers.** Forbidden figures fall from
4–5 per run to 2 in every run. The two left are the same in all three runs:

- one is a premise failure the rule does not address (`en-premise-xl-kolej-voucher`);
- the other is a refusal that quotes a real neighbouring figure as context
  (`pl-near-w1-fare`).

Leaving out the voucher case, which fails identically in every arm, the
figure is 4/3/3 against 1/1/1. The median delta of 2–3 cases sits at the
noise floor. But every strict run is below every baseline run, and it points
the same way as the hand-read answers: "jeśli jednak opierać się na mojej
wiedzy…" no longer appears. On pass rate, strict's median is +2 (16 → 18/28).
Its worst run (17) beats baseline's best (16), but the gap is under the
three-case threshold.

**Strict does not fix the citations.** A refusal still carries a source in
8–10 of 24 cases, against 10–13 on baseline. That is a median of 9 against 11,
within noise. The citation gate is now the dominant failure: 24 of strict's
30 failures are correct refusals that only fail it. They concentrate on the
near-miss questions:

- `pl-near-bridge-cost`, `pl-near-xl-wolfsbane-fleet`,
  `en-near-january-refund-total`, `en-near-xl-kolej-annual-bike-pass` and
  `pl-near-delay-claim-deadline` fail it in 3/3 strict runs;
- so does `en-ooc-xl-kolej-family-ticket`.

The answer cites the relevant document it describes the gap in.

**Over-refusal cost: none measurable.** kolej is 21/22 answerable in every
strict run, against a baseline median of 19/22, with identical evidence
recall. The single strict refusal of an answerable question was a retrieval
miss, not the rule.

**On C3's grader.** Under strict, the guard cases failing are:

- **all failures:** median 10/28 (36 %), with a range of 9–11;
- **not counting the citation gate:** 2/28 (7 %) in every run;
- **failures where the answer itself states a figure it must not:** 1/24
  must-not-cite cases (4 %), `pl-near-w1-fare`, in every run.

Whether that is "more than the agreed share" depends on whether the share
counts the citation gate. That is left to the spec owner. One observation
bears on it: the remaining failures are near-miss refusals citing a document
that is on topic. A grader that withholds context it judges "not relevant"
would likely pass those passages as relevant, so it may not move the citation
count. That is the behaviour #1218 addressed in the prompt.

## Update: the citation gate was the wrong instrument

These runs used `guard-bilingual-v1` **v1**, whose deterministic gate failed
any guard answer that cited a document. Reading the failures showed that the
gate failed mostly correct answers: a near-miss refusal states the absence
without a citation and then cites the related fact the documents do hold
("they only say the W7 line is suspended for the repair [1]"). Corpus v3
(#1519) drops the gate and moves the rule into the rubric (a marker on the
statement of absence fails, one on a real fact does not).

Recomputed from these result files with the citation failures left out (the
v1 rubrics, so the new rubric rule is not applied):

| arm | guard pass, runs 1/2/3 | median |
|---|---|---|
| baseline | 23/28, 23/27, 24/28 | 23 |
| strict | 26/28, 26/28, 26/28 | 26 |

Every strict run beats every baseline run; the median gap (+3) sits at the
harness's noise floor. **C3's grader is not needed:** without the citation
gate strict leaves 2/28 guard cases failing (7%), 1/24 with a forbidden
figure, and no over-refusal attributable to the rule on `kolej`.

