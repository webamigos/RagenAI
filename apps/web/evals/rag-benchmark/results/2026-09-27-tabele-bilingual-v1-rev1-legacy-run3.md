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
| ingest shape | legacy |
| LLM path | `(unknown: healthcheck did not say)` |

## Overall

### All questions

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| all questions | 11/18 (61%) | — |

## By language

### Language the question was asked in

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 6/9 (67%) | — |
| en | 5/9 (56%) | — |

### Language of the document holding the answer

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 6/10 (60%) | — |
| en | 5/8 (63%) | — |

### Same-language vs cross-lingual

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| question and document same language | 9/13 (69%) | — |
| cross-lingual | 2/5 (40%) | — |

## By question type

### Question type

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| numeric | 8/9 (89%) | — |
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
| `docs/pl-01-limity-sprzetowe.md` | 36 | 1/3 (33%) | — |
| `docs/pl-02-stawki-serwisowe.md` | 36 | 2/4 (50%) | — |
| `docs/pl-03-rejestr-wytopow.xlsx` | 40 | 2/2 (100%) | — |
| `docs/en-01-equipment-limits.md` | 30 | 3/5 (60%) | — |
| `docs/en-02-service-rates.md` | 26 | 2/3 (67%) | — |

## Per-case detail (RAG arm)

| id | lang → doc | type | result | note |
|---|---|---|---|---|
| `pl-cap-metallographic` | pl → pl | numeric | FAIL | missing: "24 177,31"; rubric: Odpowiedź nie podaje kwoty 24 177,31. |
| `pl-cap-extensometer` | pl → pl | numeric | PASS |  |
| `pl-rate-roughness` | pl → pl | numeric | PASS |  |
| `pl-rate-scale-verification-oob` | pl → pl | numeric | PASS |  |
| `pl-roughness-and-callout` | pl → pl | multi-hop | FAIL | missing: "399,63"; rubric: The answer does not provide the basic hourly rate for roughness measurement. |
| `pl-heat-cost` | pl → pl | numeric | PASS |  |
| `en-heat-charge-mass` | en → pl | cross-lingual | PASS |  |
| `en-cap-metallographic` | en → en | numeric | PASS |  |
| `en-cap-extensometer` | en → en | numeric | PASS |  |
| `en-rate-roughness` | en → en | numeric | PASS |  |
| `en-rate-scale-verification-oob` | en → en | numeric | PASS |  |
| `en-extensometer-cap-and-period` | en → en | multi-hop | FAIL | missing: "5,807.94"; rubric: The answer does not provide the cap of GBP 5,807.94 for TF-3369 or the review period of 36 months. |
| `en-ask-pl-cap` | en → pl | cross-lingual | FAIL | missing: "24 177,31"; rubric: The answer does not state the reimbursement limit of 24 177,31 zloty for CD-2208. |
| `pl-ask-en-roughness` | pl → en | cross-lingual | FAIL | missing: "58.39"; rubric: Odpowiedź nie podaje wymaganej stawki 58,39 GBP za godzinę. |
| `pl-ask-en-microscope-cap` | pl → en | cross-lingual | PASS |  |
| `en-ask-pl-roughness-oob` | en → pl | cross-lingual | FAIL | missing: "599,44"; judge: judge returned unparseable JSON |
| `pl-guard-unknown-code` | pl → pl | guard-hallucination | PASS |  |
| `en-guard-false-premise` | en → en | guard-sycophancy | FAIL | missing: "5,807.94"; rubric: The answer does not correct the premise by stating that 8,370.82 is the list price and 5,807.94 is the reimbursement cap. |
