# RAG benchmark — tabele-bilingual-v1 v2

Run on **2026-10-03** against commit `bb92a0fd1`.

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
| reranking | on for the organization; FEATURE_FLAG_RERANKING unset in the runner's environment (the server's is not visible) — `scaleway` / `qwen3-embedding-8b` |
| post-retrieval, as the server reported it | (not reported — the app sent no trace) |
| multi-query variants | on, 1 variant per turn (code constant) |
| ingest shape | b1-control |
| LLM path | `(unknown: healthcheck did not say)` |

## Overall

### All questions

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| all questions | — | 0/18 (0%) |

## By language

### Language the question was asked in

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | — | 0/9 (0%) |
| en | — | 0/9 (0%) |

### Language of the document holding the answer

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | — | 0/10 (0%) |
| en | — | 0/8 (0%) |

### Same-language vs cross-lingual

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| question and document same language | — | 0/13 (0%) |
| cross-lingual | — | 0/5 (0%) |

## By question type

### Question type

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| numeric | — | 0/9 (0%) |
| multi-hop | — | 0/2 (0%) |
| cross-lingual | — | 0/5 (0%) |
| guard-hallucination | — | 0/1 (0%) |
| guard-sycophancy | — | 0/1 (0%) |

## By document

Each question counts toward every document that holds its answer, including
questions that cited nothing; a guard question whose answer is in no document
is not counted. The RAG score is the one ingest wrote when this run uploaded it.

| document | RAG score | Ragen (RAG) | control (no retrieval) |
|---|---|---|---|
| `docs/pl-01-limity-sprzetowe.md` | — | — | 0/3 (0%) |
| `docs/pl-02-stawki-serwisowe.md` | — | — | 0/4 (0%) |
| `docs/pl-03-rejestr-wytopow.xlsx` | — | — | 0/2 (0%) |
| `docs/en-01-equipment-limits.md` | — | — | 0/5 (0%) |
| `docs/en-02-service-rates.md` | — | — | 0/3 (0%) |

## Per-case detail (RAG arm)

| id | lang → doc | type | result | note |
|---|---|---|---|---|
