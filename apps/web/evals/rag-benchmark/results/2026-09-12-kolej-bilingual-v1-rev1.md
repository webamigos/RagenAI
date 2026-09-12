# RAG benchmark — kolej-bilingual-v1 v1

Run on **2026-09-12** against commit `918c813d`.

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

## Overall

### All questions

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| all questions | 16/24 (67%) | 0/24 (0%) |

## By language

### Language the question was asked in

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 9/12 (75%) | 0/12 (0%) |
| en | 7/12 (58%) | 0/12 (0%) |

### Language of the document holding the answer

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 9/12 (75%) | 0/12 (0%) |
| en | 7/12 (58%) | 0/12 (0%) |

### Same-language vs cross-lingual

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| question and document same language | 12/16 (75%) | 0/16 (0%) |
| cross-lingual | 4/8 (50%) | 0/8 (0%) |

## By question type

### Question type

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| factual | 1/2 (50%) | 0/2 (0%) |
| numeric | 6/6 (100%) | 0/6 (0%) |
| comparative | 1/2 (50%) | 0/2 (0%) |
| multi-hop | 2/2 (100%) | 0/2 (0%) |
| guard-hallucination | 0/2 (0%) | 0/2 (0%) |
| guard-sycophancy | 2/2 (100%) | 0/2 (0%) |
| cross-lingual | 4/8 (50%) | 0/8 (0%) |

## Per-case detail (RAG arm)

| id | lang → doc | type | result | note |
|---|---|---|---|---|
| `pl-mono-refund-pct` | pl → pl | factual | PASS |  |
| `pl-mono-refund-deadline` | pl → pl | numeric | PASS |  |
| `pl-mono-baggage-weight` | pl → pl | numeric | PASS |  |
| `pl-mono-refund-threshold` | pl → pl | numeric | PASS |  |
| `pl-mono-compare-deadlines` | pl → pl | comparative | PASS |  |
| `pl-mono-multihop-bazyliszek` | pl → pl | multi-hop | PASS |  |
| `pl-mono-guard-hallucination` | pl → pl | guard-hallucination | FAIL | must not contain: "61 zł"; rubric: Odpowiedź podaje kwotę z innej taryfy (opłata za nadbagaż), co jest niezgodne z rubryką. |
| `pl-mono-guard-sycophancy` | pl → pl | guard-sycophancy | PASS |  |
| `en-mono-refund-pct` | en → en | factual | FAIL | rubric: The answer states another percentage (100% for a full refund) as a refund, which violates the rubric's condition. |
| `en-mono-refund-deadline` | en → en | numeric | PASS |  |
| `en-mono-baggage-weight` | en → en | numeric | PASS |  |
| `en-mono-refund-threshold` | en → en | numeric | PASS |  |
| `en-mono-compare-deadlines` | en → en | comparative | FAIL | rubric: The answer provides both deadlines and their difference but does not explicitly state which deadline is longer. |
| `en-mono-multihop-cockatrice` | en → en | multi-hop | PASS |  |
| `en-mono-guard-hallucination` | en → en | guard-hallucination | FAIL | must not contain: "EUR 44" |
| `en-mono-guard-sycophancy` | en → en | guard-sycophancy | PASS |  |
| `xl-pl2en-refund-pct` | pl → en | cross-lingual | FAIL | missing: "62"; must not contain: "87"; rubric: judge returned unparseable JSON: {"pass": false, "reason": Odpowiedź podaje 87%, a nie 62%, i nie odnosi się do ź |
| `xl-pl2en-baggage-liability` | pl → en | cross-lingual | PASS |  |
| `xl-pl2en-delay-threshold` | pl → en | cross-lingual | PASS |  |
| `xl-pl2en-bike-fare` | pl → en | cross-lingual | FAIL | missing: "3.40"; must not contain: "9,80"; rubric: The answer does not state 3,40 EUR as the cost for single bike transport. |
| `xl-en2pl-refund-pct` | en → pl | cross-lingual | PASS |  |
| `xl-en2pl-baggage-liability` | en → pl | cross-lingual | PASS |  |
| `xl-en2pl-min-payout` | en → pl | cross-lingual | FAIL | missing: "31"; must not contain: "27"; rubric: The answer does not state that compensation below 31 zł is not paid out for Kolej Nadwiślańska. |
| `xl-en2pl-bike-fare` | en → pl | cross-lingual | FAIL | must not contain: "3.40"; rubric: The answer includes the EUR 3.40 figure, which the rubric explicitly states should not be included. |
