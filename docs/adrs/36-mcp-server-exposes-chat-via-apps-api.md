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

`apps/mcp` is a thin protocol adapter: `fastmcp`, no database access, no
business logic. Each tool's `execute` function does one thing —
forward the call to the matching `apps/api` endpoint with the caller's own
Ragen API key, and translate the response back into the tool's return
shape. Two tools today: `ragen_chat` (`POST /v1/chat`) and
`ragen_list_assistants` (`GET /v1/assistants`) — the latter needed no extra
"does this user have access" logic in `apps/mcp` at all, since `apps/api`
already scopes that list to the API key's own organization.

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
uses the same, already-proven `fastmcp` for consistency rather than
introducing a second way to build an MCP server in this ecosystem.

**A single listener**, unlike `ragen-connectors`' own convention of a
separate Hono app for `/health` plus FastMCP on `PORT + 1000`.
`ragen-connectors`' callers (apps/web) reach those services over Railway's
*private* network, which isn't limited to one port — but apps/mcp's callers
are external MCP clients on the public internet, reachable only through
Railway's public domain, which forwards only to the container's one routed
port. A two-port split would have left `/mcp` unreachable in production
while `/health` kept passing (caught by live-testing the actual Railway
routing behavior, not by local testing, where both ports are equally
reachable). `apps/mcp` instead runs FastMCP's own `httpStream` transport
directly on `PORT`, using its built-in `/health` endpoint (enabled by
default) — no Hono, no OAuth callback to serve either, since the caller
already has a Ragen API key.

Consolidating onto one listener surfaced a second, unrelated FastMCP bug:
its own handler for any request outside `/mcp` (the path that serves
`/health`) builds a base URL as `` `http://${host}` `` — with
`httpStream.host: '::'` (the dual-stack bind the two-port version used)
that's the invalid `http://::`, and `new URL()` throws, crashing the whole
process on the very first health check. Found live, the same way as the
port-routing issue — a local `curl /health` crashed the running server.
Fixed by binding to `0.0.0.0` instead, which still listens on every IPv4
interface (what Docker/Railway route to) without hitting FastMCP's
IPv6-any-address bug.

**Scope is chat + listing assistants, for now.** Creating assistants, files
(upload) and threads (read history) are the same `apps/api` public surface
and would follow the identical thin-adapter pattern; adding them is new
tools in `src/tools/`, not a new architecture. Deliberately not built yet —
no concrete need for them as MCP tools has come up, and the surface is easy
to extend when one does.

## Consequences

**Good.** No new business logic to keep in sync with `apps/api`'s. No new
auth mechanism — a Ragen API key already documented in
`apps/docs/docs/api-reference/` works here unchanged. Adding a capability
later is additive (one new tool file), not a rearchitecture.

**Real gap found by testing this live, not by reading the code.** `apps/api`
does not return one consistent error shape across all its failure modes —
and it's a different shape *per controller*, not just per status code.
`ChatService`'s own errors are JSON with an `error` field (404/429) or plain
text (its generic 500 catch-all); a failure inside `ApiKeyGuard` *before*
either controller runs (confirmed live: the token vault was unreachable
during testing) goes through Nest's own exception filter instead, JSON
shaped `{ message }`; `AssistantsController` runs entirely behind
`OpenAiExceptionFilter`, so its errors are consistently the OpenAI-style
`{ error: { message, type, code, param } }` — confirmed live with a real
`401` from an intentionally-invalid key. `apps/mcp`'s client
(`src/client/ragen-api-client.ts`) has one error parser per endpoint,
matching that endpoint's real shape, rather than one parser guessing at all
of them — worth `apps/api` consolidating at the source eventually, but out
of scope for this ADR.

**Not done.** No CI/CD wiring beyond what auto-discovery already covers, and
no `apps/mcp/.env.local` committed (matches every other app — copy
`.env.example`, or the root `.env.local`, per existing convention). Real
external-MCP-client testing (Claude Desktop, Cursor) against a deployed
instance has not happened yet — verified so far via the official
`@modelcontextprotocol/sdk` client library directly, real running local
`apps/mcp` + `apps/api` + `ragen-token-vault`, and a real API key created for
the test (not a mock) — a client discovering and calling the tool through
an actual desktop app is the next real-world check once one is deployed.

**Both tools now confirmed live, success path included.** Both
`ragen_list_assistants` and `ragen_chat` were re-verified end-to-end via the
real MCP client — connect, list tools, call each tool, get a genuine
successful result (a real assistant list; a real generated chat answer) —
not just the earlier rejection-path checks. This needed two unrelated local
environment fixes, neither specific to `apps/mcp`: `ragen-token-vault` was
depending on a native Postgres instead of its own `docker-compose.yml`
Postgres (now fixed — its `.env.local` points at that container's port,
migrations applied); and the local dev DB's test org had a corrupted
(non-AES-ciphertext) `litellm_key_token`/`litellmApiKey` on one team and on
`OrganizationSettings`, which crashed `apps/api`'s `decryptApiKey` on *any*
`/v1/chat` call for that org — confirmed unrelated to `apps/mcp` by
reproducing the identical `500` calling `/v1/chat` directly with no MCP
involved at all, then clearing both corrupted values in the local dev DB.

**A third tool, added the same way this ADR anticipated.** `ragen_search_knowledge_base`
forwards to a new `POST /v1/search` on `apps/api` — retrieval only, no answer
generation — returning the same `combineDocuments()`-rendered, PII-redacted
context block the chat endpoint feeds to its own answer model, plus the
source file ids. Motivation: an *external* MCP client with its own AI (not
Ragen's) can ground its own reasoning in a Ragen knowledge base without going
through Ragen's chat model at all — the concrete case this came up for was an
external CRM/ERP-style framework whose assistants already speak MCP and
wanted retrieval, not generation. `SearchService` mirrors `ChatService`'s
assistant resolution and rate limiting, then calls a new
`InitializeBasicRagService.buildRetrievalContext()` (the search-only sibling
of `initializeRagChain()` — same vector-store/metadata-filter construction,
shared via a private `buildVectorStoreAndFilter()` helper so the two can't
drift) instead of assembling a full chain. `SearchController` has no
`@UseFilters` override, so unlike `/v1/chat` it produces exactly one error
shape (the global `ApiExceptionFilter`'s `{ message }`) — deliberately not
matching `/v1/chat`'s three, per the gap noted above.
