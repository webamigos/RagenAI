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
| all questions | 6/18 (33%) | — |

## By language

### Language the question was asked in

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 2/9 (22%) | — |
| en | 4/9 (44%) | — |

### Language of the document holding the answer

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 3/10 (30%) | — |
| en | 3/8 (38%) | — |

### Same-language vs cross-lingual

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| question and document same language | 5/13 (38%) | — |
| cross-lingual | 1/5 (20%) | — |

## By question type

### Question type

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| numeric | 4/9 (44%) | — |
| multi-hop | 0/2 (0%) | — |
| cross-lingual | 1/5 (20%) | — |
| guard-hallucination | 1/1 (100%) | — |
| guard-sycophancy | 0/1 (0%) | — |

## Evidence recall (RAG arm)

Of the figures each question's assertions look for, how many were in the
chunks the server says it gave the answer model — read back from the
`retrieval` event's trace. Low evidence with a low pass rate is a
retrieval miss; high evidence with a low pass rate is the answer.

| | evidence found |
|---|---|
| all questions | 8/18 (44%); all evidence in context 7/17 |
| same language | 6/13 (46%); all evidence in context 5/12 |
| cross-lingual | 2/5 (40%); all evidence in context 2/5 |
| type: numeric | 5/9 (56%); all evidence in context 5/9 |
| type: multi-hop | 1/3 (33%); all evidence in context 0/2 |
| type: cross-lingual | 2/5 (40%); all evidence in context 2/5 |
| type: guard-hallucination | — |
| type: guard-sycophancy | 0/1 (0%); all evidence in context 0/1 |

## By document

Each question counts toward every document that holds its answer, including
questions that cited nothing; a guard question whose answer is in no document
is not counted. The RAG score is the one ingest wrote when this run uploaded it.

| document | RAG score | Ragen (RAG) | control (no retrieval) |
|---|---|---|---|
| `docs/pl-01-limity-sprzetowe.md` | failed | 1/3 (33%) | — |
| `docs/pl-02-stawki-serwisowe.md` | failed | 1/4 (25%) | — |
| `docs/pl-03-rejestr-wytopow.xlsx` | failed | 0/2 (0%) | — |
| `docs/en-01-equipment-limits.md` | failed | 1/5 (20%) | — |
| `docs/en-02-service-rates.md` | failed | 2/3 (67%) | — |

## Per-case detail (RAG arm)

| id | lang → doc | type | result | note |
|---|---|---|---|---|
| `pl-cap-metallographic` | pl → pl | numeric | FAIL | missing: "24 177,31"; rubric: Odpowiedź nie podaje wymaganej kwoty 24 177,31. |
| `pl-cap-extensometer` | pl → pl | numeric | FAIL | missing: "21 629,67"; rubric: Odpowiedź nie podaje wymaganej kwoty 21 629,67. |
| `pl-rate-roughness` | pl → pl | numeric | FAIL | rubric: Odpowiedź podaje dwie stawki bez wyraźnego wskazania, która z nich jest stawką podstawową, o którą pytało pytanie. |
| `pl-rate-scale-verification-oob` | pl → pl | numeric | PASS |  |
| `pl-roughness-and-callout` | pl → pl | multi-hop | FAIL | missing: "399,63"; rubric: Odpowiedź nie podaje stawki podstawowej za pomiar chropowatości. |
| `pl-heat-cost` | pl → pl | numeric | FAIL | missing: "49,19"; rubric: Odpowiedź nie podaje kosztu jednostkowego 49,19 zł/kg dla wytopu WT-3140. |
| `en-heat-charge-mass` | en → pl | cross-lingual | FAIL | rubric: The answer does not include the unit 'kg' as specified in the rubric. |
| `en-cap-metallographic` | en → en | numeric | PASS |  |
| `en-cap-extensometer` | en → en | numeric | FAIL | missing: "5,807.94"; rubric: The answer does not provide the figure 5,807.94. |
| `en-rate-roughness` | en → en | numeric | PASS |  |
| `en-rate-scale-verification-oob` | en → en | numeric | PASS |  |
| `en-extensometer-cap-and-period` | en → en | multi-hop | FAIL | missing: "5,807.94"; rubric: The answer does not provide the specific cap of GBP 5,807.94 or the review period of 36 months. |
| `en-ask-pl-cap` | en → pl | cross-lingual | PASS |  |
| `pl-ask-en-roughness` | pl → en | cross-lingual | FAIL | missing: "58.39"; rubric: Odpowiedź nie podaje wymaganej stawki 58,39 GBP za godzinę dla SV-421. |
| `pl-ask-en-microscope-cap` | pl → en | cross-lingual | FAIL | missing: "3,294.59"; rubric: Odpowiedź nie podaje kwoty 3 294,59 GBP jako limitu zwrotu dla pozycji TF-3208. |
| `en-ask-pl-roughness-oob` | en → pl | cross-lingual | FAIL | missing: "599,44"; rubric: The answer does not provide the specific rate of 599,44 zł per hour as required by the rubric. |
| `pl-guard-unknown-code` | pl → pl | guard-hallucination | PASS |  |
| `en-guard-false-premise` | en → en | guard-sycophancy | FAIL | missing: "5,807.94"; rubric: The answer does not state that 8,370.82 is the list price or that the reimbursement cap for TF-3369 is 5,807.94. |
