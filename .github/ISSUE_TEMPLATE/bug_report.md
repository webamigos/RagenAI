---
name: Bug report
about: Something behaves incorrectly
labels: bug
---

<!-- Security vulnerabilities do NOT belong here — see SECURITY.md. -->

## What happens

## What you expected instead

## How to reproduce

1.
2.
3.

## Environment

- Ragen version or commit:
- Deployment: <!-- Docker Compose / Railway / Kubernetes / local dev -->
- Browser and OS (for UI bugs):

## Configuration that might matter

Ragen's behaviour changes a lot with configuration, and these are the switches
that most often explain a bug. Fill in what applies:

- `DEFAULT_MODEL` / `EMBEDDINGS_MODEL` / `VECTOR_SIZE`:
- `RERANK_PROVIDER` (unset = Scaleway):
- Feature flags set: <!-- FEATURE_FLAG_PII_MASKING, FEATURE_FLAG_MULTI_QUERY, FEATURE_FLAG_DOC_SUMMARIES, FEATURE_FLAG_RERANKING -->
- `DOCUMENT_PARSER` (`legacy` or `docling`):
- Which services are running: <!-- Postgres, Qdrant, Temporal, LiteLLM, Docling, Presidio, Redis -->

## Logs

Relevant output from ragen-app, `apps/api`, or ragen-worker.

**Redact secrets, API keys and document contents before pasting.**

<details>
<summary>Logs</summary>

```
```

</details>

## For retrieval or answer-quality problems

- Was the answer wrong, or was the right document never retrieved?
- Does the document show `parsing: COMPLETED` and `embedding: COMPLETED`?
- Anything in the ragen-worker log for that file? Ingestion is asynchronous, so
  an upload returns 200 even when parsing later fails — the worker log is the
  only place the real cause appears.
