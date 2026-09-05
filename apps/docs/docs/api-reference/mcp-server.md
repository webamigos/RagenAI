---
sidebar_position: 7
sidebar_label: MCP Server
---

# MCP Server

Talk to a Ragen assistant from any [MCP](https://modelcontextprotocol.io)
client — Claude Desktop, Cursor, or your own agent — instead of calling the
[Chat API](./chat.md) directly. Same underlying capability, a different
protocol: `apps/mcp` is a thin adapter that forwards your tool call straight
to `POST /v1/chat` and returns the answer.

This is the reverse of `docs/mcp-integrations.md` (which lets a Ragen
assistant call *other* services' tools mid-conversation) — here, an external
client calls **into** Ragen.

## Connecting

Point your MCP client at the server's Streamable HTTP endpoint:

```
$RAGEN_MCP_URL/mcp
```

Authenticate with the same API key you'd use for the REST API — see
[Chat API → Authentication](./chat.md#authentication) for how to create one.
Send it as a Bearer token on the connection, the same as any other Ragen API
request:

```
Authorization: Bearer YOUR_API_KEY
```

A connection with no `Authorization` header, or one that isn't
`Bearer`-prefixed, is rejected with `401` before any tool call is possible.
Whether the key itself is valid and active is checked per call, by the same
`ApiKeyGuard` the REST API uses — a deactivated or malformed key fails the
same way it would calling `/v1/chat` directly.

## Tools

### `ragen_chat`

Send a message to a Ragen assistant and get its answer.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `assistant_id` | `string` | Yes | The assistant (project) ID to send the message to. |
| `message` | `string` | Yes | The message to send. |
| `context` | `string` | No | Additional context (e.g. the content of the page the caller is on). |
| `reasoning_effort` | `"low" \| "medium" \| "high"` | No | OpenAI-style reasoning effort — only honored by reasoning-capable models. |

Returns a JSON string:

```json
{ "success": true, "text": "Based on your documentation, ..." }
```

or, on failure:

```json
{ "success": false, "status": 404, "error": "Assistant not found" }
```

Always non-streaming: an MCP tool call returns one result, not a
Server-Sent Events stream, so there is nothing to forward a partial answer
to. If you need token-by-token streaming, call the [Chat API](./chat.md)
directly with `stream: true`.

### `ragen_list_assistants`

List the assistants available to the caller's organization — use this to
find an `assistant_id` to pass to `ragen_chat`. Takes no parameters.

Scoping is automatic: this calls the same `GET /v1/assistants` the REST API
uses, which already returns only the assistants the API key's organization
owns (see [Assistants → Authentication](./assistants.md#authentication)) —
there is no separate "does this user have access" check to configure.

Returns a JSON string:

```json
{
  "success": true,
  "assistants": [
    { "id": "asst-abc123", "name": "Support Bot" },
    { "id": "asst-def456", "name": "Sales Bot" }
  ]
}
```

or, on failure, the same `{ success: false, status, error }` shape as
`ragen_chat`.

## Scope

`ragen_chat` and `ragen_list_assistants` are the only tools today. Creating
assistants, files (upload), and threads (read history) are the same public
API surface and would follow the identical pattern — see
`docs/adrs/36-mcp-server-exposes-chat-via-apps-api.md` if you're adding one.
