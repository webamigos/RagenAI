# RAG benchmark — tabele-bilingual-v1 v1

Run on **2026-10-01** against commit `8c62c5d03`.

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
| post-retrieval, as the server reported it | `reranker:scaleway` × 18 |
| multi-query variants | on, 1 variant per turn (code constant) |
| ingest shape | ca3-prefix-dense |
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
| pl | 3/9 (33%) | — |
| en | 6/9 (67%) | — |

### Language of the document holding the answer

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 5/10 (50%) | — |
| en | 4/8 (50%) | — |

### Same-language vs cross-lingual

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| question and document same language | 7/13 (54%) | — |
| cross-lingual | 2/5 (40%) | — |

## By question type

### Question type

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| numeric | 5/9 (56%) | — |
| multi-hop | 0/2 (0%) | — |
| cross-lingual | 2/5 (40%) | — |
| guard-hallucination | 1/1 (100%) | — |
| guard-sycophancy | 1/1 (100%) | — |

## Evidence recall (RAG arm)

Of the figures each question's assertions look for, how many were in the
chunks the server says it gave the answer model — read back from the
`retrieval` event's trace. Low evidence with a low pass rate is a
retrieval miss; high evidence with a low pass rate is the answer.

| | evidence found |
|---|---|
| all questions | 11/18 (61%); all evidence in context 10/17 |
| same language | 7/13 (54%); all evidence in context 6/12 |
| cross-lingual | 4/5 (80%); all evidence in context 4/5 |
| type: numeric | 5/9 (56%); all evidence in context 5/9 |
| type: multi-hop | 1/3 (33%); all evidence in context 0/2 |
| type: cross-lingual | 4/5 (80%); all evidence in context 4/5 |
| type: guard-hallucination | — |
| type: guard-sycophancy | 1/1 (100%); all evidence in context 1/1 |

## By document

Each question counts toward every document that holds its answer, including
questions that cited nothing; a guard question whose answer is in no document
is not counted. The RAG score is the one ingest wrote when this run uploaded it.

| document | RAG score | Ragen (RAG) | control (no retrieval) |
|---|---|---|---|
| `docs/pl-01-limity-sprzetowe.md` | failed | 1/3 (33%) | — |
| `docs/pl-02-stawki-serwisowe.md` | failed | 2/4 (50%) | — |
| `docs/pl-03-rejestr-wytopow.xlsx` | failed | 1/2 (50%) | — |
| `docs/en-01-equipment-limits.md` | failed | 3/5 (60%) | — |
| `docs/en-02-service-rates.md` | failed | 1/3 (33%) | — |

## Per-case detail (RAG arm)

| id | lang → doc | type | result | note |
|---|---|---|---|---|
| `pl-cap-metallographic` | pl → pl | numeric | PASS |  |
| `pl-cap-extensometer` | pl → pl | numeric | FAIL | missing: "21 629,67"; rubric: Odpowiedź nie podaje wymaganej kwoty 21 629,67. |
| `pl-rate-roughness` | pl → pl | numeric | PASS |  |
| `pl-rate-scale-verification-oob` | pl → pl | numeric | FAIL | missing: "656,43"; rubric: Odpowiedź nie podaje wymaganej stawki 656,43 zł/h ani uzasadnienia dotyczącego niedzieli. |
| `pl-roughness-and-callout` | pl → pl | multi-hop | FAIL | missing: "399,63"; rubric: Odpowiedź nie podaje stawki podstawowej za pomiar chropowatości, twierdząc, że nie jest ona dostępna w materiałach. |
| `pl-heat-cost` | pl → pl | numeric | FAIL | missing: "49,19"; rubric: The answer does not state 49,19 zł/kg as the unit cost for WT-3140. |
| `en-heat-charge-mass` | en → pl | cross-lingual | PASS |  |
| `en-cap-metallographic` | en → en | numeric | PASS |  |
| `en-cap-extensometer` | en → en | numeric | PASS |  |
| `en-rate-roughness` | en → en | numeric | PASS |  |
| `en-rate-scale-verification-oob` | en → en | numeric | FAIL | missing: "149.64"; rubric: The answer does not provide the specific hourly rate of GBP 149.64 for a Saturday. |
| `en-extensometer-cap-and-period` | en → en | multi-hop | FAIL | missing: "5,807.94"; rubric: The answer does not provide the cap of GBP 5,807.94 for TF-3369 and the review period of 36 months. |
| `en-ask-pl-cap` | en → pl | cross-lingual | FAIL | must not contain: "36 171,14" |
| `pl-ask-en-roughness` | pl → en | cross-lingual | FAIL | missing: "58.39"; rubric: Odpowiedź nie podaje wymaganej stawki 58,39 GBP za godzinę dla SV-421. |
| `pl-ask-en-microscope-cap` | pl → en | cross-lingual | FAIL | rubric: Odpowiedź nie podaje waluty (GBP), która jest wymagana przez rubrykę. |
| `en-ask-pl-roughness-oob` | en → pl | cross-lingual | PASS |  |
| `pl-guard-unknown-code` | pl → pl | guard-hallucination | PASS |  |
| `en-guard-false-premise` | en → en | guard-sycophancy | PASS |  |
