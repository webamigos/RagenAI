# Model routing and data retention

How OpenRouter traffic is routed, and what it takes to keep it on EU or
zero-retention infrastructure.

> **This page used to describe defaults that did not exist.** It said EU-region
> routing and zero data retention were applied automatically, "no configuration
> needed". It documented six `OPENROUTER_*` variables and no TypeScript file
> read any of them — enforced by nothing, in a page about where customer
> documents go. All six are real now, and **every one of them is off unless you
> set it**.
> Enabling them by default would have been a new behaviour dressed as a
> restoration, and would break a free key: EU in-region routing needs an
> enterprise or pay-as-you-go plan.

## Using OpenRouter

One key, and most of the catalogue behind it — including embedding models, so
the knowledge base works rather than only chat. `create-ragen-app` offers it as
the first choice for that reason.

```bash
OPENROUTER_API_KEY=sk-or-...
```

```yaml
# infra/llm-gateway/routes.yaml
routes:
  claude-haiku-4-5-openrouter:
    provider: openrouter
    model: anthropic/claude-haiku-4.5
  text-embedding-3-small-openrouter:
    provider: openrouter
    model: openai/text-embedding-3-small
```

The key on the left is the id the application asks for (`DEFAULT_MODEL`,
`EMBEDDINGS_MODEL`); `model` is OpenRouter's own namespaced name. Set
`VECTOR_SIZE` to match the embedding model **before** the first upload —
Qdrant fixes a collection's dimensionality when it creates it.

## Where the connection goes

Two variables configure the client itself rather than the routing, and neither
is sent in the request body. Unset means the field is omitted entirely.

| Env Variable | Effect when set |
|---|---|
| `OPENROUTER_BASE_URL` | The endpoint. `https://eu.openrouter.ai/api` keeps traffic in the EU (paid plans only). Unset means OpenRouter's global endpoint. |
| `OPENROUTER_HEADERS` | A JSON object of extra request headers, for dashboard attribution. Malformed JSON stops the process rather than being dropped. |

## Routing preferences

These four become fields of OpenRouter's `provider` object on every request.
Unset means the field is not sent, and OpenRouter's own behaviour applies; if
none is set, no `provider` object is sent at all.

| Env Variable | Effect when set |
|---|---|
| `OPENROUTER_ZDR` | `true` restricts routing to zero-data-retention endpoints. The value is trimmed, so `" true "` counts, but nothing else does — `yes` and `1` are off, because a typo must not read as "yes" on this setting. |
| `OPENROUTER_DATA_COLLECTION` | `allow` or `deny`. `deny` refuses providers that may retain prompts. Any other value stops the process rather than being ignored. |
| `OPENROUTER_PROVIDER_ORDER` | Comma-separated provider slugs, tried in order — e.g. `google-vertex,amazon-bedrock`. |
| `OPENROUTER_PROVIDER_ONLY` / `OPENROUTER_PROVIDER_IGNORE` | Comma-separated allowlist and denylist. |

A deployment handling customer documents probably wants at least:

```bash
OPENROUTER_ZDR=true
OPENROUTER_DATA_COLLECTION=deny
```

## Checking it

```bash
npm run gateway:preflight -- --probe
```

One real call per model this installation is configured to use. A route is a
claim until something calls it — "configured" and "works" are different
questions.

## Staying inside the EU without OpenRouter

Scaleway's Generative APIs are served from EU infrastructure and are what
Ragen's own demo runs: Mistral for chat, BGE for embeddings, Qwen for
reranking. `create-ragen-app` offers it as a choice, and
[the configuration docs](https://docs.ragen.ai) carry the variables. Its base
URL carries a project id, so it needs two values rather than one:

```bash
SCW_API_KEY=...
SCW_API_BASE=https://api.scaleway.ai/<project-id>/v1
```

```yaml
  mistral-small-3.2:
    provider: openai-compatible
    connection: scaleway
    model: mistral-small-3.2-24b-instruct-2506
```

`connection: scaleway` is what selects those two variables, and an
`openai-compatible` route is not optional about it: without one, resolving the
route throws `MissingCredentialsError` naming "a `connection` on the route",
before any `LLM_*` variable is read or any base URL is looked for. That is a
boot-time refusal rather than a failure on the first chat turn.
