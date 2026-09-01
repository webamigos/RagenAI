---
sidebar_position: 1
sidebar_label: Chat
---

# Chat API

Send a message and receive an AI-generated response grounded in your project's knowledge base.

```
POST $RAGEN_BASE_URL/chat
```

## Authentication

Include your API key in the `Authorization` header using the Bearer scheme:

```
Authorization: Bearer YOUR_API_KEY
```

API keys are scoped to your **organization**. Each request must specify
which assistant to query via the `assistant_id` field. Create and manage
keys in the Ragen dashboard under **Settings** > **API Keys**.

:::tip Finding your assistant ID
You can find your assistant ID in:
- The dashboard URL when viewing a project: `<your-instance>/.../projects/<assistant_id>`
- The API: `GET /v1/assistants` returns a list with each assistant's `id`
- **Settings → Assistant settings** in the dashboard
:::

## Request

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | `Bearer YOUR_API_KEY` |
| `Content-Type` | Yes | Must be `application/json` |

### Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `assistant_id` | `string` | Yes | The assistant (project) ID to query. |
| `content` | `string` | Yes | The user's message. 1 to 10,000 characters. |
| `context` | `string` | No | Additional page or document context. Max 20,000 characters. Useful for providing the current page's content when building embedded chatbots. |
| `stream` | `boolean` | No | Whether to stream the response as Server-Sent Events. Default: `false`. |
| `reasoning_effort` | `string` | No | OpenAI-style reasoning effort: `"low"`, `"medium"`, or `"high"`. Forwarded to the underlying model — only honored by reasoning-capable models (e.g. GPT-OSS); silently ignored by other models. When set, streaming responses additionally emit `data: {"reasoning":"..."}` events with the model's intermediate thinking. |

### Example request

```bash
curl -X POST $RAGEN_BASE_URL/chat \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "assistant_id": "YOUR_ASSISTANT_ID",
    "content": "What is our return policy?",
    "context": "This is the FAQ page of our e-commerce store."
  }'
```

## Response

### Non-streaming (default)

Returns a JSON object:

```json
{
  "text": "Based on your documentation, customers can return items within 30 days of purchase for a full refund..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | The AI-generated response |

### Streaming (`stream: true`)

Returns a `text/event-stream` response. Each event contains a chunk of the response:

```
HTTP/1.1 200 OK
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive

data: {"text":"Based "}
data: {"text":"on "}
data: {"text":"your "}
data: {"text":"documentation, "}
data: {"text":"customers can..."}
data: [DONE]
```

- Each `data:` line contains a JSON object. Two event shapes may be emitted:
  - `{"text": "..."}` — a chunk of the final answer
  - `{"reasoning": "..."}` — a chunk of the model's intermediate reasoning, only emitted when `reasoning_effort` is set and the underlying model supports reasoning (e.g. GPT-OSS). Most clients should display these separately from the answer or ignore them.
- The stream ends with `data: [DONE]`

## Examples

### JavaScript / TypeScript

```typescript
const response = await fetch(`${process.env.RAGEN_BASE_URL}/chat`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.RAGEN_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    assistant_id: "YOUR_ASSISTANT_ID",
    content: "Summarize our product features",
  }),
});

const data = await response.json();
console.log(data.text);
```

### JavaScript / TypeScript (streaming)

```typescript
const response = await fetch(`${process.env.RAGEN_BASE_URL}/chat`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.RAGEN_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    assistant_id: "YOUR_ASSISTANT_ID",
    content: "Summarize our product features",
    stream: true,
  }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const text = decoder.decode(value);
  const lines = text.split("\n").filter((line) => line.startsWith("data: "));

  for (const line of lines) {
    const data = line.slice(6); // Remove "data: " prefix
    if (data === "[DONE]") break;

    const parsed = JSON.parse(data);
    process.stdout.write(parsed.text);
  }
}
```

### Python

```python
import os
import requests

response = requests.post(
    f"{os.environ['RAGEN_BASE_URL']}/chat",
    headers={
        "Authorization": "Bearer YOUR_API_KEY",
        "Content-Type": "application/json",
    },
    json={"assistant_id": "YOUR_ASSISTANT_ID", "content": "Summarize our product features"},
)

data = response.json()
print(data["text"])
```

### Python (streaming)

```python
import os
import requests
import json

response = requests.post(
    f"{os.environ['RAGEN_BASE_URL']}/chat",
    headers={
        "Authorization": "Bearer YOUR_API_KEY",
        "Content-Type": "application/json",
    },
    json={"assistant_id": "YOUR_ASSISTANT_ID", "content": "Summarize our product features", "stream": True},
    stream=True,
)

for line in response.iter_lines():
    if not line:
        continue
    decoded = line.decode("utf-8")
    if not decoded.startswith("data: "):
        continue
    data = decoded[6:]
    if data == "[DONE]":
        break
    parsed = json.loads(data)
    print(parsed["text"], end="", flush=True)
```

## Error responses

All errors return a JSON body with an error description.

### 400 Bad Request

Invalid request body (missing `content`, exceeds character limits, etc.)

```json
{
  "statusCode": 400,
  "message": ["content must be between 1 and 10000 characters"],
  "error": "Bad Request"
}
```

### 401 Unauthorized

Missing, malformed, or invalid API key.

```json
{
  "statusCode": 401,
  "message": "Invalid API key",
  "error": "Unauthorized"
}
```

### 403 Forbidden

API key is valid but has been deactivated.

```json
{
  "statusCode": 403,
  "message": "API key is deactivated",
  "error": "Forbidden"
}
```

### 429 Too Many Requests

Rate limit exceeded.

```json
{
  "statusCode": 429,
  "message": "Too many requests",
  "error": "Too Many Requests"
}
```

### 502 Bad Gateway

Internal service temporarily unavailable. Retry with exponential backoff.

```json
{
  "statusCode": 502,
  "message": "Service unavailable",
  "error": "Bad Gateway"
}
```

## Rate limits

| Scope | Limit |
|-------|-------|
| Per IP address | 20 requests / minute |

When rate-limited, wait before retrying. Use exponential backoff with jitter for best results.

## How it works

When you send a request to `/v1/chat`:

1. **Authentication** — Your API key is validated
2. **Context resolution** — The organization is determined from your key; the assistant from `assistant_id`
3. **RAG retrieval** — Relevant document chunks are retrieved from the assistant's knowledge base
4. **Reranking** — Retrieved chunks are reranked for better relevance
5. **Generation** — The AI model generates a response using the retrieved context and your message
6. **Response** — The answer is returned as JSON or streamed as SSE
