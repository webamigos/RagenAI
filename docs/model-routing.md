# Model routing and data retention

Split out of `README.md` so the README can introduce the product rather than
document it. How OpenRouter traffic is pinned to EU infrastructure and zero-retention endpoints by default. See also [`litellm-proxy.md`](litellm-proxy.md).

OpenRouter requests can be routed through specific cloud providers (Vertex AI, Bedrock, Azure) with data collection controls via environment variables:

All defaults are **secure-by-default** (EU region, ZDR, no data collection). Override via env vars if needed:

| Env Variable | Default | Description |
|---|---|---|
| `OPENROUTER_BASE_URL` | `https://eu.openrouter.ai/api` | Base URL — EU region by default |
| `OPENROUTER_PROVIDER_ORDER` | `google-vertex,amazon-bedrock` | Comma-separated provider slugs tried in order |
| `OPENROUTER_DATA_COLLECTION` | `deny` | Prevents providers from training on requests |
| `OPENROUTER_ZDR` | `true` | Zero Data Retention — only use ZDR endpoints |
| `OPENROUTER_PROVIDER_ONLY` | _(none)_ | Restrict to only these providers |
| `OPENROUTER_PROVIDER_IGNORE` | _(none)_ | Exclude specific providers |

**Zero Data Retention (ZDR)**: When `OPENROUTER_ZDR=true`, requests are only routed to providers that guarantee customer data never reaches the model provider's own infrastructure and is never retained. This is critical for RAG applications handling customer documents.

**EU Region Routing** (default): All OpenRouter traffic routes through `https://eu.openrouter.ai/api` by default — data stays within EU infrastructure. Only models supporting EU in-region routing are available. Set `OPENROUTER_BASE_URL=https://openrouter.ai/api` to switch to global routing. EU routing requires enterprise or pay-as-you-go plan.

**No configuration needed** — secure defaults are applied automatically. To switch to global (non-EU) routing:
```bash
OPENROUTER_BASE_URL=https://openrouter.ai/api
```

These preferences are automatically applied to all OpenRouter requests (both env-level and org-level credentials).
