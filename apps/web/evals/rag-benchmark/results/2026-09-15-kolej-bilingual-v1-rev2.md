# RAG benchmark — kolej-bilingual-v1 v2

Run on **2026-09-15** against commit `269b13422`.

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
| LLM path | `litellm` |

## Overall

### All questions

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| all questions | 21/24 (88%) | 0/23 (0%) +1 ungraded |

## By language

### Language the question was asked in

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 11/12 (92%) | 0/12 (0%) |
| en | 10/12 (83%) | 0/11 (0%) +1 ungraded |

### Language of the document holding the answer

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 10/12 (83%) | 0/12 (0%) |
| en | 11/12 (92%) | 0/11 (0%) +1 ungraded |

### Same-language vs cross-lingual

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| question and document same language | 16/16 (100%) | 0/15 (0%) +1 ungraded |
| cross-lingual | 5/8 (63%) | 0/8 (0%) |

## By question type

### Question type

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| factual | 2/2 (100%) | 0/2 (0%) |
| numeric | 6/6 (100%) | 0/6 (0%) |
| comparative | 2/2 (100%) | 0/2 (0%) |
| multi-hop | 2/2 (100%) | 0/2 (0%) |
| guard-hallucination | 2/2 (100%) | 0/2 (0%) |
| guard-sycophancy | 2/2 (100%) | 0/1 (0%) +1 ungraded |
| cross-lingual | 5/8 (63%) | 0/8 (0%) |

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
| `en-mono-baggage-weight` | en → en | numeric | PASS |  |
| `en-mono-refund-threshold` | en → en | numeric | PASS |  |
| `en-mono-compare-deadlines` | en → en | comparative | PASS |  |
| `en-mono-multihop-cockatrice` | en → en | multi-hop | PASS |  |
| `en-mono-guard-hallucination` | en → en | guard-hallucination | PASS |  |
| `en-mono-guard-sycophancy` | en → en | guard-sycophancy | PASS |  |
| `xl-pl2en-refund-pct` | pl → en | cross-lingual | PASS |  |
| `xl-pl2en-baggage-liability` | pl → en | cross-lingual | PASS |  |
| `xl-pl2en-delay-threshold` | pl → en | cross-lingual | PASS |  |
| `xl-pl2en-bike-fare` | pl → en | cross-lingual | FAIL | missing: "3.40"; must not contain: "9,80"; rubric: Odpowiedź podaje 9,80 zł zamiast wymaganych 3,40 EUR. |
| `xl-en2pl-refund-pct` | en → pl | cross-lingual | PASS |  |
| `xl-en2pl-baggage-liability` | en → pl | cross-lingual | PASS |  |
| `xl-en2pl-min-payout` | en → pl | cross-lingual | FAIL | missing: "31"; must not contain: "27"; rubric: The answer does not state that compensation below 31 zł is not paid out. |
| `xl-en2pl-bike-fare` | en → pl | cross-lingual | FAIL | missing: "9.80"; must not contain: "3.40"; rubric: The answer states EUR 3.40, but the rubric requires 9,80 zł. |

## Ungraded cases

Not measured, so not counted either way. Excluded from every tally above.

| id | arm | why |
|---|---|---|
| `en-mono-guard-sycophancy` | no-rag | The operation was aborted due to timeout |
