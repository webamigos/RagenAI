---
title: 'A preflight that enumerates environment variables cannot see a model id hard-coded in source, so three models had no route while the check reported a clean deployment'
modules: ['worker', 'ci']
areas: ['architecture', 'observability']
topics: ['llm-gateway', 'model-routing', 'preflight', 'defaults', 'silent-failure', 'false-green']
---

# A preflight that reads the environment cannot see a hard-coded model

**Context**: B6 removed the LiteLLM proxy, so every model id now resolves
against `infra/llm-gateway/routes.yaml` and nothing else. `npm run
gateway:preflight -- --probe` exists precisely to answer "can this deployment
serve what it is configured to use", and it makes one real call per model.

Three of the worker's model ids had no route: `claude-haiku-4-5` (`PDF_MODEL`'s
default), `gpt-5.4-mini` and `gpt-5.4-nano`.

**Problem**: the preflight builds its list by reading environment variables —
`DEFAULT_MODEL`, `REPHRASE_MODEL`, `SUMMARY_MODEL`, `EMBEDDINGS_MODEL`,
`MULTIMODAL_FALLBACK_MODEL`, `PDF_MODEL`. Two of the three ids are not named by
any variable at all:

```ts
// apps/worker/src/services/chains/pdf-process-rag/config.ts
mini: 'gpt-5.4-mini',
nano: 'gpt-5.4-nano',
// apps/worker/src/services/document-loaders/parse-srt-to-segments.ts
const modelId = 'gpt-5.4-nano';
```

A constant has no variable to read, so the check that exists to find exactly
this could not see them. They are also absent from `MODEL_REGISTRY`, because
that is the catalogue a *user* picks from and these are internal tiers — so the
one other list that could have named them does not either.

`PDF_MODEL` is the instructive case, because the preflight *did* know about it
and said so in a comment: "its default is served by neither path today, which
is exactly the sort of thing this script exists to say out loud". The script was
right, nobody ran it against this, and the gap outlived the proxy that had been
covering it.

Nothing failed loudly. All three sit on paths that run rarely — a PDF the
primary parser could not handle, an SRT upload — so the first symptom would
have been a document marked FAILED weeks later, with an "unknown model" buried
in a worker log.

**Rule**: a model id is a dependency wherever it is written, and a check that
enumerates one source of them is only as complete as that source. When adding a
model id to source rather than to an environment variable, add it to
`configuredModels()` in `scripts/gateway-preflight.mts` under a label naming
where the constant lives — there is no variable to key on, which is the whole
point. The general form: **`AGENTS.md`'s "a limit that is computed is not a
limit — a limit is a call site" applies to route tables too.** A route table is
proved by what calls it, not by what it contains.

**Applies to**: every model id in this repository, and to the same shape
wherever a checker enumerates configuration to decide what a deployment needs —
the enumeration is a claim about completeness that nothing verifies.
