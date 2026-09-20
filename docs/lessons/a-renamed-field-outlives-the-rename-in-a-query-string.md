---
title: 'A renamed field outlives the rename wherever it is a string — a query parameter, and the branch that never got the second edit'
modules: ['web', 'api', 'admin']
areas: ['architecture', 'integration']
topics:
  [
    'expand-contract',
    'renaming',
    'ported-libs',
    'ssrf',
    'connectors',
    'false-green',
    'adr-21',
    'adr-52',
  ]
---

# A renamed field outlives the rename wherever it is a string

**Context**: ADR-52 turned the connector catalogue from a Postgres enum into rows, which meant renaming `McpConnector.provider` to `providerSlug` across three independently deployed apps. Five migrations, four expand/contract steps, `npm run verify` green across 31 workspaces, and eleven CI checks green on the PR. A review pass afterwards found eight defects, and every one of them was in a place the compiler does not reach.

**Problem**: four shapes, each invisible to typecheck:

1. **A query string is not a type.** The connect button sent `providerSlug=` while the route read `provider=`. Every `external_mcp` connect returned 400, and the card did `setLoading(false); return;` without reading the body — a button that did nothing and said nothing. Renaming a field renames it in TypeScript; it does not rename it in a `URLSearchParams`, a header name, a JSON key over HTTP or a migration's SQL.

2. **Two copies of a file drift at the branch level, not the file level.** `apps/api/src/mcp/client.ts` is a copy of apps/web's (ADR-21). apps/web's `external_mcp` branch was moved onto the SSRF-guarded transport; apps/api's kept a bare `createMCPClient`, so an operator-typed URL was dialled there with no address check at all. Both apps compiled. Both suites passed. Neither suite had a test for "this branch goes through the guard", which is why the divergence was free.

3. **A defensive fallback can be the hole.** `definitions?.[slug] ?? getProviderDefinition(slug)` reads as belt and braces. It is the opposite: a compiled-in manifest carries no `addressGuard`, so falling back turned the policy *off* for exactly the connectors that need it — the ones whose URL somebody typed.

4. **A validator can reject what the UI cannot show.** The catalogue form renders its scopes field only inside the `EXTERNAL_MCP` block, and the validator refuses scopes on any other auth type. Type scopes, switch type, save: rejected, with the message bound to a field no longer on screen.

**Rule**: after a rename that crosses a process boundary, grep for the **old and the new name as strings**, not just as identifiers — query parameters, headers, JSON keys, vault paths, allowlists, seed data. A reader and a writer that disagree compile perfectly.

For the copies: a fix in apps/web's `src/` needs the same edit in `apps/api/src/`, and `apps/api/AGENTS.md` says so — but "the same edit" means every branch of it, and the only thing that holds two copies together is a test each side runs. When an invariant spans both (an address policy, an auth shape, a credential source), write the test twice, named the same on both sides, and say in it why the pair exists. `connect-is-guarded` is that pair here.

And when a form validates a field it conditionally renders, make the transition clear the field rather than leaving the rule to fire against something invisible — keep the validator as the guard for the action, which a form is not the only way to reach.

**Applies to**: any expand/contract rename (ADR-52's `providerSlug` was one; the next one will be too), anything edited in both `apps/web/src` and `apps/api/src`, and any admin form whose fields depend on a select.
