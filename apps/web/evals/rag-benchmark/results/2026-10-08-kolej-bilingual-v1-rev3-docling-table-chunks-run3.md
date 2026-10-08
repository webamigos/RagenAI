# RAG benchmark — kolej-bilingual-v1 v3

Run on **2026-10-08** against commit `8ea12ae5d`.

Every figure in this corpus was invented for it and exists nowhere else, so a
correct answer to a question that needs one of those figures is evidence that
retrieval worked rather than that the model remembered. A guard question, whose
right answer is that the documents do not say, can be passed without
retrieval. The control column is the same model answering the same question
with no documents attached — the floor the pipeline has to beat.

## Stack under test

| | |
|---|---|
| chat model | `gemini-3-flash-preview` |
| judge model | `gemini-2.5-flash` |
| rephrase model | `mistral-small-3.2` |
| embeddings | `bge-multilingual-gemma2` (3584-dim) |
| reranking | on for the organization; FEATURE_FLAG_RERANKING=1 in the runner's environment (the server's is not visible) — `scaleway` / `qwen3-embedding-8b` |
| post-retrieval, as the server reported it | `reranker:scaleway + neighbours` × 23, `reranker:scaleway` × 1 |
| multi-query variants | on, 1 variant per turn (code constant) |
| ingest shape | docling-table-chunks |
| LLM path | `(unknown: healthcheck did not say)` |

## Overall

### All questions

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| all questions | 23/24 (96%) | — |

## By language

### Language the question was asked in

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 12/12 (100%) | — |
| en | 11/12 (92%) | — |

### Language of the document holding the answer

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 12/12 (100%) | — |
| en | 11/12 (92%) | — |

### Same-language vs cross-lingual

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| question and document same language | 15/16 (94%) | — |
| cross-lingual | 8/8 (100%) | — |

## By question type

### Question type

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| factual | 2/2 (100%) | — |
| numeric | 5/6 (83%) | — |
| comparative | 2/2 (100%) | — |
| multi-hop | 2/2 (100%) | — |
| guard-hallucination | 2/2 (100%) | — |
| guard-sycophancy | 2/2 (100%) | — |
| cross-lingual | 8/8 (100%) | — |

## Evidence recall (RAG arm)

Of the figures each question's assertions look for, how many were in the
chunks the server says it gave the answer model — read back from the
`retrieval` event's trace. Low evidence with a low pass rate is a
retrieval miss; high evidence with a low pass rate is the answer.

| | evidence found |
|---|---|
| all questions | 26/26 (100%); all evidence in context 22/22 |
| same language | 18/18 (100%); all evidence in context 14/14 |
| cross-lingual | 8/8 (100%); all evidence in context 8/8 |
| type: factual | 2/2 (100%); all evidence in context 2/2 |
| type: numeric | 6/6 (100%); all evidence in context 6/6 |
| type: comparative | 4/4 (100%); all evidence in context 2/2 |
| type: multi-hop | 4/4 (100%); all evidence in context 2/2 |
| type: guard-hallucination | — |
| type: guard-sycophancy | 2/2 (100%); all evidence in context 2/2 |
| type: cross-lingual | 8/8 (100%); all evidence in context 8/8 |

## Guard outcomes

Questions whose answer is in no document. The labels are the judge’s
reading of each rubric, reported rather than graded. The citation row counts
RAG answers carrying a citation; it is not a grading gate. A citation on the
statement of absence fails the rubric, a citation on a documented fact does not.

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| cited a document (reported, not graded) | 1 | 0 |

## By document

Each question counts toward every document that holds its answer, including
questions that cited nothing; a guard question whose answer is in no document
is not counted. The RAG score is the one ingest wrote when this run uploaded it.

| document | RAG score | Ragen (RAG) | control (no retrieval) |
|---|---|---|---|
| `docs/pl-01-regulamin-zwrotow.md` | failed | 6/6 (100%) | — |
| `docs/pl-02-regulamin-bagazu.md` | failed | 2/2 (100%) | — |
| `docs/pl-03-polityka-opoznien.md` | failed | 2/2 (100%) | — |
| `docs/pl-04-protokol-zarzadu.md` | failed | 2/2 (100%) | — |
| `docs/en-01-refund-policy.md` | failed | 6/6 (100%) | — |
| `docs/en-02-baggage-policy.md` | failed | 1/2 (50%) | — |
| `docs/en-03-delay-compensation.md` | failed | 2/2 (100%) | — |
| `docs/en-04-board-minutes.md` | failed | 2/2 (100%) | — |

## Per-case detail (RAG arm)

| id | lang → doc | type | result | note |
|---|---|---|---|---|
| `pl-mono-refund-pct` | pl → pl | factual | PASS |  |
| `pl-mono-refund-deadline` | pl → pl | numeric | PASS |  |
| `pl-mono-baggage-weight` | pl → pl | numeric | PASS |  |
| `pl-mono-refund-threshold` | pl → pl | numeric | PASS |  |
| `pl-mono-compare-deadlines` | pl → pl | comparative | PASS |  |
| `pl-mono-multihop-bazyliszek` | pl → pl | multi-hop | PASS |  |
| `pl-mono-guard-hallucination` | pl → pl | guard-hallucination | PASS |  |
| `pl-mono-guard-sycophancy` | pl → pl | guard-sycophancy | PASS |  |
| `en-mono-refund-pct` | en → en | factual | PASS |  |
| `en-mono-refund-deadline` | en → en | numeric | PASS |  |
| `en-mono-baggage-weight` | en → en | numeric | FAIL | rubric: The answer states the total free allowance is 24 kg, not 18 kg. |
| `en-mono-refund-threshold` | en → en | numeric | PASS |  |
| `en-mono-compare-deadlines` | en → en | comparative | PASS |  |
| `en-mono-multihop-cockatrice` | en → en | multi-hop | PASS |  |
| `en-mono-guard-hallucination` | en → en | guard-hallucination | PASS |  |
| `en-mono-guard-sycophancy` | en → en | guard-sycophancy | PASS |  |
| `xl-pl2en-refund-pct` | pl → en | cross-lingual | PASS |  |
| `xl-pl2en-baggage-liability` | pl → en | cross-lingual | PASS |  |
| `xl-pl2en-delay-threshold` | pl → en | cross-lingual | PASS |  |
| `xl-pl2en-bike-fare` | pl → en | cross-lingual | PASS |  |
| `xl-en2pl-refund-pct` | en → pl | cross-lingual | PASS |  |
| `xl-en2pl-baggage-liability` | en → pl | cross-lingual | PASS |  |
| `xl-en2pl-min-payout` | en → pl | cross-lingual | PASS |  |
| `xl-en2pl-bike-fare` | en → pl | cross-lingual | PASS |  |
