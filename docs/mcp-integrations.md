# MCP Integrations

Split out of `AGENTS.md` to keep it under Codex's 32,768-byte `project_doc_max_bytes` budget — content past that offset is silently dropped. Reached from that file's Task Router.

External services connected via Settings > Connectors, powered by MCP servers providing tools during chat.

**How it works**: `McpConnector` Prisma model stores `mcp_server_url` + `customer_id` (format: `{orgId}:{userId}:{provider_lowercase}`). Tokens stored in **Ragen Token Vault**, not in ragen-app DB. During chat, `assistant-stream.ts` loads enabled connectors, `createMcpToolsFromConnectors()` fetches tokens from vault, creates MCP clients via `@ai-sdk/mcp`, passes tools to `streamText()`. Clients closed after streaming. AI SDK v6 uses `stopWhen: stepCountIs(10)` (not `maxSteps`). System prompt includes per-provider guidance in `mcpContext` (sorting, filtering, date handling).

**Token storage**: `packages/vault-client` holds `RagenAuthClient` and the HMAC-SHA256 signing (ADR-32); `src/libs/ragen-vault/client.ts` is the per-app wiring around it, alongside `oauth-provider.ts` (implements `OAuthClientProvider` from `@ai-sdk/mcp`). Provider names in vault use UPPERCASE (matches `McpConnectorProvider` Prisma enum). Three auth types: `external_mcp` (ClickUp, HubSpot), `api_key_bearer` (Fireflies), custom OAuth (Google via vault + ragen-mcp).

**Key files**: `src/features/connectors/`, `src/libs/mcp/client.ts`, `src/libs/ragen-vault/` (wiring) + `packages/vault-client` (the client itself), `src/libs/chains/basic-rag/chain.ts` + `conversation-chain/chain.ts`, `src/app/[locale]/(panel)/settings/connectors/`, `src/app/api/connectors/external/`, `src/app/api/threads/services/assistant-stream.ts`.

**Providers**:
- **Own** (`ragen-mcp` FastMCP + Hono on Railway, port 9001 `/mcp`, OAuth on port 8001, per-user OAuth with PKCE): Google Calendar, Google Analytics, Google Ads, Google Drive. Analytics requires `property_id`, Ads requires `ads_customer_id`. Env: `MCP_GOOGLE_SERVER_URL`, `MCP_GOOGLE_AUTH_URL`.
- **Claude AI MCP**: HubSpot, ClickUp, Gmail.
- **Slack MCP** (`mcp.slack.com`): search/send messages, threads, canvas, users.

**Google Drive folder import**: users can attach folder contents to chat or import into project KBs. Prompt form uses two-step dialog (`GoogleDriveFolderPickerDialog.tsx`). Project import via `importDriveFolderCommand` lists up to 200 files, creates `UserFile` records, uploads to S3, starts Temporal workflows in batches of 5. `GoogleDriveSync` model tracks imports per project (auto-sync deferred to Phase 3). Imported files store `driveFileId`, `driveFolderId`, `driveModifiedTime` in `UserFile.metadata`. REST endpoint on ragen-mcp: `GET /drive/folder/:folder_id/files`.
