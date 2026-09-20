-- Expand/contract on `provider`, step 1 of 4.
--
-- Phase B1 of docs/specs/2026-09-18-mcp-servers-added-without-a-deploy.md.
-- `McpConnectorProvider` has to become a string, and web, api and admin deploy
-- independently — so a single `ALTER TYPE … USING provider::text` is one line
-- and is correct only if all three restart together, which they do not.
--
-- This step is additive and reversible: the column is nullable, backfilled
-- from the enum, and written beside `provider` by every writer. Nothing reads
-- it yet. Reverting the code that writes it leaves the column populated and
-- ignored.
--
--   2. every reader reads `providerSlug ?? provider`
--   3. `provider_slug` NOT NULL, uniqueness moves to it, writes to `provider` stop
--   4. `provider` and the type are dropped
--
-- The values are the enum members verbatim — `GOOGLE_CALENDAR`, not
-- `google-calendar`. Vault token paths, `customerId`s and every
-- `allowedConnectors` array already hold those strings.

-- AlterTable
ALTER TABLE "mcp_connectors" ADD COLUMN "provider_slug" TEXT;

-- AlterTable
ALTER TABLE "mcp_oauth_tokens" ADD COLUMN "provider_slug" TEXT;

-- Backfill. `WHERE provider_slug IS NULL` so re-running this against a database
-- that already has values (a restore taken mid-migration) cannot overwrite a
-- slug that has since been edited.
UPDATE "mcp_connectors" SET "provider_slug" = "provider"::text WHERE "provider_slug" IS NULL;
UPDATE "mcp_oauth_tokens" SET "provider_slug" = "provider"::text WHERE "provider_slug" IS NULL;
