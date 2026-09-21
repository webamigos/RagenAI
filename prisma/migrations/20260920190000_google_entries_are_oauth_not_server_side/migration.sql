-- The five Google catalogue entries are OAUTH, not SERVER_SIDE.
--
-- A1 seeded them `SERVER_SIDE`, following the spec's rule that a manifest with
-- no `authType` becomes `SERVER_SIDE` because that is "what those paths
-- already do in effect". It is not what they do.
--
-- A manifest that leaves `authType` unset falls through every branch in
-- `ConnectorCard` to the popup at `authBaseUrl + authPath` — which is how
-- Google Calendar, Analytics, Ads, Drive and Gmail reach `/auth/google` on the
-- MCP container. `server_side` is a *different* branch, and it means the MCP
-- service already holds the credential: the card skips the popup entirely and
-- flips the connector straight to `CONNECTED`.
--
-- Nothing read these rows while A1's value was wrong, so nothing broke. B4
-- makes the catalogue the source of a connector's auth shape, and under the
-- seeded value those five connectors would have reported themselves connected
-- without ever authorizing — visible only the first time somebody connected
-- Gmail and got no mail.
--
-- `OAUTH` is the member that behaves as `undefined` does: nothing in either app
-- branches on `'oauth'`, so every path takes the same turn it takes today.
--
-- Scoped to the built-in rows that still carry the seeded value, so an
-- operator who has since changed one is left alone.

UPDATE "mcp_catalog_entries"
SET "auth_type" = 'OAUTH', "updated_at" = CURRENT_TIMESTAMP
WHERE "is_built_in" = true
  AND "auth_type" = 'SERVER_SIDE'
  AND "slug" IN (
    'GOOGLE_CALENDAR',
    'GOOGLE_ANALYTICS',
    'GOOGLE_ADS',
    'GOOGLE_DRIVE',
    'GMAIL'
  );
