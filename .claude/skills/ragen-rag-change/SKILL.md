---
name: ragen-rag-change
description: Change anything in the retrieval pipeline — chunking, embeddings, hybrid search, reranking, multi-query, prompts — and measure the effect instead of guessing. Use before touching src/libs/chains, the worker's ingest, or the vector store. Triggers on "improve retrieval", "chunking", "reranker", "embeddings", "popraw jakość odpowiedzi", "RAG nie znajduje".
---

# Changing the retrieval pipeline

Four composed stages, all on by default: hybrid search (ADR-14), multi-query
expansion (ADR-15), summaries at ingest (ADR-16), reranking (ADR-12). Each was
added because it helped, and each interacts with the others — which is why
"this prompt looks better" is not evidence here.

[ADR-20](../../../docs/adrs/20-pause-and-measure-rag-quality.md) is the
standing decision: measure before shipping another retrieval change. Nothing
enforces it, so this is the procedure.

## 1. Say what you expect to change, before changing it

Write down the query shape you think is failing and why. "Answers are vague" is
not actionable; "queries naming a section heading return the summary chunk
instead of the section" is. If you cannot name the failing shape, the first job
is finding it — see step 2 — not editing the pipeline.

## 2. Get a baseline

```bash
cd apps/web
npm run eval:rag          # retrieval quality
npm run eval:rephrase     # standalone-question rewriting
npm run eval:e2e-rag      # full pipeline against fixtures
npm run eval:view         # promptfoo UI for the results
```

Datasets and configs live in `apps/web/evals/`. **Record the baseline numbers
before your change.** A single after-the-fact run tells you nothing: these are
LLM-scored and move between runs.

For production behaviour rather than fixtures, ADR-20 lists the Langfuse tags
to filter on, plus Qdrant collection health and the user-feedback signals.

## 3. Know which stage you are actually touching

| Symptom                                            | Stage                  | Where                                   |
| -------------------------------------------------- | ---------------------- | --------------------------------------- |
| the right document is never retrieved              | retrieval / embeddings | `src/libs/vector-store/`, worker ingest |
| retrieved but ranked low                           | reranker               | `src/libs/reranker/`                    |
| retrieved, ranked, but the answer ignores it       | answer prompt          | `src/libs/chains/basic-rag/`            |
| follow-up questions retrieve for the wrong subject | rephrase               | `REPHRASE_MODEL`, ADR-15                |
| whole-document questions fail                      | summaries              | ADR-16, worker                          |

Changing the wrong stage is the common failure. A citation problem is not fixed
by re-chunking.

## 4. Things in here that have bitten before

- **Only Qdrant is wired at the write end** (ADR-31). The Meilisearch and
  Supabase clients implement `VectorStoreClient` and return nothing, because
  ingest writes to Qdrant unconditionally. Selecting one is not a fallback, it
  is silence.
- **Ingest and query must embed identically.** The shared contract in
  `packages/rag-core/src/embedding-contract.ts` exists because they had drifted:
  one path truncated to `MAX_EMBEDDING_TEXT_CHARS` and the other did not, so the
  same document embedded differently depending on the backend. If you change
  batching, truncation or dimensions, change the contract — not one caller.
- **`VECTOR_SIZE` and the collection must agree.** A hardcoded dimension count
  that disagrees with the collection fails at upsert, or worse, silently
  degrades similarity.
- **Re-indexing a content change**: never `runFileEmbeddings` (it re-parses the
  stored original) and never overwrite the stored file. Use
  `Workflow.REINDEX_DOCUMENT_VERSION`, which embeds the version text and clears
  the previous chunks first.

## 5. Re-run, compare, and write the numbers down

Put the before and after in the PR. A retrieval change without numbers is a
change nobody can evaluate or revert with confidence — and the next person will
have to re-derive whether it helped.

If the numbers are flat, say so and consider not shipping it. That is the point
of ADR-20.

## 6. Model defaults are not yours to bump

`gemini-2.5-flash` for rephrase and multi-query, `gpt-5.4` for chat. AGENTS.md
says do not upgrade the rephrase model without explicit approval; it is load-
bearing for retrieval and cheap to break. Verify anything you rely on against
`infra/litellm/config.yaml` — docs have referenced models that are no longer
provisioned.
