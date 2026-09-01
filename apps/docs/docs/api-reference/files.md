---
sidebar_position: 4
sidebar_label: Files
---

# Files

OpenAI-compatible Files API. Uploads documents into the project
knowledge base, where the worker parses + embeds + indexes them so
they're immediately available to the [Chat Completions](./chat-completions)
endpoint.

```
POST   /v1/files
GET    /v1/files
GET    /v1/files/{id}
DELETE /v1/files/{id}
```

## Authentication

```
Authorization: Bearer YOUR_API_KEY
```

Files are scoped to the **project** the API key is bound to.

## Upload a file

`POST /v1/files`

Multipart form body:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes | Document to upload. Supported: PDF, DOCX, PPTX, XLSX, CSV, TXT, MD, EPUB, SRT, images. |
| `purpose` | string | No | Accepts `knowledge_base` (default) or `assistants` (OpenAI alias — treated identically). |

**Response** — OpenAI `file` object:

```json
{
  "id": "file-abc123",
  "object": "file",
  "bytes": 12345,
  "created_at": 1744664400,
  "filename": "doc.pdf",
  "purpose": "knowledge_base",
  "status": "uploaded",
  "status_details": null
}
```

The response returns **immediately** with `status: "uploaded"`. The
parse + embed pipeline runs asynchronously. Poll `GET /v1/files/{id}`
for status transitions:

| `status` | Meaning |
|----------|---------|
| `uploaded` | File is stored; worker hasn't finished (parsing or embedding) |
| `processed` | Parse + embed both completed; available to chat completions |
| `error` | Parsing or embedding failed |

### Examples

```python
from openai import OpenAI
client = OpenAI(base_url=os.environ["RAGEN_BASE_URL"], api_key="YOUR_API_KEY")

with open("handbook.pdf", "rb") as f:
    file = client.files.create(file=f, purpose="assistants")
print(file.id, file.status)
```

```bash
curl -X POST $RAGEN_BASE_URL/files \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "file=@handbook.pdf" \
  -F "purpose=knowledge_base"
```

## List files

`GET /v1/files`

| Query param | Description |
|-------------|-------------|
| `limit` | 1–100, default 20 |
| `after` | Cursor (OpenAI file id) — returns files *after* the given one |
| `purpose` | Filter by purpose |

Returns `{ "object": "list", "data": [...] }` with OpenAI `file`
objects.

```python
for f in client.files.list():
    print(f.id, f.filename, f.status)
```

## Retrieve a file

`GET /v1/files/{id}`

Returns the OpenAI `file` object or `404`.

## Delete a file

`DELETE /v1/files/{id}`

Removes the file entirely: the DB row, the S3 object, its thumbnail
(if any), any attached `UserDocument`, and all of its embeddings from
the vector store. External cleanup is best-effort — a transient
S3/vector-store blip won't block the DB delete.

```json
{ "id": "file-abc123", "object": "file", "deleted": true }
```

## Error responses

Standard OpenAI error envelope. See
[Chat Completions > Error responses](./chat-completions#error-responses)
for the full type mapping.

Common cases:

| Status | `type` | Cause |
|--------|--------|-------|
| 400 | `invalid_request_error` | Missing `file`, unsupported `purpose`, validation failure |
| 401 | `authentication_error` | Missing/invalid API key |
| 404 | `not_found_error` | File doesn't exist or isn't in the caller's project |
| 413 | `invalid_request_error` | File exceeds per-file / org / project storage limit |
| 429 | `rate_limit_error` | Uploads are throttled to 10 req/min |
| 502 | `api_error` | S3 or Temporal failure mid-upload |

## Rate limits

| Endpoint | Limit |
|----------|-------|
| `POST /v1/files` | 10 req/min (expensive tier) |
| `GET /v1/files` + retrieve + delete | 20 req/min (default tier) |
