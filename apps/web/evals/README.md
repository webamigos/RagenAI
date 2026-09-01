# Evals

Two different things live under `evals/`, and it matters which one you reach for.

## 1. promptfoo suites — answer quality over a *fixed* context

`configs/*.yaml` + `datasets/*.yaml`, run through promptfoo.

The providers import **real production code** — `basicRagChain`, `rephraseAndExpand`, `ChatCompletionFactory` — so a regression in a prompt template or in chain wiring will show up here. That's the value.

What they do **not** test is retrieval. `fixtures/mock-vector-store.ts` is an in-memory store that scores 8 documents by term overlap; it exists so the suites can run without Qdrant. Treat every result as "given roughly the right paragraph, did the model answer well?" — never as evidence that retrieval works.

For real retrieval — a PDF ingested through Temporal and answered from Qdrant — use [`e2e-rag/`](./e2e-rag/README.md) instead.

| Suite | Cases | What it's for |
|---|---|---|
| `ci-gate` | 5 | Fast subset, gates PRs at 80% |
| `rag-quality` | 10 | Answer quality across the FAQ fixture |
| `red-team` | 10 | Prompt injection, PII, persona attacks — **the suite least affected by the fake vector store**, since its assertions don't depend on retrieval being good |
| `rephrase-quality` | 5 | Standalone-question rewriting |
| `model-comparison` | 6 | Same questions across models |

## Running

Only a LiteLLM proxy is needed — the chain **and** the grader both go through it, so no separate provider key:

```bash
export LITELLM_PROXY_URL=http://localhost:4000
export LITELLM_MASTER_KEY=...          # from .env.local
npm run eval                            # root promptfooconfig.yaml (rag-quality)
npm run eval:ci                         # the CI gate subset

npx promptfoo eval -c evals/configs/red-team.yaml --no-cache
```

### Models

Every `model:` in a config must be a `model_name` from `infra/litellm/config.yaml`. A name that isn't provisioned doesn't degrade — it errors every row. Check what's live before changing one:

```bash
curl -s localhost:4000/v1/models -H "Authorization: Bearer $LITELLM_MASTER_KEY"
```

The default (`DEFAULT_EVAL_MODEL` in `providers/shared.ts`) is `gemini-2.5-flash`: fast and cheap, which matters because the gate runs on every PR touching `src/libs/chains/**`.

### Two gotchas

- `file://` paths in configs resolve **relative to the config file**, but `outputPath` resolves **relative to the working directory**. A config saying `../results/x.json` writes outside the repo.
- Custom providers receive the whole `ProviderOptions` object (`{ id, label, config }`), not the bare `config`. Reading `config` off the top level silently drops every configured value.

## 2. `e2e-rag/` — the real pipeline

A live-stack smoke test: upload a PDF, wait for it to be indexed, ask questions whose answers exist only in that document. Needs the full stack and a real LLM, so it isn't a CI test. See [`e2e-rag/README.md`](./e2e-rag/README.md).

## CI

`.github/workflows/evals.yml` runs `npm run eval:ci` on PRs touching `src/libs/chains/**` or `evals/**`, and fails the PR below the 80% threshold. It skips (rather than fails) when `LITELLM_PROXY_URL` / `LITELLM_MASTER_KEY` aren't available, e.g. on forks.
