# RAG benchmark — tabele-bilingual-v1 v1

Run on **2026-09-27** against commit `a9b493dd5`.

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
| reranking | on — `scaleway` / `qwen3-embedding-8b` |
| multi-query variants | 1 (default) |
| ingest shape | docling |
| LLM path | `(unknown: healthcheck did not say)` |

## Overall

### All questions

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| all questions | 7/18 (39%) | — |

## By language

### Language the question was asked in

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 3/9 (33%) | — |
| en | 4/9 (44%) | — |

### Language of the document holding the answer

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 5/10 (50%) | — |
| en | 2/8 (25%) | — |

### Same-language vs cross-lingual

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| question and document same language | 5/13 (38%) | — |
| cross-lingual | 2/5 (40%) | — |

## By question type

### Question type

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| numeric | 4/9 (44%) | — |
| multi-hop | 0/2 (0%) | — |
| cross-lingual | 2/5 (40%) | — |
| guard-hallucination | 1/1 (100%) | — |
| guard-sycophancy | 0/1 (0%) | — |

## By document

Each question counts toward every document that holds its answer, including
questions that cited nothing; a guard question whose answer is in no document
is not counted. The RAG score is the one ingest wrote when this run uploaded it.

| document | RAG score | Ragen (RAG) | control (no retrieval) |
|---|---|---|---|
| `docs/pl-01-limity-sprzetowe.md` | 26 | 1/3 (33%) | — |
| `docs/pl-02-stawki-serwisowe.md` | 36 | 3/4 (75%) | — |
| `docs/pl-03-rejestr-wytopow.xlsx` | 45 | 0/2 (0%) | — |
| `docs/en-01-equipment-limits.md` | 23 | 2/5 (40%) | — |
| `docs/en-02-service-rates.md` | 29 | 0/3 (0%) | — |

## Per-case detail (RAG arm)

| id | lang → doc | type | result | note |
|---|---|---|---|---|
| `pl-cap-metallographic` | pl → pl | numeric | FAIL | missing: "24 177,31"; rubric: Odpowiedź nie podaje wymaganej kwoty 24 177,31 dla pozycji CD-2208. |
| `pl-cap-extensometer` | pl → pl | numeric | FAIL | missing: "21 629,67"; rubric: Odpowiedź nie podaje wymaganej kwoty 21 629,67. |
| `pl-rate-roughness` | pl → pl | numeric | PASS |  |
| `pl-rate-scale-verification-oob` | pl → pl | numeric | PASS |  |
| `pl-roughness-and-callout` | pl → pl | multi-hop | FAIL | missing: "399,63"; rubric: Odpowiedź nie podaje stawki podstawowej za pomiar chropowatości. |
| `pl-heat-cost` | pl → pl | numeric | FAIL | missing: "49,19"; rubric: Odpowiedź nie podaje kosztu jednostkowego 49,19 zł/kg. |
| `en-heat-charge-mass` | en → pl | cross-lingual | FAIL | must not contain: "64,77"; rubric: The answer identifies '1279' as a numerical value but does not explicitly state it is the charge mass. |
| `en-cap-metallographic` | en → en | numeric | PASS |  |
| `en-cap-extensometer` | en → en | numeric | PASS |  |
| `en-rate-roughness` | en → en | numeric | FAIL | missing: "58.39"; rubric: The answer does not provide the standard rate of GBP 58.39 per hour for SV-421. |
| `en-rate-scale-verification-oob` | en → en | numeric | FAIL | missing: "149.64"; judge: judge returned unparseable JSON |
| `en-extensometer-cap-and-period` | en → en | multi-hop | FAIL | missing: "5,807.94"; rubric: The answer does not provide the cap of GBP 5,807.94 for TF-3369 or the review period of 36 months, as required by the rubric. |
| `en-ask-pl-cap` | en → pl | cross-lingual | PASS |  |
| `pl-ask-en-roughness` | pl → en | cross-lingual | FAIL | missing: "58.39"; rubric: Odpowiedź nie podaje stawki 58,39 GBP za godzinę dla SV-421. |
| `pl-ask-en-microscope-cap` | pl → en | cross-lingual | FAIL | rubric: The answer does not specify the currency as GBP, which is explicitly required by the rubric. |
| `en-ask-pl-roughness-oob` | en → pl | cross-lingual | PASS |  |
| `pl-guard-unknown-code` | pl → pl | guard-hallucination | PASS |  |
| `en-guard-false-premise` | en → en | guard-sycophancy | FAIL | missing: "5,807.94"; rubric: The answer does not correct the premise by stating that 8,370.82 is the list price and 5,807.94 is the reimbursement cap. |
