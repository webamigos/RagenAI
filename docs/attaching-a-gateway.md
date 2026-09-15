# Attaching an external AI gateway

Ragen calls model providers itself (`packages/llm-gateway`), and that is now the
only path — B6 removed the proxy mode and the flag that chose it. Attaching a
gateway is therefore a *routing* decision rather than a mode: any endpoint
that speaks OpenAI's
`/v1/chat/completions` and `/v1/embeddings` can serve some or all of the
models, chosen per model, with no change to any code.

That is the point of [Q6](specs/2026-09-14-replace-litellm-with-an-in-process-gateway.md).
Ragen deliberately does not build a gateway product — routing, retries, caching,
provider fallback and spend dashboards are what [Portkey](https://github.com/portkey-ai/gateway),
[LiteLLM](https://github.com/BerriAI/litellm), vLLM, Ollama and TGI already do,
several of them better and none of them ours to maintain. Attaching one is two
lines of configuration.

**Portkey is the one to reach for first.** It is TypeScript and Node, which is
this repository's stack — so it is deployable, debuggable and patchable by
whoever maintains Ragen, without a second language runtime in the deployment.
LiteLLM is Python and carries its own Postgres for keys and spend, which is
most of what [ADR-04](adrs/04-litellm-unified-llm-gateway.md) was retired for;
it stays supported and documented here, and it is the right choice if you are
already running one.

**What you get is a router, not a control plane.** Ragen keeps its own
per-organization limits, model allowlists and usage accounting, and ignores
budgets set inside the attached gateway. Set a monthly ceiling in Portkey and
Ragen will not know about it; set it in Ragen's organization settings instead.

## The two pieces

**1. A route**, in `infra/llm-gateway/routes.yaml` (or your own file, via
`LLM_ROUTES_PATH`):

```yaml
routes:
  gpt-5.4:
    provider: openai-compatible
    connection: portkey
    model: gpt-5.4 # what the upstream calls it
```

**2. Its credentials**, derived from the connection name. `connection: portkey`
reads `LLM_PORTKEY_*`; `connection: my-gateway` reads `LLM_MY_GATEWAY_*`
(non-alphanumerics become underscores, everything uppercased).

| Variable                 | |
| ------------------------ | --- |
| `LLM_<NAME>_BASE_URL`    | **required** — must include the path prefix the upstream serves, usually `/v1` |
| `LLM_<NAME>_API_KEY`     | optional — sent as `Authorization: Bearer …`; a local Ollama has none |
| `LLM_<NAME>_HEADERS`     | optional — a JSON object of extra headers, applied after the bearer token |

Restart the app. Nothing is rebuilt, because the route table is a file and the
credentials are environment variables.

## Portkey

[Portkey's gateway](https://github.com/portkey-ai/gateway) is OpenAI-compatible
and routes on headers, which is what `LLM_<NAME>_HEADERS` exists for.

Self-hosted, with the upstream provider named per request:

```yaml
routes:
  gpt-5.4:
    provider: openai-compatible
    connection: portkey
    model: gpt-4o
```

```bash
LLM_PORTKEY_BASE_URL=http://localhost:8787/v1
LLM_PORTKEY_API_KEY=<the upstream provider key Portkey should forward>
LLM_PORTKEY_HEADERS={"x-portkey-provider":"openai"}
```

Using a saved Portkey config instead of naming the provider inline — which is
where its fallbacks, retries and caching are defined:

```bash
LLM_PORTKEY_BASE_URL=https://api.portkey.ai/v1
LLM_PORTKEY_API_KEY=<portkey api key>
LLM_PORTKEY_HEADERS={"x-portkey-config":"pc-ragen-xxxx"}
```

Check Portkey's own documentation for which header its current version expects —
the header names are theirs, and this table is a convention rather than a
contract.

## LiteLLM

Ragen ran on a LiteLLM proxy until 2026-09, and one can still sit in front —
as a connection like any other, not as a mode
([ADR-04](adrs/04-litellm-unified-llm-gateway.md), superseded), so attaching one
is well-trodden. It needs no headers:

```yaml
routes:
  gpt-5.4:
    provider: openai-compatible
    connection: litellm
    model: gpt-5.4 # the model_name from LiteLLM's own config.yaml
```

```bash
LLM_LITELLM_BASE_URL=http://litellm:4000/v1
LLM_LITELLM_API_KEY=<LITELLM_MASTER_KEY, or a virtual key>
```

`infra/litellm/` still contains a working proxy configuration if you want a
starting point. Note that `model:` here is LiteLLM's `model_name`, not the
upstream's — LiteLLM does that mapping itself, which is most of what it is for.

## vLLM, Ollama, TGI

Same shape, usually without a key:

```yaml
routes:
  llama3.3-70b:
    provider: openai-compatible
    connection: ollama
    model: llama3.3:70b
```

```bash
LLM_OLLAMA_BASE_URL=http://localhost:11434/v1
```

## Mixing

Routing is per model, so a deployment can send its chat model through Portkey,
keep embeddings on Scaleway directly, and point one model at a local Ollama.
There is no "gateway mode" beyond the route table:

```yaml
routes:
  gpt-5.4:
    provider: openai-compatible
    connection: portkey
    model: gpt-4o
  bge-multilingual-gemma2:
    provider: openai-compatible
    connection: scaleway
    model: bge-multilingual-gemma2
  gemini-2.5-flash:
    provider: vertex
    model: gemini-2.5-flash
```

## Checking it worked

```bash
LLM_GATEWAY=native npm run gateway:preflight -- --probe
```

Resolves every model the deployment is configured to use and makes one real
call each, reporting which upstream answered. Run it with `--probe`: a check
that only reads variables will call a misconfigured gateway healthy, which is
[how three separate misconfigurations survived a full test suite](lessons/a-provider-package-is-not-configured-until-something-calls-it.md).

## What an attached gateway does not change

- **Limits and allowlists stay in Ragen.** Per-organization monthly ceilings,
  `OrganizationSettings.allowedModels` and usage accounting are enforced in the
  application, before the call is made.
- **Model ids stay Ragen's.** The key in `routes.yaml` is the id the
  application and the model picker use; `model:` is what the upstream calls it.
  They differ whenever the upstream has its own spelling.
- **Reranking and speech are separate seams.** `RERANK_PROVIDER` and
  `SPEECH_BASE_URL` are configured on their own and are not affected by a route.
- **Capability flags are not inferred.** Which models reason, or accept images,
  comes from `MODEL_REGISTRY` in `@ragenai/platform-contracts` — a route says
  where a model lives, not what it can do. A model reachable through a gateway
  but absent from the registry will serve chat and show no capabilities.
