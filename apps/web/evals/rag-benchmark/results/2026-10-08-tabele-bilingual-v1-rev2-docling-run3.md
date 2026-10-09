# RAG benchmark — tabele-bilingual-v1 v2

Run on **2026-10-08** against commit `8ea12ae5d`.

Every figure in this corpus was invented for it and exists nowhere else, so a
correct answer to a question that needs one of those figures is evidence that
retrieval worked rather than that the model remembered. A guard question, whose
right answer is that the documents do not say, can be passed without
retrieval. The control column is the same model answering the same question
with no documents attached — the floor the pipeline has to beat.

## Stack under test

| | |
|---|---|
| chat model | `gemini-3-flash-preview` |
| judge model | `gemini-2.5-flash` |
| rephrase model | `mistral-small-3.2` |
| embeddings | `bge-multilingual-gemma2` (3584-dim) |
| reranking | on for the organization; FEATURE_FLAG_RERANKING=1 in the runner's environment (the server's is not visible) — `scaleway` / `qwen3-embedding-8b` |
| post-retrieval, as the server reported it | `reranker:scaleway + neighbours` × 18 |
| multi-query variants | on, 1 variant per turn (code constant) |
| ingest shape | docling |
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
| pl | 10/10 (100%) | — |
| en | 5/8 (63%) | — |

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

## Evidence recall (RAG arm)

Of the figures each question's assertions look for, how many were in the
chunks the server says it gave the answer model — read back from the
`retrieval` event's trace. Low evidence with a low pass rate is a
retrieval miss; high evidence with a low pass rate is the answer.

| | evidence found |
|---|---|
| all questions | 15/18 (83%); all evidence in context 14/17 |
| same language | 11/13 (85%); all evidence in context 10/12 |
| cross-lingual | 4/5 (80%); all evidence in context 4/5 |
| type: numeric | 8/9 (89%); all evidence in context 8/9 |
| type: multi-hop | 2/3 (67%); all evidence in context 1/2 |
| type: cross-lingual | 4/5 (80%); all evidence in context 4/5 |
| type: guard-hallucination | — |
| type: guard-sycophancy | 1/1 (100%); all evidence in context 1/1 |

## Guard outcomes

Questions whose answer is in no document. The labels are the judge’s
reading of each rubric, reported rather than graded. The citation row counts
RAG answers carrying a citation; it is not a grading gate. A citation on the
statement of absence fails the rubric, a citation on a documented fact does not.

| | Ragen (RAG) | control (no retrieval) |
|---|---|---|
| cited a document (reported, not graded) | 0 | 0 |

## By document

Each question counts toward every document that holds its answer, including
questions that cited nothing; a guard question whose answer is in no document
is not counted. The RAG score is the one ingest wrote when this run uploaded it.

| document | RAG score | Ragen (RAG) | control (no retrieval) |
|---|---|---|---|
| `docs/pl-01-limity-sprzetowe.md` | failed | 3/3 (100%) | — |
| `docs/pl-02-stawki-serwisowe.md` | failed | 4/4 (100%) | — |
| `docs/pl-03-rejestr-wytopow.xlsx` | failed | 2/2 (100%) | — |
| `docs/en-01-equipment-limits.md` | failed | 4/5 (80%) | — |
| `docs/en-02-service-rates.md` | failed | 1/3 (33%) | — |

## Per-case detail (RAG arm)

| id | lang → doc | type | result | note |
|---|---|---|---|---|
| `pl-cap-metallographic` | pl → pl | numeric | PASS |  |
| `pl-cap-extensometer` | pl → pl | numeric | PASS |  |
| `pl-rate-roughness` | pl → pl | numeric | PASS |  |
| `pl-rate-scale-verification-oob` | pl → pl | numeric | PASS |  |
| `pl-roughness-and-callout` | pl → pl | multi-hop | PASS |  |
| `pl-heat-cost` | pl → pl | numeric | PASS |  |
| `en-heat-charge-mass` | en → pl | cross-lingual | PASS |  |
| `en-cap-metallographic` | en → en | numeric | PASS |  |
| `en-cap-extensometer` | en → en | numeric | PASS |  |
| `en-rate-roughness` | en → en | numeric | PASS |  |
| `en-rate-scale-verification-oob` | en → en | numeric | FAIL | missing: "149.64"; rubric: The answer states it does not know the rate and that the specific service is not listed, which contradicts the rubric's expected answ |
| `en-extensometer-cap-and-period` | en → en | multi-hop | FAIL | missing: "5,807.94"; rubric: The answer does not provide the cap of GBP 5,807.94 for TF-3369 or the review period of 36 months. |
| `en-ask-pl-cap` | en → pl | cross-lingual | PASS |  |
| `pl-ask-en-roughness` | pl → en | cross-lingual | FAIL | missing: "58.39"; rubric: Odpowiedź nie podaje wymaganej stawki 58,39 GBP za godzinę dla SV-421. |
| `pl-ask-en-microscope-cap` | pl → en | cross-lingual | PASS |  |
| `en-ask-pl-roughness-oob` | en → pl | cross-lingual | PASS |  |
| `pl-guard-unknown-code` | pl → pl | guard-hallucination | PASS |  |
| `en-guard-false-premise` | en → en | guard-sycophancy | PASS |  |
