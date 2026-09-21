# MCP Integrations

Split out of `AGENTS.md` to keep it under Codex's 32,768-byte `project_doc_max_bytes` budget — content past that offset is silently dropped. Reached from that file's Task Router.

External services connected via Settings > Connectors, powered by MCP servers providing tools during chat.

**The catalogue is rows, not an enum** ([ADR-52](adrs/52-the-connector-catalogue-is-data-not-an-enum.md)). `McpCatalogEntry` is the answer to *which connectors exist*, a platform administrator edits it at `/mcp-catalogue` in `apps/admin`, and adding one needs no migration and no deploy. What a row carries: slug, label, description, both icons, server URL, auth shape, scopes, system prompt, `enabled`, and `allowsPrivateAddress`. What it deliberately does not: OAuth client credentials, which live in ragen-token-vault (ADR-32), and a built-in's server URL, which stays in `MCP_*_SERVER_URL` so a database promoted between environments cannot move it.

A `ProviderDefinition` is a **behaviour pack** now — optional code keyed by slug, for the two things a row cannot hold: a system prompt that must compute (Google Calendar's takes the timezone) and the `api_key_custom_header` URL assembly. A row with no pack resolves completely, which is what lets Notion be a row. `definitionFromEntry()` merges the two into the shape every connector path already takes.

**The slugs of the eleven built-ins are the old enum members verbatim** — `GOOGLE_CALENDAR`, not `google-calendar` — because vault token paths, `customerId`s and every `allowedConnectors` array already hold those strings. New entries are lowercase-kebab, and a slug is unique case-insensitively: `slack` beside `SLACK` would send both connectors the same `x-customer-id`.

**How it works**: `McpConnector` stores `provider_slug` (the catalogue slug), `mcp_server_url` + `customer_id` (format: `{orgId}:{userId}:{provider_lowercase}`). Tokens stored in **Ragen Token Vault**, not in the app database. During chat, `assistant-stream.ts` loads enabled connectors, `createMcpToolsFromConnectors()` fetches tokens from vault, creates MCP clients via `@ai-sdk/mcp`, passes tools to `streamText()`. Clients closed after streaming. AI SDK v6 uses `stopWhen: stepCountIs(10)` (not `maxSteps`). System prompt includes per-provider guidance in `mcpContext` (sorting, filtering, date handling).

**Token storage**: `packages/vault-client` holds `RagenAuthClient` and the HMAC-SHA256 signing (ADR-32); `src/libs/ragen-vault/client.ts` is the per-app wiring around it, alongside `oauth-provider.ts` (implements `OAuthClientProvider` from `@ai-sdk/mcp`). Provider names in the vault are the catalogue slug verbatim, which for the eleven built-ins is their old UPPERCASE enum member — `oauth-provider.ts`'s `providerKey` returns the slug unchanged. Only `customer_id` lowercases it, which is why the two differ in case for a built-in. Three auth types are offered to an operator — `server_side`, `api_key_bearer` and `external_mcp` — and two more are seeded only: `api_key_custom_header` (WooCommerce, Open Mercato) assembles its URL from a shop address the user types, and `oauth` is what the five Google entries use to reach `/auth/google` on the MCP container.

**An entry's own OAuth client credentials** are stored under the catalogue's customer id, `ragen-catalogue`, and the row keeps only `oauthCredentialsStored`. `getConnectorOAuthCredentialsQuery` is the one place that decides where a connector's credentials come from: the environment for a built-in, the vault for an entry an operator created.

Both apps resolve the catalogue — `apps/web` through `getConnectorDefinitionsQuery`, `apps/api` through `CatalogueService`. The second matters for two reasons that are not symmetry: an entry disabled in the panel has to stop working through the public API too, and an operator's typed URL has to reach the address policy on that path as well.

**Addresses are checked** by `@ragenai/connector-guard` at three moments — save time in the panel, connect time, and every tool call — for every URL somebody typed. A built-in resolved from `MCP_*_SERVER_URL` keeps the deployer-controlled exemption. `allowsPrivateAddress` widens the policy to RFC 1918 space and to nothing else.

**Key files**: `apps/admin/src/app/(dashboard)/mcp-catalogue/` (the panel), `packages/connector-guard` (the address policy, the guarded transport and `probeMcpServer`, which is Test connection), `src/features/connectors/`, `src/libs/mcp/client.ts`, `src/libs/ragen-vault/` (wiring) + `packages/vault-client` (the client itself), `src/libs/chains/basic-rag/chain.ts` + `conversation-chain/chain.ts`, `src/app/[locale]/(panel)/settings/connectors/`, `src/app/api/connectors/external/`, `src/app/api/threads/services/assistant-stream.ts`.

**Providers**:
- **Own** (`ragen-connectors` FastMCP + Hono on Railway, port 9001 `/mcp`, OAuth on port 8001, per-user OAuth with PKCE): Google Calendar, Google Analytics, Google Ads, Google Drive. Analytics requires `property_id`, Ads requires `ads_customer_id`. Env: `MCP_GOOGLE_SERVER_URL`, `MCP_GOOGLE_AUTH_URL`.
- **Claude AI MCP**: HubSpot, ClickUp, Gmail.
- **Slack MCP** (`mcp.slack.com`): search/send messages, threads, canvas, users.

**Google Drive folder import**: users can attach folder contents to chat or import into project KBs. Prompt form uses two-step dialog (`GoogleDriveFolderPickerDialog.tsx`). Project import via `importDriveFolderCommand` lists up to 200 files, creates `UserFile` records, uploads to S3, starts Temporal workflows in batches of 5. `GoogleDriveSync` model tracks imports per project (auto-sync deferred to Phase 3). Imported files store `driveFileId`, `driveFolderId`, `driveModifiedTime` in `UserFile.metadata`. REST endpoint on ragen-connectors: `GET /drive/folder/:folder_id/files`.

**The reverse direction** — an external MCP client calling *into* Ragen, rather than Ragen calling out — is `apps/mcp`, not this file. See [ADR-36](adrs/36-mcp-server-exposes-chat-via-apps-api.md).
