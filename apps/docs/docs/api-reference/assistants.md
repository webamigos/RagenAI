---
sidebar_position: 5
sidebar_label: Assistants
---

# Assistants

OpenAI-compatible Assistants API. In Ragen, an assistant is a
**project** — a named container with its own knowledge base, settings,
and instructions. The Assistants API is a thin CRUD surface over your
projects.

```
POST   /v1/assistants
GET    /v1/assistants
GET    /v1/assistants/{id}
POST   /v1/assistants/{id}        (OpenAI convention — modify)
PATCH  /v1/assistants/{id}        (REST alias — same as POST)
DELETE /v1/assistants/{id}
```

## Mapping

| OpenAI field | Ragen | Notes |
|---|---|---|
| `id` | `asst-<projectId>` | — |
| `name` | project title | |
| `instructions` | per-project system prompt | Merged on top of org default |
| `model` | — | Read-through from org default; per-project override not persisted yet |
| `temperature` | — | Same |
| `tools` | `[{type: "file_search"}]` | RAG is always on |
| `description`, `metadata`, `tool_resources`, `top_p`, `response_format` | — | Accepted-but-ignored for SDK compatibility; returned as constants |

## Authentication

```
Authorization: Bearer YOUR_API_KEY
```

Assistants are scoped to the **organization** the key belongs to —
not the key's default project. `client.assistants.list()` returns
every assistant your org owns, matching OpenAI's behaviour.

## Create an assistant

`POST /v1/assistants`

Body:

| Field | Type | Required |
|---|---|---|
| `name` | string | Yes |
| `instructions` | string | No |
| `model` | string | No (accepted, ignored) |
| `temperature` | 0–2 | No (accepted, ignored) |
| `description` | string | No (accepted, ignored) |
| `metadata` | object | No (accepted, ignored) |

```python
import os
from openai import OpenAI
client = OpenAI(base_url=os.environ["RAGEN_BASE_URL"], api_key="YOUR_API_KEY")

a = client.beta.assistants.create(
    name="Support Bot",
    instructions="Respond concisely. If unsure, say so.",
)
print(a.id)
```

## List, retrieve, modify

```python
for a in client.beta.assistants.list():
    print(a.id, a.name)

a = client.beta.assistants.retrieve("asst-abc")
a = client.beta.assistants.update("asst-abc", name="Support Bot v2")
```

Modify accepts the same fields as create; every field is optional.
Passing `instructions: ""` clears them.

## Delete

`DELETE /v1/assistants/{id}`

Returns:

```json
{ "id": "asst-abc", "object": "assistant.deleted", "deleted": true }
```

**Self-delete protection**: attempting to delete the assistant bound
to the API key's own default project returns:

```
400 invalid_request_error
"Cannot delete the assistant this API key is bound to. Rotate the key first, then retry."
```

This prevents accidentally revoking your own chat/files context.
Rotate or issue a new key first if you really need to delete the
bound project.

## Rate limits

20 req/min across all assistant endpoints (default tier).
