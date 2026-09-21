-- Expand/contract on `provider`, step 4 of 4.
--
-- Phase B5 of docs/specs/2026-09-18-mcp-servers-added-without-a-deploy.md, and
-- **nothing else ships in this release.**
--
-- The column has been unread since step 2 and unwritten since step 3, and the
-- catalogue has been the source of a connector's identity since B4. This drops
-- it and the Postgres type with it.
--
-- This one is irreversible without a restore: the type and its values are
-- gone, and re-adding the column would produce a NULL for every row. That is
-- why it waited, and why it travels alone.

-- AlterTable
ALTER TABLE "mcp_connectors" DROP COLUMN "provider";
ALTER TABLE "mcp_oauth_tokens" DROP COLUMN "provider";

-- DropEnum
DROP TYPE "McpConnectorProvider";
