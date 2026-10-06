# ADR-53: MCP clients sign in as a Ragen user through OAuth

**Status:** Accepted. Implements [the MCP sign-in specification](../specs/2026-10-05-mcp-sign-in-with-oauth.md); demo interoperability remains a rollout gate.
**Date:** 2026-10-06

## Context

ADR-36 forwards a caller's API key to `apps/api`. Browser-based MCP clients
also need a sign-in flow that grants access without copying a key. Access must
follow the user's current organization membership and document permissions,
including changes made after authorization. A web session must not become an
API credential, and the MCP service must remain a thin adapter without Prisma.

## Decision

Better Auth in `apps/web` is the authorization server. Its official MCP preset,
OAuth provider and JWT plugin own dynamic client registration, PKCE code
exchange, token rotation and JWKS. The existing sign-in resumes the provider's
signed query. A fresh authorization always asks for a workspace and optionally
an assistant, then requires consent. The server validates the selection against
current membership, feature availability and assistant permissions before
minting or refreshing a token. A new workspace grant replaces older scopes for
the same user and client.

`apps/mcp` is a stateless Streamable HTTP resource server. It publishes protected
resource metadata and verifies each request's JWT against the web authorization
server's JWKS, issuer, public MCP audience, expiry and `mcp:read` scope. It
rejects DPoP-bound tokens because this resource server supports bearer tokens.
Access tokens last 15 minutes; refresh tokens last 30 days and rotate without a
reuse interval. Cached JWKS support bounded key rotation discovery.

The external access token stops at MCP. Every tool call carries a fresh,
30-second HMAC assertion to `apps/api`, signed with `MCP_SERVICE_SECRET`, a
separate secret from `SESSION_AUTH_SECRET`. The assertion contains user,
organization, client, token id and optional assistant scope. Only chat, search
and assistant listing accept it. `McpServiceGuard` checks live user bans,
membership, organization feature availability and assistant permissions, then
existing retrieval permissions and usage limits apply. These calls share the
user's rate-limit bucket. API keys continue through the original API-key guard;
stdio remains API-key-only.

Disconnect deletes the user's client consents and access/refresh token rows in
one adapter transaction. Removal, leaving and organization deletion revoke
that organization's grants; banning a user revokes all their grants. The admin
app registers only the provider schema and a server-only revocation endpoint,
not a second OAuth issuer. Already-issued JWTs can remain cryptographically
valid until expiry after Disconnect; live bans, removal and permission changes
are enforced immediately at the API guard. Connected apps show scope and last
accepted use without exposing tokens.

Both gates default off: `MCP_OAUTH_ENABLED=false` for deployment and
`mcpOAuth=false` for each organization. Enabling OAuth requires the public HTTPS
`/mcp` resource URL, the public Better Auth origin and the independent service
secret shared by MCP and API. HTTP is allowed only for local loopback testing.

## Consequences

The caller can sign in and disconnect without managing an API key. The service
continues to own no database or retrieval logic, but now verifies OAuth
credentials and signs internal assertions. The API remains the final live
permission boundary rather than relying on token claims as a permission cache.

The provider owns its schema and protocol; migrations and adapter schema must
stay aligned with the installed Better Auth version. Revocation uses adapter
transactions, since deleting a consent alone does not delete refresh tokens.
A leaked JWT has a bounded 15-minute lifetime after Disconnect, whereas live
account restrictions take effect on the next tool call. Client interoperability
must be checked with MCP Inspector, Claude Code and the demo claude.ai connector
before enabling the gates for users.
