# Evals

Two different things live under `evals/`, and it matters which one you reach for.

## 1. promptfoo suites — answer quality over a *fixed* context

`configs/*.yaml` + `datasets/*.yaml`, run through promptfoo.

The providers import **real production code** — `basicRagChain`, `rephraseAndExpand`, `ChatCompletionFactory` — so a regression in a prompt template or in chain wiring will show up here. That's the value.

What they do **not** test is retrieval. `fixtures/mock-vector-store.ts` is an in-memory store that scores 8 documents by term overlap; it exists so the suites can run without Qdrant. Treat every result as "given roughly the right paragraph, did the model answer well?" — never as evidence that retrieval works.

For real retrieval — a PDF ingested through Temporal and answered from Qdrant — use [`e2e-rag/`](./e2e-rag/README.md) instead.

| Suite | Cases | What it's for |
|---|---|---|
| `ci-gate` | 5 | Fast subset, 80% threshold — run it before merging a chain change (nothing enforces it; see [CI](#ci--there-is-none-deliberately)) |
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

The default (`DEFAULT_EVAL_MODEL` in `providers/shared.ts`) is `gemini-2.5-flash`: fast and cheap, which keeps the `ci-gate` subset worth re-running by hand on every chain change — roughly 15–20 short calls, well under a cent.

### Two gotchas

- `file://` paths in configs resolve **relative to the config file**, but `outputPath` resolves **relative to the working directory**. A config saying `../results/x.json` writes outside the repo.
- Custom providers receive the whole `ProviderOptions` object (`{ id, label, config }`), not the bare `config`. Reading `config` off the top level silently drops every configured value.

## 2. `e2e-rag/` — the real pipeline

A live-stack smoke test: upload a PDF, wait for it to be indexed, ask questions whose answers exist only in that document. Needs the full stack and a real LLM, so it isn't a CI test. See [`e2e-rag/README.md`](./e2e-rag/README.md).

## CI — there is none, deliberately

Nothing here runs in CI. `.github/workflows/evals.yml` used to claim it did, but
its `LITELLM_*` secrets never existed, so its only real step was skipped on every
PR while the job reported success. It was deleted rather than repaired:
GitHub-hosted runners cannot reach the LiteLLM proxy (it has no live public
deployment, and exposing one would put an LLM gateway holding the Azure, Bedrock
and Vertex credentials on the internet), and the repository has no required
status checks on its current plan, so the job could not have blocked a merge
either way. Full reasoning:
[`docs/lessons/a-secret-guarded-ci-step-fails-open.md`](../../../docs/lessons/a-secret-guarded-ci-step-fails-open.md).

Run `npm run eval:ci` locally before merging a change to the chains or the
prompts — it is the fast 5-case subset, and the 80% threshold still applies. If
this ever needs to be automated, it wants a self-hosted runner or a
`workflow_dispatch` job reaching the proxy over the private network, not a
public proxy.
