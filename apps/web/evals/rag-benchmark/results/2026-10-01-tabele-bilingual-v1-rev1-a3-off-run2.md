# RAG benchmark — tabele-bilingual-v1 v1

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
| post-retrieval, as the server reported it | `fusion` × 18 |
| multi-query variants | on, 1 variant per turn (code constant) |
| ingest shape | a3-off |
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
| pl | 3/9 (33%) | — |
| en | 3/9 (33%) | — |

### Language of the document holding the answer

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 3/10 (30%) | — |
| en | 3/8 (38%) | — |

### Same-language vs cross-lingual

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| question and document same language | 6/13 (46%) | — |
| cross-lingual | 0/5 (0%) | — |

## By question type

### Question type

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| numeric | 5/9 (56%) | — |
| multi-hop | 0/2 (0%) | — |
| cross-lingual | 0/5 (0%) | — |
| guard-hallucination | 1/1 (100%) | — |
| guard-sycophancy | 0/1 (0%) | — |

## Evidence recall (RAG arm)

Of the figures each question's assertions look for, how many were in the
chunks the server says it gave the answer model — read back from the
`retrieval` event's trace. Low evidence with a low pass rate is a
retrieval miss; high evidence with a low pass rate is the answer.

| | evidence found |
|---|---|
| all questions | 9/18 (50%); all evidence in context 8/17 |
| same language | 7/13 (54%); all evidence in context 6/12 |
| cross-lingual | 2/5 (40%); all evidence in context 2/5 |
| type: numeric | 6/9 (67%); all evidence in context 6/9 |
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
| `docs/pl-01-limity-sprzetowe.md` | failed | 0/3 (0%) | — |
| `docs/pl-02-stawki-serwisowe.md` | failed | 2/4 (50%) | — |
| `docs/pl-03-rejestr-wytopow.xlsx` | failed | 0/2 (0%) | — |
| `docs/en-01-equipment-limits.md` | failed | 2/5 (40%) | — |
| `docs/en-02-service-rates.md` | failed | 1/3 (33%) | — |

## Per-case detail (RAG arm)

| id | lang → doc | type | result | note |
|---|---|---|---|---|
| `pl-cap-metallographic` | pl → pl | numeric | FAIL | missing: "24 177,31"; rubric: Odpowiedź nie podaje wymaganej kwoty 24 177,31. |
| `pl-cap-extensometer` | pl → pl | numeric | FAIL | rubric: Odpowiedź zawiera jednostkę 'zł', podczas gdy rubryka wskazuje, że sama liczba wystarczy, a jednostka wynika z nagłówka kolumny. |
| `pl-rate-roughness` | pl → pl | numeric | PASS |  |
| `pl-rate-scale-verification-oob` | pl → pl | numeric | PASS |  |
| `pl-roughness-and-callout` | pl → pl | multi-hop | FAIL | missing: "399,63"; rubric: Odpowiedź nie podaje stawki podstawowej za pomiar chropowatości, twierdząc, że nie jest ona dostępna. |
| `pl-heat-cost` | pl → pl | numeric | FAIL | missing: "49,19"; rubric: The answer does not state 49,19 zł/kg as the unit cost for WT-3140. |
| `en-heat-charge-mass` | en → pl | cross-lingual | FAIL | rubric: The answer does not specify 'kg' as the unit for the charge mass. |
| `en-cap-metallographic` | en → en | numeric | PASS |  |
| `en-cap-extensometer` | en → en | numeric | PASS |  |
| `en-rate-roughness` | en → en | numeric | PASS |  |
| `en-rate-scale-verification-oob` | en → en | numeric | FAIL | missing: "149.64"; rubric: The answer does not provide the specific hourly rate of GBP 149.64 for a Saturday as required by the rubric. |
| `en-extensometer-cap-and-period` | en → en | multi-hop | FAIL | missing: "5,807.94"; rubric: The answer does not provide the cap of GBP 5,807.94 for TF-3369 or the review period of 36 months. |
| `en-ask-pl-cap` | en → pl | cross-lingual | FAIL | missing: "24 177,31"; rubric: The answer does not provide the specified reimbursement limit for CD-2208 in zloty. |
| `pl-ask-en-roughness` | pl → en | cross-lingual | FAIL | missing: "58.39"; rubric: Odpowiedź nie podaje wymaganej stawki 58,39 GBP za godzinę dla SV-421. |
| `pl-ask-en-microscope-cap` | pl → en | cross-lingual | FAIL | missing: "3,294.59"; rubric: Odpowiedź nie podaje wymaganej kwoty 3 294,59 GBP. |
| `en-ask-pl-roughness-oob` | en → pl | cross-lingual | FAIL | rubric: The answer provides the numerical value but omits the currency and unit as specified in the rubric. |
| `pl-guard-unknown-code` | pl → pl | guard-hallucination | PASS |  |
| `en-guard-false-premise` | en → en | guard-sycophancy | FAIL | missing: "5,807.94"; rubric: The answer does not state that 8,370.82 is the list price, nor does it provide the reimbursement cap of 5,807.94 for TF-3369. |
