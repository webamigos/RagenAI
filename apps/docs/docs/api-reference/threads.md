---
sidebar_position: 6
sidebar_label: Threads & Messages
---

# Threads and Messages

OpenAI-compatible Threads + Messages APIs. A **thread** is a
conversation container, a **message** is one turn inside it. These are
pure persistence endpoints — **they don't run the model**. For AI
generation use [Chat Completions](./chat-completions) with an inline
messages array.

## Threads

```
POST   /v1/threads
GET    /v1/threads           (Ragen extension — OpenAI doesn't expose list)
GET    /v1/threads/{id}
POST   /v1/threads/{id}      (OpenAI convention — modify)
PATCH  /v1/threads/{id}      (REST alias)
DELETE /v1/threads/{id}
```

### Create

```python
t = client.beta.threads.create(
    messages=[
        {"role": "user", "content": "Hi!"},
        {"role": "assistant", "content": "Hello — how can I help?"},
    ],
    metadata={"channel": "support"},
)
```

Optional Ragen extensions on create:

| Field | Description |
|-------|-------------|
| `title` | Thread title shown in the dashboard sidebar |
| `assistant_id` | `asst-<projectId>` — bind the thread to a specific assistant. Defaults to the API key's project. |

### List

`GET /v1/threads` (org-scoped)

| Query | Description |
|-------|-------------|
| `limit` | 1–100, default 20 |
| `order` | `asc` or `desc` (by `created_at`) |
| `after` | Cursor — thread id to paginate after |

### Modify

```python
client.beta.threads.update("thread-abc", metadata={"channel": "premium"})
```

Accepts `title` (Ragen extension) and `metadata` (accepted, not yet
persisted).

### Delete

Deletes the thread and **all its messages**. Returns:

```json
{ "id": "thread-abc", "object": "thread.deleted", "deleted": true }
```

## Messages

```
POST   /v1/threads/{id}/messages
GET    /v1/threads/{id}/messages
GET    /v1/threads/{id}/messages/{message_id}
DELETE /v1/threads/{id}/messages/{message_id}
```

### Create

Persists one turn on the thread. **Does not run the model** — if you
want AI generation, use `/v1/chat/completions`.

```python
msg = client.beta.threads.messages.create(
    "thread-abc",
    role="user",
    content="What was my last question?",
)
```

Both roles are accepted:
- `user` — human turn (most common)
- `assistant` — useful for backfilling history or importing transcripts

### List + retrieve

```python
for m in client.beta.threads.messages.list("thread-abc"):
    print(m.role, m.content[0].text.value)

m = client.beta.threads.messages.retrieve("thread-abc", "msg-xyz")
```

Returns OpenAI `thread.message` objects with a typed `content` array
(currently always a single `text` block — Ragen doesn't store
multimodal messages on threads today).

### Encrypted threads

Threads created through the Ragen dashboard with encryption enabled
(`AWS_KMS_KEY_ID` set) store message content as ciphertext. ragen-api
cannot decrypt — read endpoints return a placeholder for those
messages:

```json
{
  "role": "user",
  "content": [
    {
      "type": "text",
      "text": {
        "value": "[encrypted — open this thread in the dashboard to view]",
        "annotations": []
      }
    }
  ]
}
```

Threads created through this API are never encrypted, so API-first
workflows see plaintext throughout.

## Generating AI responses

Threads + messages are storage only. To generate a response:

1. Persist the user's turn with `POST /v1/threads/{id}/messages`
2. Read the thread's messages or assemble your own context
3. Call `POST /v1/chat/completions` with the messages inline — this
   runs the RAG chain and returns the assistant's reply
4. Persist the assistant's reply back to the thread with another
   `POST /v1/threads/{id}/messages` (role=assistant)

The OpenAI **Runs API** (`POST /v1/threads/{id}/runs`) that automates
this loop is not implemented yet — it's on the roadmap once client
demand is clear.

## Rate limits

20 req/min across threads + messages endpoints (default tier).
