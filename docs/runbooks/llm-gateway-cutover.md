# LLM gateway cutover runbook

Switching an environment from the LiteLLM proxy to the in-process gateway —
`LLM_GATEWAY=litellm` → `native`. Phase B4 of
[the retirement spec](../specs/2026-09-14-replace-litellm-with-an-in-process-gateway.md).

The flag is per environment and reversible in one variable, which is the whole
reason it exists. Nothing in this procedure requires a code change or a release.

## What actually changes

The application stops sending model calls to a proxy and starts calling Azure,
Bedrock, Vertex and Scaleway itself, using `infra/llm-gateway/routes.yaml` and
the same provider credentials the proxy already reads.

**The operational consequence is the one Q1 accepted**: those credentials now
have to be present in *every app process* — web, api and worker — rather than
only in the proxy container. Rotation stops being one restart and becomes
three. That is the main thing to get right before flipping, and the preflight
below is how you check it.

Speech is not affected: B3 gave it `SPEECH_BASE_URL` of its own, and the
reranker's `cohere` variant now has `RERANK_COHERE_BASE_URL` — it still falls
back to `LITELLM_PROXY_URL` while the proxy exists, so nothing needs setting
today.

## Before you flip

1. **Give the three app services the provider credentials.** Whatever
   `infra/litellm/config.yaml` reads, each of `web`, `api` and `worker` now
   needs: `AZURE_API_KEY`/`AZURE_API_BASE`, the AWS chain plus
   `AWS_BEDROCK_REGION`, `VERTEX_PROJECT`/`VERTEX_LOCATION`/`VERTEX_CREDENTIALS`,
   `SCW_API_BASE`/`SCW_API_KEY` — only the ones whose models that deployment
   actually serves.

   `VERTEX_CREDENTIALS` is the service-account JSON itself, not a path. The
   gateway reads it that way on purpose, so a deployment running the proxy needs
   no new secrets — but it is also the one that failed first when this was
   built, so check it is present and whole. `AZURE_API_VERSION` is passed
   through for the same reason; Azure refuses a request whose version predates
   the feature it uses.

   The full list, for the route table as shipped:

   | Provider | Variables |
   | --- | --- |
   | Vertex | `VERTEX_PROJECT`, `VERTEX_LOCATION`, `VERTEX_CREDENTIALS` |
   | Scaleway | `SCW_API_BASE`, `SCW_API_KEY` |
   | Azure | `AZURE_API_KEY`, `AZURE_API_BASE`, `AZURE_API_VERSION` |
   | Bedrock | `AWS_BEDROCK_REGION` (credentials come from the AWS default chain — static keys, an instance role or SSO) |

   Vertex and Scaleway are the minimum — they serve the default chat, rephrase,
   summary and embedding models. Azure and Bedrock decide whether their models
   appear in the picker at all (see step 4).

   These are the proxy's own names, so they can be copied from the LiteLLM
   service rather than reissued.

2. **Confirm the image ships the route table.** Every runtime image `COPY`s
   `infra/llm-gateway`, and an architecture guard fails the build if one stops.
   Compose mounts it instead. If you are deploying some third way, the file has
   to be reachable from the process's working directory or any parent of it.

3. **Run the preflight against that environment's variables**:

   ```bash
   LLM_GATEWAY=native npm run gateway:preflight -- --probe
   ```

   It resolves every model the deployment is configured to use and makes one
   real call each. **Run it with `--probe`.** Without it the check only proves
   the variables are set, and "set" is not "works" — that distinction is
   exactly what cost three debugging cycles when the gateway was first run for
   real (see
   [the lesson](../lessons/a-provider-package-is-not-configured-until-something-calls-it.md)).

   A `MISS` on a fallback-only model — `PDF_MODEL`'s default `claude-haiku-4-5`
   is one today — is reported and does not block: those are equally unserved on
   the proxy path, so the flip changes nothing about them.

4. **The model picker follows the flag.** Under `native`,
   `getAvailableModelsForOrganization()` offers only what
   `gateway.availableModels()` says this deployment can serve — which is
   credential-aware, so a provider whose keys the three services do not have
   simply does not appear. It used to ask the proxy regardless of the flag,
   which meant offering models the app processes could not serve and failing on
   the first click.

   That narrows what you must configure: **the minimum is the providers behind
   the models you actually want offered.** Vertex and Scaleway cover the
   defaults (chat, rephrase, summary, embeddings). Add Azure and Bedrock only
   if you want their models in the picker — without them those models are
   hidden rather than broken.

   If the route table cannot be read at all, the picker falls back to the full
   catalogue rather than going empty: an empty picker reads as a broken
   product, and the per-model call still fails loudly.

## The flip

Railway configuration lives in the dashboard, not in this repository
([ADR-47](../adrs/47-railway-configuration-lives-in-the-dashboard.md)). Set, on
**each** of the environment's `web`, `api` and `worker` services:

```text
LLM_GATEWAY=native
```

Redeploy all three. A partial flip is safe but confusing — chat would take one
path and ingest the other — so do not leave it half-done longer than a deploy.

**Confirm what each service actually did**, rather than what you set:

```bash
curl -s https://<env>/api/healthcheck
# {"status":"ok","llmGateway":"native"}
```

The app answers with the mode it is running, which is the only claim worth
trusting — an unrecognised value is refused at boot rather than quietly falling
back, so a typo is a failed deploy and not a silently proxied one.

## Watch for a week

The measurement that preceded this found **no retrieval regression** and one
reproducible difference in answer composition
([the comparison](../rag-gateway-comparison-2026-09-15.md)), so what you are
watching for is operational rather than qualitative:

- **5xx on chat and on ingest** — a missing credential shows up here first.
- **`ai_usage` rows still arriving.** Embeddings written by the gateway carry
  `provider: 'llm-gateway'` instead of `'litellm'`, which is how you tell the
  two apart after the fact; rows stopping altogether is the signal.
- **Worker ingest completing.** The worker is the surface that fails quietly —
  a route it cannot resolve marks documents `FAILED` rather than erroring
  anywhere visible.
- **Langfuse traces.** The proxy was one of the two things sending them
  (ADR-22); app-level tracing continues, proxy-level does not.

## Rolling back

Set `LLM_GATEWAY=litellm` on the three services and redeploy. There is no
migration and no state to undo — the flag picks a code path and nothing else.
The proxy keeps running throughout B4 precisely so that this is a variable
change and not a restore.

Roll back for: 5xx attributable to a provider call, ingest failures, or usage
rows stopping. Do **not** roll back for a change in answer wording — that is
the known difference the comparison documents, and it is a product decision
rather than an incident.

## Then everywhere

After a week without an operational signal, flip the remaining environments the
same way. Changing `DEFAULT_GATEWAY_MODE` in `packages/llm-gateway` — which
would flip local development and every fresh clone — belongs with that step,
not with this one.
