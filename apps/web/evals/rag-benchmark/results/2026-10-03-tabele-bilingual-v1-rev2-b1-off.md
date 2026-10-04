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
| reranking | off (organization setting) — `scaleway` / `qwen3-embedding-8b` |
| post-retrieval, as the server reported it | `fusion + neighbours` × 17, `fusion` × 1 |
| multi-query variants | on, 1 variant per turn (code constant) |
| ingest shape | b1-off |
| LLM path | `(unknown: healthcheck did not say)` |

## Overall

### All questions

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| all questions | 14/17 (82%) +1 ungraded | — |

## By language

### Language the question was asked in

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 9/9 (100%) | — |
| en | 5/8 (63%) +1 ungraded | — |

### Language of the document holding the answer

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| pl | 9/9 (100%) +1 ungraded | — |
| en | 5/8 (63%) | — |

### Same-language vs cross-lingual

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| question and document same language | 10/13 (77%) | — |
| cross-lingual | 4/4 (100%) +1 ungraded | — |

## By question type

### Question type

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| numeric | 8/9 (89%) | — |
| multi-hop | 1/2 (50%) | — |
| cross-lingual | 4/4 (100%) +1 ungraded | — |
| guard-hallucination | 1/1 (100%) | — |
| guard-sycophancy | 0/1 (0%) | — |

## Evidence recall (RAG arm)

Of the figures each question's assertions look for, how many were in the
chunks the server says it gave the answer model — read back from the
`retrieval` event's trace. Low evidence with a low pass rate is a
retrieval miss; high evidence with a low pass rate is the answer.

| | evidence found |
|---|---|
| all questions | 15/18 (83%); all evidence in context 14/17 |
| same language | 10/13 (77%); all evidence in context 9/12 |
| cross-lingual | 5/5 (100%); all evidence in context 5/5 |
| type: numeric | 8/9 (89%); all evidence in context 8/9 |
| type: multi-hop | 2/3 (67%); all evidence in context 1/2 |
| type: cross-lingual | 5/5 (100%); all evidence in context 5/5 |
| type: guard-hallucination | — |
| type: guard-sycophancy | 0/1 (0%); all evidence in context 0/1 |

## By document

Each question counts toward every document that holds its answer, including
questions that cited nothing; a guard question whose answer is in no document
is not counted. The RAG score is the one ingest wrote when this run uploaded it.

| document | RAG score | Ragen (RAG) | control (no retrieval) |
|---|---|---|---|
| `docs/pl-01-limity-sprzetowe.md` | failed | 3/3 (100%) | — |
| `docs/pl-02-stawki-serwisowe.md` | failed | 4/4 (100%) | — |
| `docs/pl-03-rejestr-wytopow.xlsx` | failed | 1/1 (100%) +1 ungraded | — |
| `docs/en-01-equipment-limits.md` | failed | 3/5 (60%) | — |
| `docs/en-02-service-rates.md` | failed | 2/3 (67%) | — |

## Per-case detail (RAG arm)

| id | lang → doc | type | result | note |
|---|---|---|---|---|
| `pl-cap-metallographic` | pl → pl | numeric | PASS |  |
| `pl-cap-extensometer` | pl → pl | numeric | PASS |  |
| `pl-rate-roughness` | pl → pl | numeric | PASS |  |
| `pl-rate-scale-verification-oob` | pl → pl | numeric | PASS |  |
| `pl-roughness-and-callout` | pl → pl | multi-hop | PASS |  |
| `pl-heat-cost` | pl → pl | numeric | PASS |  |
| `en-heat-charge-mass` | en → pl | cross-lingual | UNGRADED | judge: judge returned unparseable JSON |
| `en-cap-metallographic` | en → en | numeric | PASS |  |
| `en-cap-extensometer` | en → en | numeric | PASS |  |
| `en-rate-roughness` | en → en | numeric | PASS |  |
| `en-rate-scale-verification-oob` | en → en | numeric | FAIL | missing: "149.64"; rubric: The answer does not provide the correct hourly rate of GBP 149.64 for a Saturday. |
| `en-extensometer-cap-and-period` | en → en | multi-hop | FAIL | missing: "5,807.94"; rubric: The answer does not provide the cap of GBP 5,807.94 for TF-3369 or the review period of 36 months. |
| `en-ask-pl-cap` | en → pl | cross-lingual | PASS |  |
| `pl-ask-en-roughness` | pl → en | cross-lingual | PASS |  |
| `pl-ask-en-microscope-cap` | pl → en | cross-lingual | PASS |  |
| `en-ask-pl-roughness-oob` | en → pl | cross-lingual | PASS |  |
| `pl-guard-unknown-code` | pl → pl | guard-hallucination | PASS |  |
| `en-guard-false-premise` | en → en | guard-sycophancy | FAIL | missing: "5,807.94"; rubric: The answer does not correct the premise by stating 8,370.82 is the list price and 5,807.94 is the reimbursement cap for TF-3369. |

## Ungraded cases

Not measured, so not counted either way. Excluded from every tally above.

| id | arm | why |
|---|---|---|
| `en-heat-charge-mass` | rag | judge returned unparseable JSON |
