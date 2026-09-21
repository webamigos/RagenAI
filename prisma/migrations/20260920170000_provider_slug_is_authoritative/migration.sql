-- Expand/contract on `provider`, step 3 of 4.
--
-- Phase B3 of docs/specs/2026-09-18-mcp-servers-added-without-a-deploy.md.
-- `provider_slug` becomes the authoritative column: NOT NULL, carrying the
-- composite uniqueness, and the only one any writer fills from here.
--
-- **This is the first step that is not trivially reversible.** Reverting it
-- means writing `provider` again for every row created since, so it is taken
-- only once step 2 has been on demo through a full connector connect and
-- token-refresh cycle. `provider` itself is left in place, nullable and
-- unread; B5 drops it, in a release that ships nothing else.
--
-- The backfill runs again on purpose. Step 1 backfilled and every writer since
-- has written both columns, so this should find nothing — but "should find
-- nothing" is not a reason to let `SET NOT NULL` fail a deploy at 3am over a
-- row written by a service that had not restarted yet.

UPDATE "mcp_connectors" SET "provider_slug" = "provider"::text WHERE "provider_slug" IS NULL;
UPDATE "mcp_oauth_tokens" SET "provider_slug" = "provider"::text WHERE "provider_slug" IS NULL;

-- AlterTable
ALTER TABLE "mcp_connectors" ALTER COLUMN "provider_slug" SET NOT NULL;
ALTER TABLE "mcp_oauth_tokens" ALTER COLUMN "provider_slug" SET NOT NULL;

-- The old column stops being required, which is what lets writers stop filling
-- it. A service still running step 2's code writes both and is unaffected.
ALTER TABLE "mcp_connectors" ALTER COLUMN "provider" DROP NOT NULL;
ALTER TABLE "mcp_oauth_tokens" ALTER COLUMN "provider" DROP NOT NULL;

-- The uniqueness moves with the authority. One connector per organization,
-- user and catalogue entry — the same rule, now stated about the column that
-- will still exist next release.
DROP INDEX "mcp_connectors_organization_id_user_id_provider_key";
CREATE UNIQUE INDEX "mcp_connectors_organization_id_user_id_provider_slug_key" ON "mcp_connectors"("organization_id", "user_id", "provider_slug");

DROP INDEX "mcp_oauth_tokens_organization_id_user_id_provider_key";
CREATE UNIQUE INDEX "mcp_oauth_tokens_organization_id_user_id_provider_slug_key" ON "mcp_oauth_tokens"("organization_id", "user_id", "provider_slug");
