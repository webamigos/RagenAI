# RAG benchmark — kolej-bilingual-v1 v2

Run on **2026-10-01** against commit `adf68e17b`.

Every figure in this corpus was invented for it and exists nowhere else, so a
correct answer is evidence that retrieval worked rather than that the model
remembered. The control column is the same model answering the same question
with no documents attached — the floor the pipeline has to beat.

## Stack under test

| | |
|---|---|
| chat model | `gemini-3-flash-preview` |
| judge model | `gemini-2.5-flash` |
| rephrase model | `mistral-small-3.2` |
| embeddings | `bge-multilingual-gemma2` (3584-dim) |
| reranking | off (organization setting) — `scaleway` / `qwen3-embedding-8b` |
| post-retrieval, as the server reported it | `fusion` × 24 |
| multi-query variants | on, 1 variant per turn (code constant) |
| ingest shape | a3-off |
| LLM path | `(unknown: healthcheck did not say)` |

## Overall

### All questions

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| all questions | 15/24 (63%) | — |

## By language

### Language the question was asked in

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 8/12 (67%) | — |
| en | 7/12 (58%) | — |

### Language of the document holding the answer

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 6/12 (50%) | — |
| en | 9/12 (75%) | — |

### Same-language vs cross-lingual

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| question and document same language | 13/16 (81%) | — |
| cross-lingual | 2/8 (25%) | — |

## By question type

### Question type

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| factual | 2/2 (100%) | — |
| numeric | 5/6 (83%) | — |
| comparative | 2/2 (100%) | — |
| multi-hop | 1/2 (50%) | — |
| guard-hallucination | 1/2 (50%) | — |
| guard-sycophancy | 2/2 (100%) | — |
| cross-lingual | 2/8 (25%) | — |

## Evidence recall (RAG arm)

Of the figures each question's assertions look for, how many were in the
chunks the server says it gave the answer model — read back from the
`retrieval` event's trace. Low evidence with a low pass rate is a
retrieval miss; high evidence with a low pass rate is the answer.

| | evidence found |
|---|---|
| all questions | 20/26 (77%); all evidence in context 16/22 |
| same language | 18/18 (100%); all evidence in context 14/14 |
| cross-lingual | 2/8 (25%); all evidence in context 2/8 |
| type: factual | 2/2 (100%); all evidence in context 2/2 |
| type: numeric | 6/6 (100%); all evidence in context 6/6 |
| type: comparative | 4/4 (100%); all evidence in context 2/2 |
| type: multi-hop | 4/4 (100%); all evidence in context 2/2 |
| type: guard-hallucination | — |
| type: guard-sycophancy | 2/2 (100%); all evidence in context 2/2 |
| type: cross-lingual | 2/8 (25%); all evidence in context 2/8 |

## By document

Each question counts toward every document that holds its answer, including
questions that cited nothing; a guard question whose answer is in no document
is not counted. The RAG score is the one ingest wrote when this run uploaded it.

| document | RAG score | Ragen (RAG) | control (no retrieval) |
|---|---|---|---|
| `docs/pl-01-regulamin-zwrotow.md` | failed | 4/6 (67%) | — |
| `docs/pl-02-regulamin-bagazu.md` | failed | 1/2 (50%) | — |
| `docs/pl-03-polityka-opoznien.md` | failed | 1/2 (50%) | — |
| `docs/pl-04-protokol-zarzadu.md` | failed | 1/2 (50%) | — |
| `docs/en-01-refund-policy.md` | failed | 5/6 (83%) | — |
| `docs/en-02-baggage-policy.md` | failed | 2/2 (100%) | — |
| `docs/en-03-delay-compensation.md` | failed | 2/2 (100%) | — |
| `docs/en-04-board-minutes.md` | failed | 0/2 (0%) | — |

## Per-case detail (RAG arm)

| id | lang → doc | type | result | note |
|---|---|---|---|---|
| `pl-mono-refund-pct` | pl → pl | factual | PASS |  |
| `pl-mono-refund-deadline` | pl → pl | numeric | FAIL | must not contain: "21 dni" |
| `pl-mono-baggage-weight` | pl → pl | numeric | PASS |  |
| `pl-mono-refund-threshold` | pl → pl | numeric | PASS |  |
| `pl-mono-compare-deadlines` | pl → pl | comparative | PASS |  |
| `pl-mono-multihop-bazyliszek` | pl → pl | multi-hop | PASS |  |
| `pl-mono-guard-hallucination` | pl → pl | guard-hallucination | FAIL | must not contain: "61 zł"; rubric: Odpowiedź podaje konkretną kwotę z innej taryfy (opłata za nadbagaż), co jest niezgodne z rubryką. |
| `pl-mono-guard-sycophancy` | pl → pl | guard-sycophancy | PASS |  |
| `en-mono-refund-pct` | en → en | factual | PASS |  |
| `en-mono-refund-deadline` | en → en | numeric | PASS |  |
| `en-mono-baggage-weight` | en → en | numeric | PASS |  |
| `en-mono-refund-threshold` | en → en | numeric | PASS |  |
| `en-mono-compare-deadlines` | en → en | comparative | PASS |  |
| `en-mono-multihop-cockatrice` | en → en | multi-hop | FAIL | missing: "31 October 2026" |
| `en-mono-guard-hallucination` | en → en | guard-hallucination | PASS |  |
| `en-mono-guard-sycophancy` | en → en | guard-sycophancy | PASS |  |
| `xl-pl2en-refund-pct` | pl → en | cross-lingual | FAIL | missing: "62"; must not contain: "87"; rubric: The answer does not state 62% as the refund percentage for Wolfsbane Interurban Rail. |
| `xl-pl2en-baggage-liability` | pl → en | cross-lingual | PASS |  |
| `xl-pl2en-delay-threshold` | pl → en | cross-lingual | PASS |  |
| `xl-pl2en-bike-fare` | pl → en | cross-lingual | FAIL | missing: "3.40"; must not contain: "9,80"; rubric: Odpowiedź podaje 9,80 zł zamiast wymaganych 3,40 EUR. |
| `xl-en2pl-refund-pct` | en → pl | cross-lingual | FAIL | missing: "87"; must not contain: "62"; rubric: The answer does not state 87% as required by the rubric. |
| `xl-en2pl-baggage-liability` | en → pl | cross-lingual | FAIL | missing: "1 480"; must not contain: "890"; judge: judge returned unparseable JSON |
| `xl-en2pl-min-payout` | en → pl | cross-lingual | FAIL | missing: "31"; must not contain: "27"; rubric: The answer does not state that compensation below 31 zł is not paid out for Kolej Nadwiślańska. |
| `xl-en2pl-bike-fare` | en → pl | cross-lingual | FAIL | missing: "9.80"; must not contain: "3.40"; rubric: The answer does not state 9,80 zł for a single bicycle journey. |
