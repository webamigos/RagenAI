-- Decommission the Rejestr.io MCP connector.
--
-- Postgres will not drop an enum value that is still referenced, and two
-- columns use this type (mcp_connectors.provider, mcp_oauth_tokens.provider),
-- so the rows go first and the type is recreated without the value.
--
-- IRREVERSIBLE: deletes the connector configurations. Production held 2
-- REJESTRIO connectors and 0 OAuth tokens when this was written.

DELETE FROM "mcp_oauth_tokens" WHERE "provider" = 'REJESTRIO';
DELETE FROM "mcp_connectors" WHERE "provider" = 'REJESTRIO';

ALTER TYPE "McpConnectorProvider" RENAME TO "McpConnectorProvider_old";

CREATE TYPE "McpConnectorProvider" AS ENUM (
  'GOOGLE_CALENDAR',
  'GOOGLE_ANALYTICS',
  'GOOGLE_ADS',
  'GOOGLE_DRIVE',
  'GMAIL',
  'CLICKUP',
  'HUBSPOT',
  'FIREFLIES',
  'SLACK',
  'WOOCOMMERCE'
);

ALTER TABLE "mcp_connectors"
  ALTER COLUMN "provider" TYPE "McpConnectorProvider"
  USING "provider"::text::"McpConnectorProvider";

ALTER TABLE "mcp_oauth_tokens"
  ALTER COLUMN "provider" TYPE "McpConnectorProvider"
  USING "provider"::text::"McpConnectorProvider";

DROP TYPE "McpConnectorProvider_old";
