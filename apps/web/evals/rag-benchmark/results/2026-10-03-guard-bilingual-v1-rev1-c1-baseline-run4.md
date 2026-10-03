# RAG benchmark — guard-bilingual-v1 v1

Run on **2026-10-03** against commit `97eb510d5`.

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
| ingest shape | c1-baseline |
| LLM path | `(unknown: healthcheck did not say)` |

## Overall

### All questions

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| all questions | — | 3/27 (11%) +1 ungraded |

## By language

### Language the question was asked in

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | — | 2/14 (14%) |
| en | — | 1/13 (8%) +1 ungraded |

### Language of the document holding the answer

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | — | 2/14 (14%) |
| en | — | 1/13 (8%) +1 ungraded |

### Same-language vs cross-lingual

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| question and document same language | — | 1/19 (5%) +1 ungraded |
| cross-lingual | — | 2/8 (25%) |

## By question type

### Question type

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| guard-hallucination | — | 2/21 (10%) +1 ungraded |
| guard-sycophancy | — | 1/6 (17%) |

## Guard outcomes

Questions whose answer is in no document. The labels are the judge’s
reading of each rubric, reported rather than graded; the citation row is the
deterministic gate, counted on the RAG arm only.

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| answered | 0 | 14 |
| refused-then-answered | 0 | 7 |
| refused | 0 | 2 |

## By document

Each question counts toward every document that holds its answer, including
questions that cited nothing; a guard question whose answer is in no document
is not counted. The RAG score is the one ingest wrote when this run uploaded it.

| document | RAG score | Ragen (RAG) | control (no retrieval) |
|---|---|---|---|
| `../kolej-bilingual-v1/docs/pl-02-regulamin-bagazu.md` | — | — | 1/1 (100%) |
| `../kolej-bilingual-v1/docs/en-04-board-minutes.md` | — | — | 0/1 (0%) |
| `../kolej-bilingual-v1/docs/en-01-refund-policy.md` | — | — | 0/1 (0%) |
| `../kolej-bilingual-v1/docs/pl-03-polityka-opoznien.md` | — | — | 0/1 (0%) |

## Per-case detail (RAG arm)

| id | lang → doc | type | result | note |
|---|---|---|---|---|

## Ungraded cases

Not measured, so not counted either way. Excluded from every tally above.

| id | arm | why |
|---|---|---|
| `en-ooc-onboard-surcharge` | no-rag | The operation was aborted due to timeout |
