# ADR-05: MCP Integration Strategy

**Status:** Accepted
**Date:** 2026-03-01

## Context

The application needs to integrate with external services (Google Calendar, Analytics, Ads, Drive, HubSpot, ClickUp, Gmail, Slack) as AI tools available during chat sessions. These integrations require OAuth token management, tool discovery, and runtime execution.

## Decision

Use **MCP (Model Context Protocol)** with a hybrid approach:

### Own MCP Server (`ragen-mcp`)
- FastMCP + Hono TypeScript server for Google services (Calendar, Analytics, Ads, Drive)
- Grouped by auth domain — single Google OAuth covers all four services
- Deployed on Railway (MCP on port 9001, HTTP/OAuth on port 8001)
- Per-user OAuth with PKCE, tokens stored in Ragen Token Vault

> **Update 2026-09-05:** the repository was renamed on GitHub from `ragen-mcp`
> to `ragen-connectors` (`github.com/webamigos/ragen-connectors`). Same
> service, same architecture described above — only the repo/service name
> changed. Living reference docs (`docs/mcp-integrations.md`,
> `docs/companion-services.md`, `docs/token-vault.md`) use the new name; this
> ADR's original text is left as written for historical accuracy.

### Third-Party MCP Servers (Claude AI)
- HubSpot, ClickUp, Gmail — hosted by Anthropic
- Full OAuth via MCP server (`external_mcp` auth type)

### Slack MCP Server
- Official Slack MCP at `mcp.slack.com`

### Token Management
- **Ragen Token Vault** — centralized token vault (separate service) for all OAuth tokens and API keys
- `customer_id` format: `{orgId}:{userId}` (per-user tokens)
- HMAC-SHA256 signed requests between ragen-app and vault
- Three auth types: `external_mcp` (full OAuth), `api_key_bearer` (user-provided keys), custom OAuth (Google)

### Runtime Integration
- `@ai-sdk/mcp` creates MCP clients from connector records at chat time
- Tools passed to `streamText()` with `stopWhen: stepCountIs(10)`
- `mcpContext` in system prompt provides per-provider usage instructions
- MCP clients cleaned up after streaming completes

## Consequences

- Own MCP server gives full control over Google integrations but requires maintenance
- Third-party MCP servers reduce maintenance burden but depend on external availability
- Token Vault adds infrastructure complexity but centralizes secret management
- Per-provider system prompt instructions needed to guide AI tool usage (sorting, filtering, date handling)
