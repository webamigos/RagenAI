-- Why a connector failed, and when.
--
-- `McpConnectorStatus` has had an `ERROR` member since the model was created
-- and nothing ever wrote it: the OAuth callback redirected with `?status=error`
-- and left the row alone, and the chat path logged
-- "Failed to initialize MCP connector, skipping" and moved on. So a broken
-- connector stayed `CONNECTED` in the database, the user's settings page kept
-- showing it as fine, and their assistant quietly lost those tools.
--
-- Marking the row `ERROR` is only half an answer — "it broke" without "how" is
-- not something support can act on. These two columns are the other half.
--
-- Both nullable, no backfill: nothing knows why the already-broken connectors
-- broke, and inventing a reason would be worse than an empty cell.
ALTER TABLE "mcp_connectors" ADD COLUMN "last_error" TEXT;
ALTER TABLE "mcp_connectors" ADD COLUMN "last_error_at" TIMESTAMPTZ;

-- The panel's first question is "what is failing right now", which is a scan
-- of every connector in one status across all organizations.
CREATE INDEX "mcp_connectors_status_idx" ON "mcp_connectors"("status");
