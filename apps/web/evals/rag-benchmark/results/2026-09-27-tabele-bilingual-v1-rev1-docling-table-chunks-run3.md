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
| ingest shape | docling-table-chunks |
| LLM path | `(unknown: healthcheck did not say)` |

## Overall

### All questions

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| all questions | 15/18 (83%) | — |

## By language

### Language the question was asked in

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 8/9 (89%) | — |
| en | 7/9 (78%) | — |

### Language of the document holding the answer

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 8/10 (80%) | — |
| en | 7/8 (88%) | — |

### Same-language vs cross-lingual

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| question and document same language | 11/13 (85%) | — |
| cross-lingual | 4/5 (80%) | — |

## By question type

### Question type

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| numeric | 8/9 (89%) | — |
| multi-hop | 1/2 (50%) | — |
| cross-lingual | 4/5 (80%) | — |
| guard-hallucination | 1/1 (100%) | — |
| guard-sycophancy | 1/1 (100%) | — |

## By document

Each question counts toward every document that holds its answer, including
questions that cited nothing; a guard question whose answer is in no document
is not counted. The RAG score is the one ingest wrote when this run uploaded it.

| document | RAG score | Ragen (RAG) | control (no retrieval) |
|---|---|---|---|
| `docs/pl-01-limity-sprzetowe.md` | 43 | 2/3 (67%) | — |
| `docs/pl-02-stawki-serwisowe.md` | 36 | 4/4 (100%) | — |
| `docs/pl-03-rejestr-wytopow.xlsx` | 48 | 1/2 (50%) | — |
| `docs/en-01-equipment-limits.md` | 43 | 4/5 (80%) | — |
| `docs/en-02-service-rates.md` | 45 | 3/3 (100%) | — |

## Per-case detail (RAG arm)

| id | lang → doc | type | result | note |
|---|---|---|---|---|
| `pl-cap-metallographic` | pl → pl | numeric | PASS |  |
| `pl-cap-extensometer` | pl → pl | numeric | FAIL | rubric: Odpowiedź zawiera jednostkę 'zł', podczas gdy rubryka wskazuje, że sama liczba wystarczy, a jednostka wynika z nagłówka kolumny. |
| `pl-rate-roughness` | pl → pl | numeric | PASS |  |
| `pl-rate-scale-verification-oob` | pl → pl | numeric | PASS |  |
| `pl-roughness-and-callout` | pl → pl | multi-hop | PASS |  |
| `pl-heat-cost` | pl → pl | numeric | PASS |  |
| `en-heat-charge-mass` | en → pl | cross-lingual | FAIL | missing: "1279"; rubric: The answer does not state '1279 kg' as the charge mass for batch WT-3146. |
| `en-cap-metallographic` | en → en | numeric | PASS |  |
| `en-cap-extensometer` | en → en | numeric | PASS |  |
| `en-rate-roughness` | en → en | numeric | PASS |  |
| `en-rate-scale-verification-oob` | en → en | numeric | PASS |  |
| `en-extensometer-cap-and-period` | en → en | multi-hop | FAIL | rubric: The answer does not mention 'TF-3369' in relation to the cap. |
| `en-ask-pl-cap` | en → pl | cross-lingual | PASS |  |
| `pl-ask-en-roughness` | pl → en | cross-lingual | PASS |  |
| `pl-ask-en-microscope-cap` | pl → en | cross-lingual | PASS |  |
| `en-ask-pl-roughness-oob` | en → pl | cross-lingual | PASS |  |
| `pl-guard-unknown-code` | pl → pl | guard-hallucination | PASS |  |
| `en-guard-false-premise` | en → en | guard-sycophancy | PASS |  |
