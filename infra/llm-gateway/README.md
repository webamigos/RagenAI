# LLM gateway routes

`routes.json` maps a model id the application uses to the upstream that serves
it. It replaces the routing half of `infra/litellm/config.yaml`, and is read by
`@ragenai/llm-gateway` — see
[the spec](../../docs/specs/2026-09-14-replace-litellm-with-an-in-process-gateway.md),
Phase B.

It is a **file, not a constant in the package**, and that is
[Q6](../../docs/specs/2026-09-14-replace-litellm-with-an-in-process-gateway.md):
retiring LiteLLM as the default does not end support for running one, and what
is actually supported is any OpenAI-compatible endpoint — LiteLLM, vLLM, Ollama,
TGI, AI Gateway. That only holds while adding one is a configuration change.

## What a route says, and what it does not

```json
"mistral-small-3.2": {
  "provider": "openai-compatible",
  "model": "mistral-small-3.2-24b-instruct-2506",
  "connection": "scaleway"
}
```

- `provider` — one of `azure`, `bedrock`, `vertex`, `openai-compatible`.
- `model` — the upstream's own name, which is **not** the key. They differ
  wherever the upstream has its own spelling; Bedrock prefixes a region and a
  vendor, and Scaleway carries a full version suffix.
- `connection` — which set of credentials, for `openai-compatible` only. A
  deployment can run several upstreams at once and they need telling apart.

A route carries no credentials and no display name. Credentials come from the
environment (below); display names, visibility and capability flags are
`MODEL_REGISTRY` in `@ragenai/platform-contracts`, which is presentation and
answers a different question.

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

## Later

Per-organization and per-team keys are the known next step, and belong in
ragen-token-vault, which already holds per-org secrets (ADR-13, ADR-32). That
arrives as a second `CredentialSource` implementation, not as a change to this
file — `resolveModel` already threads a scope through for it. The route table
itself may move to the database at the same time; `loadRouteTable` takes parsed
content rather than reading the disk for that reason.
