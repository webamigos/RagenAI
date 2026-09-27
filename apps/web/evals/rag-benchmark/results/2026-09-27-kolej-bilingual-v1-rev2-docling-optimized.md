# RAG benchmark — kolej-bilingual-v1 v2

Run on **2026-09-27** against commit `ab3f91ead`.

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
| ingest shape | docling-optimized |
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
| numeric | 6/6 (100%) | — |
| comparative | 2/2 (100%) | — |
| multi-hop | 1/2 (50%) | — |
| guard-hallucination | 2/2 (100%) | — |
| guard-sycophancy | 2/2 (100%) | — |
| cross-lingual | 8/8 (100%) | — |

## By document

Each question counts toward every document that holds its answer, including
questions that cited nothing; a guard question whose answer is in no document
is not counted. The RAG score is the one ingest wrote when this run uploaded it.

| document | RAG score | Ragen (RAG) | control (no retrieval) |
|---|---|---|---|
| `docs/pl-01-regulamin-zwrotow.md` | 86 | 6/6 (100%) | — |
| `docs/pl-02-regulamin-bagazu.md` | 87 | 2/2 (100%) | — |
| `docs/pl-03-polityka-opoznien.md` | 87 | 2/2 (100%) | — |
| `docs/pl-04-protokol-zarzadu.md` | 70 | 2/2 (100%) | — |
| `docs/en-01-refund-policy.md` | 92 | 6/6 (100%) | — |
| `docs/en-02-baggage-policy.md` | 88 | 2/2 (100%) | — |
| `docs/en-03-delay-compensation.md` | 81 | 2/2 (100%) | — |
| `docs/en-04-board-minutes.md` | 55 | 1/2 (50%) | — |

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
| `en-mono-multihop-cockatrice` | en → en | multi-hop | FAIL | missing: "31 October 2026" |
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
