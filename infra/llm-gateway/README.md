# LLM gateway routes

`routes.yaml` maps a model id the application uses to the upstream that serves
it. It replaces the routing half of `infra/litellm/config.yaml`, and is read by
`@ragenai/llm-gateway` — see
[the spec](../../docs/specs/2026-09-14-replace-litellm-with-an-in-process-gateway.md),
Phase B.

It is a **file, not a constant in the package**, and that is
[Q6](../../docs/specs/2026-09-14-replace-litellm-with-an-in-process-gateway.md):
retiring LiteLLM as the default does not end support for running one, and what
is actually supported is any OpenAI-compatible endpoint — LiteLLM, vLLM, Ollama,
TGI, AI Gateway. That only holds while adding one is a configuration change.

The difference a file buys is **restart, not rebuild**. It is mounted into every
app container (`docker-compose.fullapp.yml`), the same way
`infra/litellm/config.yaml` always was, so changing a route is editing a file and
restarting a container. A table compiled into the package would need the source
tree, a toolchain and a new image — a fork, for anyone running a published one.
An architecture test keeps the mounts in place, because the moment one is missing
that sentence stops being true.

If you would rather have types and comments in TypeScript, you can: `LlmGateway`
takes a plain `RouteTable` object, so an application is free to build one in
code. The file exists for the deployment that does not want to touch code at
all. For editing the file, `routes.schema.json` is generated from the same zod
schema that validates it, and the `# yaml-language-server:` line at the top of
`routes.yaml` gives your editor autocomplete and inline errors.

## What a route says, and what it does not

```json
"mistral-small-3.2": {
  "provider": "openai-compatible",
  "model": "mistral-small-3.2-24b-instruct-2506",
  "connection": "scaleway"
}
```

- `provider` — one of `azure`, `bedrock`, `vertex`, `openai`,
  `openai-compatible`.
- `model` — the upstream's own name, which is **not** the key. They differ
  wherever the upstream has its own spelling; Bedrock prefixes a region and a
  vendor, and Scaleway carries a full version suffix.
- `connection` — which set of credentials, for `openai-compatible` only. A
  deployment can run several upstreams at once and they need telling apart.

A route carries no credentials and no display name. Credentials come from the
environment (below); display names, visibility and capability flags are
`MODEL_REGISTRY` in `@ragenai/platform-contracts`, which is presentation and
answers a different question.

## Running only OpenAI

The commonest self-hosted setup, and it needs one variable and one file. Put
this somewhere and point `LLM_ROUTES_PATH` at it:

```yaml
# yaml-language-server: $schema=./routes.schema.json
version: 1
routes:
  gpt-4.1:
    provider: openai
    model: gpt-4.1
  text-embedding-3-large:
    provider: openai
    model: text-embedding-3-large
```

```
OPENAI_API_KEY=sk-...
LLM_ROUTES_PATH=/app/infra/llm-gateway/routes.yaml
```

`openai` is a provider of its own rather than an `openai-compatible` endpoint
with a base URL, because making the commonest case spell out
`https://api.openai.com/v1` is a poor first five minutes — and `@ai-sdk/openai`
handles OpenAI's own quirks the generic client does not. `OPENAI_BASE_URL` is
there if you are behind a gateway or a regional endpoint that still speaks
OpenAI's API.

You do not have to trim the shipped table by hand, though doing so is clearer.
The gateway only offers models whose provider is configured, so an installation
holding just `OPENAI_API_KEY` serves the OpenAI routes and stays quiet about
Azure, Bedrock and Vertex instead of listing models that fail on the first click.

## Adding an OpenAI-compatible upstream

Add the route, then two variables derived from the connection name — `ollama`
reads `LLM_OLLAMA_BASE_URL` and `LLM_OLLAMA_API_KEY`:

```json
"llama-3.3-70b": {
  "provider": "openai-compatible",
  "model": "llama3.3:70b",
  "connection": "ollama"
}
```

The API key is optional, because a local Ollama has none. The base URL is not.

`LLM_<NAME>_HEADERS` takes a JSON object of extra headers, applied after the
bearer token. That is what lets a gateway that routes on headers be attached at
all — Portkey selects its upstream with `x-portkey-provider` or a saved config
with `x-portkey-config`, and a base URL plus a key cannot express either.
Malformed content throws rather than being ignored, because a header that
silently failed to apply would send traffic to the wrong upstream with nothing
to read afterwards.

Worked examples for Portkey, LiteLLM, vLLM and Ollama:
[`docs/attaching-a-gateway.md`](../../docs/attaching-a-gateway.md).

`scaleway` also accepts the proxy-era `SCW_API_BASE` / `SCW_API_KEY`, so the one
connection that exists today keeps working with no change to any environment.

## Credentials for the other providers

The names are the ones `infra/litellm/config.yaml` already uses, so a deployment
running the proxy today needs no new secrets to run the gateway — which is what
lets the two be compared directly while `LLM_GATEWAY` still chooses between
them.

| provider  | variables                                                       |
| --------- | --------------------------------------------------------------- |
| `azure`   | `AZURE_API_KEY`, `AZURE_API_BASE`                               |
| `bedrock` | `AWS_BEDROCK_REGION` (plus the default AWS credential chain)    |
| `vertex`  | `VERTEX_PROJECT`, `VERTEX_LOCATION` (plus application defaults) |

## Turning it on

```text
LLM_GATEWAY=native
```

`litellm` is the default and keeps the proxy. Anything else is refused at boot
rather than treated as the default — a typo that fell back would run the proxy
arm while reporting the gateway's, and the only evidence would be a comparison
that found no difference, which is also what a clean cutover looks like.

Switched: `apps/web`, `apps/api` and `apps/worker` — chat, embeddings, and the
worker's PDF extraction. `apps/admin` has no model calls to switch.

Two things to know before reading a result:

- **A chat model resolves on its first call, not when it is built.** The
  multimodal swap chooses between models based on what the turn contains, so the
  decision cannot be made before the messages exist. One model instance can
  therefore call two different upstreams across a conversation.
- **`LITELLM_PROXY_URL` is still required**, under either value, until B4. The
  gateway path never reads it; the env schema has not been relaxed yet, because
  both arms are measured on one machine with the proxy running anyway.
  `LITELLM_MASTER_KEY` is the exception — the worker stops demanding it under
  `native`, because its boot check would otherwise refuse to start over a
  credential nothing on that path uses.
- **Three model ids the apps hard-code are served by neither path.**
  `PDF_MODEL`'s default `claude-haiku-4-5`, and `gpt-5.4-mini` / `gpt-5.4-nano`
  in the worker's image and PDF chains. They are commented out in the proxy
  config and absent here, so those paths fail either way — the gateway just
  says so earlier, with `UnknownModelError`. Only the worker's non-Docling
  fallback reaches them.

## Later

Per-organization and per-team keys are the known next step, and belong in
ragen-token-vault, which already holds per-org secrets (ADR-13, ADR-32). That
arrives as a second `CredentialSource` implementation, not as a change to this
file — `resolveModel` already threads a scope through for it. The route table
itself may move to the database at the same time; `loadRouteTable` takes parsed
content rather than reading the disk for that reason.

Regenerate `routes.schema.json` after changing the zod schema — a guard compares
the two and will tell you when they have drifted.
