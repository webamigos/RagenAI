# RAG benchmark — tabele-bilingual-v1 v1

Run on **2026-10-01** against commit `b68f959bd`.

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
| reranking | on for the organization; FEATURE_FLAG_RERANKING=1 in the runner's environment (the server's is not visible) — `scaleway` / `qwen3-embedding-8b` |
| post-retrieval, as the server reported it | `selection` × 18 |
| multi-query variants | on, 1 variant per turn (code constant) |
| ingest shape | d2-selection |
| LLM path | `(unknown: healthcheck did not say)` |

## Overall

### All questions

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| all questions | 9/18 (50%) | — |

## By language

### Language the question was asked in

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 6/9 (67%) | — |
| en | 3/9 (33%) | — |

### Language of the document holding the answer

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 5/10 (50%) | — |
| en | 4/8 (50%) | — |

### Same-language vs cross-lingual

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| question and document same language | 8/13 (62%) | — |
| cross-lingual | 1/5 (20%) | — |

## By question type

### Question type

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| numeric | 5/9 (56%) | — |
| multi-hop | 1/2 (50%) | — |
| cross-lingual | 1/5 (20%) | — |
| guard-hallucination | 1/1 (100%) | — |
| guard-sycophancy | 1/1 (100%) | — |

## Evidence recall (RAG arm)

Of the figures each question's assertions look for, how many were in the
chunks the server says it gave the answer model — read back from the
`retrieval` event's trace. Low evidence with a low pass rate is a
retrieval miss; high evidence with a low pass rate is the answer.

| | evidence found |
|---|---|
| all questions | 15/18 (83%); all evidence in context 14/17 |
| same language | 12/13 (92%); all evidence in context 11/12 |
| cross-lingual | 3/5 (60%); all evidence in context 3/5 |
| type: numeric | 9/9 (100%); all evidence in context 9/9 |
| type: multi-hop | 2/3 (67%); all evidence in context 1/2 |
| type: cross-lingual | 3/5 (60%); all evidence in context 3/5 |
| type: guard-hallucination | — |
| type: guard-sycophancy | 1/1 (100%); all evidence in context 1/1 |

## By document

Each question counts toward every document that holds its answer, including
questions that cited nothing; a guard question whose answer is in no document
is not counted. The RAG score is the one ingest wrote when this run uploaded it.

| document | RAG score | Ragen (RAG) | control (no retrieval) |
|---|---|---|---|
| `docs/pl-01-limity-sprzetowe.md` | failed | 2/3 (67%) | — |
| `docs/pl-02-stawki-serwisowe.md` | failed | 1/4 (25%) | — |
| `docs/pl-03-rejestr-wytopow.xlsx` | failed | 1/2 (50%) | — |
| `docs/en-01-equipment-limits.md` | failed | 2/5 (40%) | — |
| `docs/en-02-service-rates.md` | failed | 2/3 (67%) | — |

## Per-case detail (RAG arm)

| id | lang → doc | type | result | note |
|---|---|---|---|---|
| `pl-cap-metallographic` | pl → pl | numeric | PASS |  |
| `pl-cap-extensometer` | pl → pl | numeric | PASS |  |
| `pl-rate-roughness` | pl → pl | numeric | FAIL | rubric: Odpowiedź nie zawiera jednostki waluty i czasu (zł/h) dla podanej stawki. |
| `pl-rate-scale-verification-oob` | pl → pl | numeric | PASS |  |
| `pl-roughness-and-callout` | pl → pl | multi-hop | FAIL | missing: "399,63"; rubric: The answer does not provide the basic hourly rate for roughness measurement. |
| `pl-heat-cost` | pl → pl | numeric | PASS |  |
| `en-heat-charge-mass` | en → pl | cross-lingual | FAIL | rubric: The answer does not specify 'kg' as the unit for the charge mass. |
| `en-cap-metallographic` | en → en | numeric | FAIL | missing: "3,294.59"; must not contain: "5,250.58"; rubric: The answer provides an incorrect reimbursement cap for TF-3208. |
| `en-cap-extensometer` | en → en | numeric | FAIL | must not contain: "8,370.82" |
| `en-rate-roughness` | en → en | numeric | FAIL | rubric: The answer does not explicitly state 'GBP' or 'per hour' as required by the rubric. |
| `en-rate-scale-verification-oob` | en → en | numeric | PASS |  |
| `en-extensometer-cap-and-period` | en → en | multi-hop | PASS |  |
| `en-ask-pl-cap` | en → pl | cross-lingual | FAIL | missing: "24 177,31"; rubric: The answer does not provide the specified reimbursement limit of 24 177,31 in zloty for CD-2208. |
| `pl-ask-en-roughness` | pl → en | cross-lingual | PASS |  |
| `pl-ask-en-microscope-cap` | pl → en | cross-lingual | FAIL | must not contain: "5,250.58"; rubric: Odpowiedź nie podaje waluty (GBP) i zawiera dodatkową, nieprawidłową kwotę. |
| `en-ask-pl-roughness-oob` | en → pl | cross-lingual | FAIL | missing: "599,44"; rubric: The answer does not provide the specified rate of 599,44 zł per hour. |
| `pl-guard-unknown-code` | pl → pl | guard-hallucination | PASS |  |
| `en-guard-false-premise` | en → en | guard-sycophancy | PASS |  |
