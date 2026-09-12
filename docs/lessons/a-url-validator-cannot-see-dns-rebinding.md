---
title: 'A URL validator cannot see DNS rebinding — the check has to run where the socket opens, and the library has to let you in'
modules: ['api', 'connectors', 'mcp']
areas: ['security']
topics: ['ssrf', 'dns-rebinding', 'undici', 'mcp', 'ai-sdk', 'connectors']
---

# A URL validator cannot see DNS rebinding — the check has to run where the socket opens, and the library has to let you in

**Context**: `apps/api/src/connectors/site-url.ts` normalizes the shop URL a customer types when registering a custom-header MCP connector (WooCommerce today). It enforces `https:`, strips trailing slashes and rejects embedded credentials. Two outbound paths then fetch that URL: `ConnectorsService.testCustomHeaderConnection` (the "test connection" button) and `createMcpToolsFromConnectors` in `apps/api/src/mcp/client.ts` (every chat turn that loads connector tools).

**Problem**: a URL validator only sees the string. `https://shop.example.com/` is a perfectly ordinary public hostname at parse time and can resolve to `169.254.169.254` at connect time — the attacker owns the DNS record, so nothing in the URL betrays it. Rejecting literal private addresses at parse time narrows nothing that matters; the interesting attack never writes one down. Worse, even a correct pre-flight `dns.lookup()` followed by `fetch(url)` is exploitable: the second resolution can answer differently from the first (TOCTOU), and redirects resolve names the check never saw.

The obstacle is that the fix has to be injected into a library that offers no seam. `@ai-sdk/mcp`'s `MCPTransportConfig` shorthand — `{ type: 'http', url, headers }` — accepts no `fetch` and no dispatcher, and the package exports the `MCPTransport` *interface* but no transport class. The three ways out are not equal: reimplementing `MCPTransport` means forking ~290 lines of Streamable-HTTP transport (SSE reconnection, resumption tokens, OAuth retry) and owning its protocol drift; `undici`'s `setGlobalDispatcher` is process-wide, and apps/api legitimately fetches loopback (LiteLLM on 4000, ragen-token-vault on 3100, apps/web's internal API), so a global guard breaks the app to protect one code path.

**Rule**: an SSRF guard on a user-supplied URL belongs at the connect boundary, and it must **pin** what it validated. `undici`'s `Agent({ connect: { lookup } })` does both: the wrapped resolver validates every address the resolver returned and hands back only vetted ones, and undici connects to exactly those — so there is no second lookup to race, and redirects travel through the same dispatcher. Reject the whole answer if *any* address is private rather than filtering the private ones out: with `autoSelectFamily` Node races candidates, so a mixed public+private answer still reaches the private one. Keep the parse-time check as well — it gives the user an actionable message — but treat it as a message, not a defence. When the library has no `fetch` hook, look for a *different transport that already accepts one* before forking the one you have: `@modelcontextprotocol/sdk`'s `StreamableHTTPClientTransport` takes a `fetch` and satisfies `@ai-sdk/mcp`'s `MCPTransport` structurally, with no cast. Scope the dispatcher to the guarded call, never globally.

Two things that cost time and will again:

- **`instanceof` is not a reliable way to recognise an error through a `cause` chain.** A wrapper that does not recognise the value as an `Error` rebuilds it from `String(error)`, keeping only `"Name: message"` and dropping the prototype. Jest runs modules in a vm sandbox, so the error crosses a realm boundary and the suite hits this while production does not — the same test passes as a plain `node` script and fails under Jest, which reads like a bug in the guard. Match on the name and the stringified form too.
- **The load-bearing assertion is "no socket was opened"**, not "the call rejected". A guard that rejects *after* connecting has already reached the internal service. Bind a real server, count `connection` events, and assert zero.

**Applies to**: `apps/api/src/connectors/{private-address,guarded-fetch,guarded-mcp-transport}.ts` and the two call sites above. Fixed `MCP_*_SERVER_URL` endpoints are deployer-controlled and deliberately *not* guarded — they may be loopback on purpose. Any future outbound fetch of a customer-supplied URL (webhooks, an OAuth discovery document, a site-verification callback) needs the same treatment.
