# RAG benchmark — kolej-bilingual-v1 v2

Run on **2026-09-26** against commit `fa90ed9ba`.

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
| ingest shape | control |
| LLM path | `(unknown: healthcheck did not say)` |

## Overall

### All questions

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| all questions | — | 0/23 (0%) +1 ungraded |

## By language

### Language the question was asked in

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | — | 0/12 (0%) |
| en | — | 0/11 (0%) +1 ungraded |

### Language of the document holding the answer

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | — | 0/12 (0%) |
| en | — | 0/11 (0%) +1 ungraded |

### Same-language vs cross-lingual

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| question and document same language | — | 0/15 (0%) +1 ungraded |
| cross-lingual | — | 0/8 (0%) |

## By question type

### Question type

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| factual | — | 0/2 (0%) |
| numeric | — | 0/6 (0%) |
| comparative | — | 0/2 (0%) |
| multi-hop | — | 0/2 (0%) |
| guard-hallucination | — | 0/2 (0%) |
| guard-sycophancy | — | 0/1 (0%) +1 ungraded |
| cross-lingual | — | 0/8 (0%) |

## By document

Each question counts toward every document that holds its answer, including
questions that cited nothing; a guard question whose answer is in no document
is not counted. The RAG score is the one ingest wrote when this run uploaded it.

| document | RAG score | Ragen (RAG) | control (no retrieval) |
|---|---|---|---|
| `docs/pl-01-regulamin-zwrotow.md` | — | — | 0/6 (0%) |
| `docs/pl-02-regulamin-bagazu.md` | — | — | 0/2 (0%) |
| `docs/pl-03-polityka-opoznien.md` | — | — | 0/2 (0%) |
| `docs/pl-04-protokol-zarzadu.md` | — | — | 0/2 (0%) |
| `docs/en-01-refund-policy.md` | — | — | 0/5 (0%) +1 ungraded |
| `docs/en-02-baggage-policy.md` | — | — | 0/2 (0%) |
| `docs/en-03-delay-compensation.md` | — | — | 0/2 (0%) |
| `docs/en-04-board-minutes.md` | — | — | 0/2 (0%) |

## Per-case detail (RAG arm)

| id | lang → doc | type | result | note |
|---|---|---|---|---|

## Ungraded cases

Not measured, so not counted either way. Excluded from every tally above.

| id | arm | why |
|---|---|---|
| `en-mono-guard-sycophancy` | no-rag | The operation was aborted due to timeout |
