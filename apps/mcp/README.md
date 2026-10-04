# Ragen MCP Server

Query a Ragen knowledge base from any MCP client — Claude Desktop, Cursor, or
your own agent. Chat with a Ragen assistant, search its documents, or list the
assistants your API key can reach.

[Ragen](https://github.com/webamigos/RagenAI) is an open-source (Apache 2.0)
RAG platform that turns company documents into an AI assistant answering from
your own data, on your own servers. This server is a thin adapter: it owns no
business logic and forwards every tool call to the Ragen API
([ADR-36](../../docs/adrs/36-mcp-server-exposes-chat-via-apps-api.md)).

**It needs a Ragen installation to talk to.** There is no hosted public Ragen
API — point the server at the API (`apps/api`) of an instance you run. See the
[self-hosting guide](https://docs.ragen.ai/docs/self-hosting).

## Tools

| Tool | What it does |
|---|---|
| `ragen_chat` | Send a message to a Ragen assistant and get an answer grounded in its organization's knowledge base |
| `ragen_search_knowledge_base` | Return the most relevant document chunks for a query, without generating an answer — for when your own client does the reasoning |
| `ragen_list_assistants` | List the assistants this API key can reach, with their IDs |

`assistant_id` is optional everywhere: a key scoped to a single assistant uses
that one, and naming an assistant the key is not scoped to is refused.

## Transports

**Streamable HTTP** (the default) serves MCP at `/mcp` and a health check at
`/health`, on one port. Every client sends its own key as
`Authorization: Bearer sk-<keyId>.<secret>`; a connection without one is
refused with a 401. This is how the server is deployed beside a Ragen
instance — the client setup is on the
[MCP Server page](https://docs.ragen.ai/api-reference/mcp-server) of the docs.

**stdio** (`RAGEN_MCP_TRANSPORT=stdio`) is for a client that starts the server
as a child process. There is no request to carry a header, so the key comes
from `RAGEN_API_KEY`. Without one the server still starts and lists its tools,
and each tool call answers with an error naming the variable to set. Logs go
to stderr, since stdout carries the protocol.

```json
{
  "mcpServers": {
    "ragen": {
      "command": "node",
      "args": ["/path/to/RagenAI/apps/mcp/dist/index.js"],
      "env": {
        "TARGET_ENV": "local",
        "RAGEN_MCP_TRANSPORT": "stdio",
        "RAGEN_API_URL": "https://ragen-api.example.com",
        "RAGEN_API_KEY": "sk-<keyId>.<secret>"
      }
    }
  }
}
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `TARGET_ENV` | — (required) | `local` on a workstation. A deployed environment (`staging`, `production`) also requires `RAGEN_API_URL` |
| `RAGEN_API_URL` | `http://localhost:3001` | Base URL of the Ragen API the tools call |
| `RAGEN_MCP_TRANSPORT` | `http` | `http` or `stdio` |
| `RAGEN_API_KEY` | — | The key used over stdio. Ignored over HTTP, where each client sends its own |
| `RAGEN_MCP_PORT` | `3300` | HTTP port. Falls back to `PORT`, which is what a single-container host injects |

The contract is [`src/config/env.ts`](src/config/env.ts), validated at boot
([ADR-37](../../docs/adrs/37-typed-env-contract-not-a-config-file.md)): a bad
value stops the server with one readable report instead of failing on the
first tool call. Telemetry (`OTEL_EXPORTER_OTLP_ENDPOINT`) is optional and off
unless set.

## Development

From the repository root — one `.env.local` there serves every app:

```bash
npm run dev --workspace=@ragenai/mcp
```

| Command (in `apps/mcp`) | Purpose |
|---|---|
| `npm run dev` | Start in watch mode (tsx), on :3300 |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Build, then run the compiled server |
| `npm run test` | Run the Vitest suite |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Type-check without emitting |
| `npm run smoke -- <url>` | Check a running server end to end — see below |

`npm run build` needs `@ragenai/observability` and `@ragenai/env` built first;
`npx turbo run build --filter=@ragenai/mcp` does that in order.

**Docker** — the build context is the repository root, because the lockfile
lives there:

```bash
docker build -f apps/mcp/Dockerfile -t ragen-mcp .
docker run -p 3300:3300 -e TARGET_ENV=local -e RAGEN_API_URL=http://host.docker.internal:3001 ragen-mcp
```

## Checking a deployment

`/health` says the MCP server is up. It does not say whether the tools work:
those depend on the Ragen API, which depends on its token vault and its
vector store. When any of them is misconfigured, the tools still get listed
and every call fails. The smoke test checks one layer per step and stops at
the first failure, with a hint naming the service and the variable to check:

```bash
read -s RAGEN_API_KEY && export RAGEN_API_KEY
npm run smoke --workspace=@ragenai/mcp -- https://ragen-mcp.example.com/mcp
```

```text
✓ initialize: Ragen 2.37.0
✓ tools/list: ragen_chat, ragen_list_assistants, ragen_search_knowledge_base
✓ ragen_list_assistants: 2 assistant(s): Support Bot, Default Assistant
✗ ragen_search_knowledge_base: status 500: Internal Server Error
  → The Ragen API failed. Check its logs: an unreachable vector store (QDRANT_URL on the api service), token vault or model provider is the usual cause.
```

| Step | What a pass proves |
|---|---|
| `initialize` | The server is reachable at this URL and accepts the header |
| `tools/list` | It serves the three tools. No key has been checked yet |
| `ragen_list_assistants` | The key is valid, so the API and its token vault work |
| `ragen_search_knowledge_base` | Retrieval works, so the vector store does |
| `ragen_chat` | A model answers too. Runs only with `--chat "<message>"`, because it spends tokens |

The key is read from `RAGEN_API_KEY`, never from an argument, so it stays
out of shell history. Without it the last steps are skipped and the first
two still run. `--query "<text>"` changes the search. The exit code is 1
when a step fails, so the script can gate a deployment.

## Layout

| Path | |
|---|---|
| `src/index.ts` | Entry point: parses the environment, registers the tools, starts the chosen transport |
| `src/auth.ts` | The Bearer check over HTTP; `RAGEN_API_KEY` over stdio |
| `src/tools/` | One file per tool, plus the shared missing-key result |
| `src/client/ragen-api-client.ts` | Calls to the Ragen API, one error parser per endpoint |
| `src/transport.ts` | Which transport is running — read before anything logs |
| `src/instrument.ts` | OpenTelemetry bootstrap; must stay the first import |
| `src/smoke/` | The smoke test (`npm run smoke`). Not part of the build |
