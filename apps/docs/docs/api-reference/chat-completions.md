---
sidebar_position: 2
sidebar_label: Chat Completions
---

# Chat Completions

OpenAI-compatible chat completions endpoint.

```
POST $RAGEN_BASE_URL/chat/completions
```

:::tip Use the SDK
For TypeScript / JavaScript, prefer the official
[`@ragenai/sdk`](https://www.npmjs.com/package/@ragenai/sdk) — typed
responses, streaming iterators, automatic retries on 429/5xx:

```ts
import { Ragen } from "@ragenai/sdk";

const ragen = new Ragen({ apiKey: process.env.RAGEN_API_KEY });

const completion = await ragen.chat.completions.create({
  assistantId: "123e4567-e89b-12d3-a456-426614174000",
  messages: [{ role: "user", content: "What is our refund policy?" }],
});
```

See the [Quickstart](/docs/quickstart) for streaming, file upload, and
Next.js examples. The HTTP reference below documents the underlying wire
format used by the SDK and any custom integrations.
:::

## Authentication

```
Authorization: Bearer YOUR_API_KEY
```

API keys are scoped to your **organization**. Each request must specify
which assistant (project) to query via the `assistant_id` field in the
request body. Create and manage keys under **Settings → API Keys** in
the dashboard.

:::tip Finding your assistant ID
You can find your assistant ID in:
- The dashboard URL when viewing a project: `<your-instance>/.../projects/<assistant_id>`
- The API: `GET /v1/assistants` returns a list with each assistant's `id`
- **Settings → Assistant settings** in the dashboard
:::

:::tip Debug mode
Enable **debug mode** on your API key to save every API conversation as
a thread visible in the project's **API threads** tab. Useful during
development — you can inspect the full request and response without
adding logging to your code. See [Debug mode](/docs/concepts#debug-mode).
:::

## Request

### Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `assistant_id` | `string` | Yes | The assistant (project) ID to query. Get available IDs from [`GET /v1/assistants`](./assistants). |
| `messages` | `array` | Yes | 1–100 messages in conversation order. See [Message format](#message-format). |
| `model` | `string` | No | Overrides the organization's default model for this request. |
| `temperature` | `number` | No | 0–2. Overrides the organization default. |
| `max_tokens` | `integer` | No | Cap on generated tokens (1–32,000). |
| `max_completion_tokens` | `integer` | No | Alias for `max_tokens` — the name current OpenAI SDKs send. `max_tokens` wins if both are present. |
| `reasoning_effort` | `string` | No | `low`, `medium`, or `high`. Forwarded to the model; only reasoning-capable models act on it. Reasoning-capable models default to `medium`. |
| `stream` | `boolean` | No | When `true`, responds with a Server-Sent Events stream. Default `false`. |
| `stream_options` | `object` | No | Streaming options. Currently supports `include_usage: boolean`. See [Streaming](#streaming). |

### Other OpenAI parameters

Point an OpenAI SDK at Ragen and it will send whatever parameters you
set. These validate and are accepted, but the RAG chain has nowhere to
apply them yet — they change nothing about the response:

`top_p` · `n` (must be `1`) · `stop` · `presence_penalty` ·
`frequency_penalty` · `logit_bias` · `user` · `seed` · `logprobs` ·
`top_logprobs` · `store` · `metadata` · `parallel_tool_calls` ·
`service_tier`

Three are **rejected with a 400** rather than accepted-and-ignored,
because silently dropping them would produce a response that violates
what you asked for:

| Field | Why |
|-------|-----|
| `response_format` | Accepting JSON mode and then returning prose breaks every caller that runs `JSON.parse` on the result. |
| `tools`, `tool_choice` | Tool selection is server-side in Ragen, configured per project via MCP integrations — not chosen per request. |

`n` greater than `1` is rejected for the same reason: you would get one
choice back after asking for several.

### Message format

Each message is `{ role, content }`, plus OpenAI's optional `name`
(accepted; it does not reach the prompt):

| Role | Purpose |
|------|---------|
| `user` | The user's turn. The **last** user message is treated as the active question; earlier ones become conversation history. |
| `assistant` | Prior assistant responses. Included in conversation history. |
| `system` | Per-request system instructions — merged on top of the project's own instructions (project owner's intent first, then the caller's). |

## Response

### Non-streaming

Returns a `chat.completion` object:

```json
{
  "id": "chatcmpl-7a2b4c...",
  "object": "chat.completion",
  "created": 1744664400,
  "model": "gpt-5.4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Our refund policy allows returns within 30 days..."
      },
      "finish_reason": "stop",
      "logprobs": null
    }
  ],
  "usage": {
    "prompt_tokens": 128,
    "completion_tokens": 42,
    "total_tokens": 170
  }
}
```

### Streaming

When `stream: true`, returns `text/event-stream` with a sequence of
`chat.completion.chunk` objects, terminated by `data: [DONE]`:

```
data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":1744664400,"model":"gpt-5.4","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null,"logprobs":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":1744664400,"model":"gpt-5.4","choices":[{"index":0,"delta":{"content":"Our "},"finish_reason":null,"logprobs":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":1744664400,"model":"gpt-5.4","choices":[{"index":0,"delta":{"content":"refund policy..."},"finish_reason":null,"logprobs":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":1744664400,"model":"gpt-5.4","choices":[{"index":0,"delta":{},"finish_reason":"stop","logprobs":null}]}

data: [DONE]
```

- The first chunk carries `delta.role: "assistant"` (OpenAI convention).
- Content chunks carry `delta.content`.
- The final chunk before `[DONE]` has empty `delta` and
  `finish_reason: "stop"`.

#### Including usage in streams

By OpenAI convention, `usage` is not emitted on streaming responses
unless the caller opts in. Pass `stream_options: { include_usage: true }`
to receive a trailing usage chunk:

```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion.chunk",
  "created": 1744664400,
  "model": "gpt-5.4",
  "choices": [],
  "usage": {
    "prompt_tokens": 128,
    "completion_tokens": 42,
    "total_tokens": 170
  }
}
```

The `choices: []` signals that this chunk carries usage only, not content.

## Examples

### Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url=os.environ["RAGEN_BASE_URL"],
    api_key="YOUR_API_KEY",
)

resp = client.chat.completions.create(
    model="gpt-5.4",
    messages=[
        {"role": "user", "content": "What is our refund policy?"},
    ],
    extra_body={"assistant_id": "YOUR_ASSISTANT_ID"},
)
print(resp.choices[0].message.content)
```

### Python streaming

```python
stream = client.chat.completions.create(
    model="gpt-5.4",
    messages=[{"role": "user", "content": "Summarize our onboarding process"}],
    stream=True,
    stream_options={"include_usage": True},
    extra_body={"assistant_id": "YOUR_ASSISTANT_ID"},
)

for chunk in stream:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
    if chunk.usage:
        print(f"\n\nUsed {chunk.usage.total_tokens} tokens")
```

### JavaScript / TypeScript (openai-node)

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: process.env.RAGEN_BASE_URL,
  apiKey: process.env.RAGEN_API_KEY,
});

const resp = await client.chat.completions.create({
  model: "gpt-5.4",
  messages: [{ role: "user", content: "What is our refund policy?" }],
  // @ts-expect-error — Ragen extension
  assistant_id: "YOUR_ASSISTANT_ID",
});
console.log(resp.choices[0].message.content);
```

### cURL

```bash
curl -X POST $RAGEN_BASE_URL/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "assistant_id": "YOUR_ASSISTANT_ID",
    "model": "gpt-5.4",
    "messages": [
      {"role": "user", "content": "What is our refund policy?"}
    ]
  }'
```

### Multi-turn conversation

The **last `user` message** is treated as the active question; earlier
messages form the conversation context.

```python
resp = client.chat.completions.create(
    model="gpt-5.4",
    messages=[
        {"role": "user", "content": "What is our refund policy?"},
        {"role": "assistant", "content": "We offer refunds within 30 days of purchase."},
        {"role": "user", "content": "What about digital products?"},
    ],
    extra_body={"assistant_id": "YOUR_ASSISTANT_ID"},
)
```

### Per-request system prompt

```python
resp = client.chat.completions.create(
    model="gpt-5.4",
    messages=[
        {"role": "system", "content": "Respond only in Polish."},
        {"role": "user", "content": "What is our refund policy?"},
    ],
    extra_body={"assistant_id": "YOUR_ASSISTANT_ID"},
)
```

System messages are merged on top of the project's own instructions —
the project owner's instructions come first, then the caller's.

## Error responses

Errors use the OpenAI error envelope so existing SDK error-handling
keeps working:

```json
{
  "error": {
    "message": "prompt too long",
    "type": "invalid_request_error",
    "code": "context_length_exceeded",
    "param": null
  }
}
```

| Status | `type` | Meaning |
|--------|--------|---------|
| 400 | `invalid_request_error` | Malformed body, validation failure, prompt too long |
| 401 | `authentication_error` | Missing or invalid API key |
| 403 | `permission_error` | Key deactivated or missing required scope |
| 404 | `not_found_error` | Project (assistant) not found |
| 429 | `rate_limit_error` | Rate limit exceeded |
| 5xx | `api_error` | Upstream / internal error |

## Rate limits

Chat completions run a full RAG pipeline (vector search + rerank +
LLM call), so they're on the **expensive** tier:

| Scope | Limit |
|-------|-------|
| `POST /v1/chat/completions` | 10 req/min per IP |

Each streaming and non-streaming request counts identically against
this budget. When the limit is hit the response is
`429 rate_limit_error`; back off with jitter.

## Differences vs. `/v1/chat`

The ragen-native [`POST /v1/chat`](./chat) endpoint is a simpler
interface (single `content` string + optional `context`) that predates
the OpenAI-compatible one. Both are supported:

| | `/v1/chat` | `/v1/chat/completions` |
|---|---|---|
| Format | Ragen-native JSON / SSE | OpenAI wire format |
| Multi-turn | No (single prompt) | Yes (messages array) |
| Model override | No | Yes (`model` field) |
| Temperature override | No | Yes |
| `max_tokens` | No | Yes |
| Page context injection | Yes (`context` field) | No — use `messages` instead |
| Usage in streams | No | Opt-in via `stream_options` |

Use `/v1/chat/completions` for any new integration that benefits from
the OpenAI SDK ecosystem. Keep `/v1/chat` for the embed widget and
other existing ragen-native consumers.
