# End-to-end RAG smoke test

Drives the **real** ingestion and retrieval path against a running stack:

```
POST /api/upload → storage → Temporal → ragen-worker → Docling
  → chunking → embeddings → Qdrant → RAG chat
```

## Why this exists alongside `evals/configs/rag-quality.yaml`

The promptfoo evals use `evals/fixtures/mock-vector-store.ts` — an in-memory
store with keyword scoring — so they measure *answer quality given context* and
never exercise embeddings, Qdrant, or ingestion. Nothing else in the repo tests
that a document can actually be uploaded and then found: `e2e/smoke-10-knowledge-upload.spec.ts`
stubs `/api/upload` outright, and `e2e/mock-llm-server.ts` doesn't implement
`/v1/embeddings` at all.

This fills that gap. It is **not** a CI test — it needs the full stack and a
real LLM, so it costs money and takes minutes. Run it on demand, e.g. before a
release or after touching the ingestion pipeline.

## The fixture

`fixtures/regulamin-wilczy-mlyn.pdf` is an invented internal policy for a
company that does not exist. Every fact in it — the 2 847 zł monitor limit, the
11-working-day deadline, the "Bazyliszek" project — was made up for this test.
That is the point: a model cannot answer these from training data, so a correct
answer proves retrieval worked. `fixtures/*.source.txt` is the plain-text
original the PDF was generated from.

`cases.json` holds the questions and their assertions, including two guards
that matter more than the happy path:

- a **hallucination guard** — asks about something the document doesn't cover,
  and fails if the model invents a figure or borrows one from another section;
- a **sycophancy guard** — asserts a false premise ("the chair limit is 2500 zł")
  and fails unless the answer corrects it from the document.

There is also a privacy assertion: Presidio masks the approver's name during
ingestion, so that name must never appear in an answer.

## Prerequisites

Services (from `docker-compose.yml`):

```bash
docker compose up -d postgres qdrant redis temporal litellm-postgres litellm \
  presidio-analyzer presidio-anonymizer docling
```

`docling` is required for PDFs and is easy to forget. Without it the worker
fails `loadDocling` with `ECONNREFUSED`, burns its three retries, and the file
ends up `parsing: FAILED`. The upload itself still returns 200 — ingestion is
asynchronous by design — so the only place the actual cause appears is the
worker log. Check there first when this script times out waiting to index.

Then apps/web and apps/worker, both pointed at the same database and storage
directory:

```bash
# apps/web
DATABASE_URL=postgresql://postgres:pass123@localhost:5432/ragen_e2e \
STORAGE_PROVIDER=local STORAGE_LOCAL_PATH=/tmp/ragen-eval-storage \
LITELLM_PROXY_URL=http://localhost:4000 npm run dev

# ragen-worker (in the ragen-worker repo)
DATABASE_URL=postgresql://postgres:pass123@localhost:5432/ragen_e2e \
STORAGE_PROVIDER=local STORAGE_LOCAL_PATH=/tmp/ragen-eval-storage \
PDF_MODEL=gemini-3-flash-preview npm run dev
```

Use a scratch database (the seeded `ragen_e2e` works well) rather than your dev
one — the script creates and then deletes a file record.

`PDF_MODEL` must be a model that LiteLLM can actually reach. Check
`infra/litellm/config.yaml` and verify with `curl localhost:4000/v1/models`.

## Running

```bash
DATABASE_URL=postgresql://postgres:pass123@localhost:5432/ragen_e2e \
  npm run eval:e2e-rag
```

Overrides: `RAG_EVAL_APP_URL`, `RAG_EVAL_EMAIL`, `RAG_EVAL_PASSWORD`,
`RAG_EVAL_PROJECT_ID`, `RAG_EVAL_THREAD_ID`, `RAG_EVAL_TIMEOUT_MS`. The
defaults match the e2e seed (`e2e/constants.ts`).

Exit code is 0 only if every case passes. The uploaded file record is deleted
afterwards; the Qdrant points for the test org are not, so drop the collection
if you want a clean slate:

```bash
curl -X DELETE localhost:6333/collections/e2e-test-org-00000-0000-0001
```

Two side effects worth knowing about, both found while auditing the UI after a
run:

- **The run empties the seeded thread.** Clearing its history is what makes the
  privacy assertion trustworthy, but the sidebar's query requires
  `messages: { some: {} }` — so afterwards the seeded thread disappears from
  "Ostatnie" and `p0-20-chat-threads.spec.ts` ("thread appears in sidebar")
  would fail if you run Playwright against the same database. CI is unaffected
  (each job seeds fresh); locally, re-seed before running the Playwright suite.
- **Dropping the Qdrant collection while the worker is running breaks it.**
  `qdrant-client.ts` caches verified collections per process, so it skips
  re-creating the one you just deleted and the next ingest fails with
  `Collection … doesn't exist`. Restart the worker after dropping.

## Known issue this suite deliberately does not assert

Asking who approves requests currently returns the literal `<PERSON>`
placeholder to the user, because masking happens at ingestion and there is no
alias map to restore from at query time. The suite asserts only that the real
name never leaks, so fixing the placeholder later won't break it.
