# ADR-36: `apps/mcp` exposes Ragen's own chat as an MCP tool, as a thin adapter over `apps/api`

**Status:** Accepted.
**Date:** 2026-09-05

## Context

ADR-05 and ADR-32 cover MCP in one direction only: Ragen *consuming* other
services' tools during chat (Google, HubSpot, ClickUp, Slack — via
`ragen-connectors`, the renamed `ragen-mcp`). Nothing in this repository
covers the reverse direction — an external MCP client (Claude Desktop,
Cursor, another agent) talking *to* Ragen, so that a Ragen assistant becomes
a tool call rather than a chat window.

Two decisions were needed before writing any code: where this lives, and
what it's allowed to touch.

**Where it lives.** `apps/*` is an existing npm workspace glob; a new
`apps/mcp` needs no registration in `turbo.json` or `.github/workflows/ci.yml`
beyond the workspace's own `package.json` scripts (`build`/`lint`/`test`/
`typecheck`), confirmed by running them — turbo auto-discovers it. The only
manual step was one line in `lint-staged.config.mjs`, matching every other
workspace's entry.

**What it's allowed to touch.** This server exposes Ragen's *own* capability
— chat — not a third-party API. `apps/api` already owns that capability as a
public, authenticated endpoint (`POST /v1/chat`, opaque API keys, ADR-13).
The repository's own most-repeated bug (`apps/api/AGENTS.md`'s "Ported
RAG-engine libs" section) is exactly this shape of mistake: a second copy of
business logic that was supposed to be thin and stopped being thin. Giving
`apps/mcp` its own Prisma client and re-deriving assistant lookup, rate
limiting or the RAG chain would be that mistake a third time.

## Decision

`apps/mcp` is a thin protocol adapter: `fastmcp` + `hono`, no database
access, no business logic. It has exactly one MCP tool, `ragen_chat`, and its
`execute` function does one thing — forward the call to `apps/api`'s
`POST /v1/chat` with the caller's own Ragen API key, and translate the
response back into the tool's return shape.

**Auth is the caller's existing Ragen API key, not a new credential.**
`fastmcp`'s `authenticate` hook (run once per MCP session, its documented
pattern for "let clients supply their own API key via headers" —
`node_modules/fastmcp/README.md`, "Passing Headers Through Context") reads
the `Authorization` header off the incoming connection and threads it through
every tool call's `session`. `apps/mcp` only checks that *something
Bearer-shaped* was supplied — whether it's a real, active key is `apps/api`'s
`ApiKeyGuard`'s job, checked exactly once, not duplicated here.

**Tech stack matches `ragen-connectors`, not `@ai-sdk/mcp`.** `@ai-sdk/mcp`
(already a dependency of both `apps/web` and `apps/api`) is what this
repository uses to *consume* other MCP servers — an MCP client library, not a
server-building one. `ragen-connectors`' four services (google/clickup/
hubspot/rejestrio) all build their MCP servers with `fastmcp` + `hono`; this
is that same, already-proven pattern, reused for consistency rather than
introducing a second way to build an MCP server in this ecosystem.

**Two separate listeners**, matching `ragen-connectors`' own convention:
a small Hono app for `/health` (`PORT`, default 3300), and FastMCP's own
`httpStream` transport for the actual MCP protocol (`PORT + 1000`, i.e.
4300). Unlike the `ragen-connectors` services, there is no OAuth callback to
serve — the caller already has a Ragen API key — so the Hono app here is
health-only.

**Scope is chat only, for now.** Assistants (list/create), files (upload) and
threads (read history) are the same `apps/api` public surface and would
follow the identical thin-adapter pattern; adding them is new tools in
`src/tools/`, not a new architecture. Deliberately not built yet — no
concrete need for them as MCP tools has come up, and the surface is easy to
extend when one does.

## Consequences

**Good.** No new business logic to keep in sync with `apps/api`'s. No new
auth mechanism — a Ragen API key already documented in
`apps/docs/docs/api-reference/` works here unchanged. Adding a capability
later is additive (one new tool file), not a rearchitecture.

**Real gap found by testing this live, not by reading the code.** `apps/api`
does not return one consistent error shape across all its failure modes.
`ChatService`'s own errors are JSON with an `error` field (404/429) or plain
text (its generic 500 catch-all) — but a failure inside `ApiKeyGuard`
*before* the controller runs (confirmed live: the token vault was
unreachable during testing) goes through Nest's own exception filter
instead, which is JSON shaped `{ message }`, a third shape. `apps/mcp`'s
client (`src/client/ragen-api-client.ts`) now tries both field names before
falling back to the raw body — worth `apps/api` fixing at the source
eventually (one consistent error envelope), but out of scope for this ADR.

**Not done.** No CI/CD wiring beyond what auto-discovery already covers, and
no `apps/mcp/.env.local` committed (matches every other app — copy
`.env.example`, or the root `.env.local`, per existing convention). Real
external-MCP-client testing (Claude Desktop, Cursor) against a deployed
instance has not happened yet — verified so far via the official
`@modelcontextprotocol/sdk` client library directly, real running local
`apps/mcp` + `apps/api` + `ragen-token-vault`, and a real API key created for
the test (not a mock) — a client discovering and calling the tool through
an actual desktop app is the next real-world check once one is deployed.
