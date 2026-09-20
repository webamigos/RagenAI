-- The connector catalogue becomes rows, Phase A1.
--
-- **Nothing reads this table yet.** The eleven entries seeded below are the
-- eleven `McpConnectorProvider` members, and every code path still resolves a
-- connector through the compiled-in manifests. Phase B moves the reads.
--
-- Two columns are deliberately left NULL for the seeded rows:
--
--   * `mcp_server_url` — `MCP_GOOGLE_SERVER_URL` and its four siblings are read
--     from the environment at module load, and every deployment sets them.
--     Writing the value this migration happens to see into a column would mean
--     a database promoted or restored between environments silently points
--     Google at the wrong host, and changing the variable would stop working
--     with no error. A built-in resolves its URL from the environment; a row an
--     operator creates carries its own, and it is required there.
--   * `auth_base_url` — the same argument, for `MCP_GOOGLE_AUTH_URL`.
--
-- `system_prompt` is NULL for Google Calendar alone: its fragment is a function
-- of the user's timezone, so it stays in code. Rows hold text.
--
-- The row values come from `prisma/catalog/built-in-connectors.json`, generated
-- from the provider manifests by
-- `apps/web/scripts/write-connector-projection.ts` and kept honest by
-- `built-in-projection.test.ts` — the seed never imports the manifests, which
-- read OAuth client secrets from the environment at module load.

-- CreateEnum
CREATE TYPE "McpAuthType" AS ENUM ('SERVER_SIDE', 'API_KEY_BEARER', 'EXTERNAL_MCP', 'API_KEY_CUSTOM_HEADER', 'OAUTH', 'API_KEY');

-- CreateTable
CREATE TABLE "mcp_catalog_entries" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "lucide_icon" TEXT,
    "mcp_server_url" TEXT,
    "auth_type" "McpAuthType" NOT NULL,
    "auth_base_url" TEXT,
    "auth_path" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "use_user_scope" BOOLEAN NOT NULL DEFAULT false,
    "oauth_credentials_stored" BOOLEAN NOT NULL DEFAULT false,
    "system_prompt" TEXT,
    "allows_private_address" BOOLEAN NOT NULL DEFAULT false,
    "is_built_in" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "mcp_catalog_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_catalog_entries_public_id_key" ON "mcp_catalog_entries"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_catalog_entries_slug_key" ON "mcp_catalog_entries"("slug");

-- CreateIndex
-- A slug is unique case-INSENSITIVELY, which Prisma's `@unique` is not:
-- `customerId` is `{orgId}:{userId}:{slug.toLowerCase()}`, so a slug `slack`
-- beside the built-in `SLACK` would send both connectors the same
-- `x-customer-id` and hand one server the other's session.
CREATE UNIQUE INDEX "mcp_catalog_entries_slug_lower_key" ON "mcp_catalog_entries" (lower("slug"));

-- CreateIndex
CREATE INDEX "mcp_catalog_entries_enabled_idx" ON "mcp_catalog_entries"("enabled");

-- Seed: the eleven connectors that exist today, under the slugs they already
-- use. `ON CONFLICT DO NOTHING` so a database seeded by `npm run db:seed`
-- before this migration ran is not fought over.
INSERT INTO "mcp_catalog_entries" (
  "public_id", "slug", "label", "description", "icon", "lucide_icon",
  "auth_type", "auth_path", "scopes", "use_user_scope", "system_prompt",
  "is_built_in", "enabled", "updated_at"
) VALUES
  (
    gen_random_uuid(), 'GOOGLE_CALENDAR', 'Google Calendar',
    'View calendar events and check availability.',
    '/assets/connectors/google-calendar.svg', 'calendar',
    'SERVER_SIDE', '/auth/google', ARRAY['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events.readonly']::TEXT[], false,
    NULL,
    true, true, CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(), 'GOOGLE_ANALYTICS', 'Google Analytics',
    'Access traffic reports, conversions, and audience insights.',
    '/assets/connectors/google-analytics.svg', 'chart-bar',
    'SERVER_SIDE', '/auth/google', ARRAY['https://www.googleapis.com/auth/analytics.readonly']::TEXT[], false,
    'For Google Analytics (GA4):
- PROPERTY ID: All Analytics tools require a property_id (numeric GA4 property ID). If the user hasn''t provided it, ask them for it. Do NOT guess.
- DATE RANGES: Use start_date and end_date in YYYY-MM-DD format. Also supports relative dates: "7daysAgo", "30daysAgo", "today", "yesterday". For "this month", calculate the first day of the current month as start_date and "today" as end_date.
- DEFAULT RANGE: When user asks for a report without specifying dates, default to "30daysAgo" to "today" for a meaningful overview.
- TOOL SELECTION: For general traffic overview use get_traffic_report. For conversion/goal data use get_conversion_data. For "which pages are most popular" use get_top_pages. For demographics/devices/countries use get_audience_insights.
- COMBINE REPORTS: When user asks a broad question like "how is my website doing?", call get_traffic_report AND get_top_pages together to give a comprehensive answer.',
    true, true, CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(), 'GOOGLE_ADS', 'Google Ads',
    'View campaigns, performance, and track costs.',
    '/assets/connectors/google-ads.svg', 'megaphone',
    'SERVER_SIDE', '/auth/google', ARRAY['https://www.googleapis.com/auth/adwords']::TEXT[], false,
    'For Google Ads:
- CUSTOMER ID: All Ads tools require ads_customer_id (10-digit, no dashes). If the user hasn''t provided it, ask them for it. Do NOT guess.
- WORKFLOW: Always call list_campaigns first to discover available campaigns before calling get_campaign_performance (which requires the exact campaign name).
- DATE RANGES: Use start_date and end_date in YYYY-MM-DD format. Default to last 30 days if user doesn''t specify.
- COST OVERVIEW: For "how much am I spending?" or "what''s my ad budget?", use get_cost_summary which gives totals across all campaigns.
- CAMPAIGN DETAILS: For "how is campaign X performing?", first list_campaigns to verify the name, then get_campaign_performance with the exact name.',
    true, true, CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(), 'GOOGLE_DRIVE', 'Google Drive',
    'Search and read documents from your Google Drive.',
    '/assets/connectors/google-drive.svg', 'folder',
    'SERVER_SIDE', '/auth/google', ARRAY['https://www.googleapis.com/auth/drive.readonly']::TEXT[], false,
    'For Google Drive:
- Use the available Drive tools to search and read documents from the user''s Google Drive.
- When searching, use relevant keywords from the user''s query.
- Drive access is read-only — you can search and read documents but cannot create or modify them.',
    true, true, CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(), 'GMAIL', 'Gmail',
    'Search emails and read messages.',
    '/assets/connectors/gmail.svg', 'mail',
    'SERVER_SIDE', '/auth/google', ARRAY['https://www.googleapis.com/auth/gmail.readonly']::TEXT[], false,
    'For Gmail:
- RECENT EMAILS: When user asks for "recent emails" or "latest messages", call gmail_search_messages with no query (q omitted) to get most recent messages.
- SEARCH SYNTAX: Use Gmail search operators: from:, to:, subject:, is:unread, is:starred, has:attachment, after:YYYY/M/D, before:YYYY/M/D. Combine with spaces for AND, OR for alternatives.
- DATE QUERIES: For "emails from today", use after: with today''s date in YYYY/M/D format. For "emails this week", calculate the Monday date.
- THREADS: When the user asks about a conversation or wants full context, use gmail_read_thread with the threadId from search results, not just gmail_read_message.
- READ-ONLY: Gmail access is read-only. You can search and read emails but cannot send, draft, or modify messages.',
    true, true, CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(), 'CLICKUP', 'ClickUp',
    'Manage tasks, projects, and workspaces.',
    '/assets/connectors/clickup.svg', 'check-square',
    'EXTERNAL_MCP', NULL, ARRAY[]::TEXT[], false,
    'For ClickUp:
- SORTING: When listing tasks, sort by updatedAt DESC by default to show most recently active items first.
- "MY TASKS": When the user says "my tasks" or uses first-person language, first call clickup_get_workspace_members to find the authenticated user''s member ID, then use that ID as an assignee filter in clickup_search. If clickup_resolve_assignees is available, you can try it with the user''s name — but do NOT use ["me"] as it may not be supported.
- ASSET TYPE: When the user asks about tasks specifically, filter by asset_types: ["task"]. When asking about docs, use ["doc"].
- STATUS FILTERING: For "current", "active", or "in progress" work, filter by task_statuses: ["active"]. For "todo" or "backlog", use ["unstarted"]. For "done" or "completed", use ["done", "closed"]. Don''t filter by status when user asks for "all" tasks.
- DATE FILTERING: For "overdue tasks", filter with due_date_to set to today''s date and task_statuses: ["unstarted", "active"]. For "tasks due this week", use due_date_from and due_date_to with the current week range.
- HIERARCHY: If the user mentions a specific space, folder, or list by name, use clickup_get_workspace_hierarchy or clickup_get_list/clickup_get_folder to resolve IDs, then filter by location.',
    true, true, CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(), 'HUBSPOT', 'HubSpot',
    'Access contacts, companies, deals, and CRM data.',
    '/assets/connectors/hubspot.svg', 'database',
    'EXTERNAL_MCP', NULL, ARRAY[]::TEXT[], false,
    'For HubSpot (CRM):
- FIRST STEP: Always call get_user_details before any other HubSpot tool to get your ownerId and permissions.
- OWNER FILTERING: When the user says "my" contacts/deals/tickets (first-person language like "I", "my", "me"), filter by hubspot_owner_id = {ownerId} from get_user_details. Without this filter, you will return ALL account records, not the user''s own.
- SORTING: When the user asks for "recent", "latest", or "last" records, sort by "lastmodifieddate" DESCENDING. Default to this sorting when listing records without a specific query.
- DATE FILTERING: When user asks for "recent" or "latest" records, also filter by lastmodifieddate > 90 days ago (use operator GT with a date value 90 days before today). This prevents showing very old records that haven''t been touched in years. If no results are found with the date filter, retry without it and inform the user.
- PROPERTIES: Always request relevant properties for meaningful results. For contacts: firstname, lastname, email, phone, company, lastmodifieddate, createdate. For deals: dealname, dealstage, amount, pipeline, closedate, lastmodifieddate, createdate. For companies: name, domain, industry, lastmodifieddate, createdate.
- PAGINATION: Check the "total" count in results. If total exceeds the returned results, inform the user there are more records available.
- INDEX DELAY: HubSpot search results may have a slight delay for very recently created or modified records (up to a few hours). When showing recent records, add a brief note that very recent changes may not appear immediately in search results. If the user asks about a specific contact/deal that doesn''t appear in search, try searching by email/name using the "query" parameter which uses a different, more real-time lookup.',
    true, true, CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(), 'FIREFLIES', 'Fireflies.ai',
    'Search meeting transcripts, summaries, and action items.',
    '/assets/connectors/fireflies.svg', 'mic',
    'API_KEY_BEARER', NULL, ARRAY[]::TEXT[], false,
    'For Fireflies.ai (meeting transcripts):
- CRITICAL: When calling any Fireflies tool, ONLY pass the parameters you truly need. Omit all optional parameters — do NOT pass empty strings, zeros, false, or empty arrays.
- LISTING TRANSCRIPTS: Call fireflies_get_transcripts with ONLY {"limit": 10}. No other parameters. This returns the user''s recent transcripts.
- "MY MEETINGS" / "RECENT MEETINGS": Same as above — just call fireflies_get_transcripts with {"limit": 10}. All transcripts belong to the authenticated user.
- TRANSCRIPT DETAILS: Use fireflies_get_transcript with a transcriptId for full transcript. Use fireflies_fetch with an id for complete meeting data (transcript + summary + metadata) in one call.
- SUMMARIES: Use fireflies_get_summary with a transcriptId for summary, action items, keywords, and topics.
- SEARCHING: Use fireflies_search with a query string. Supports keyword, date ranges, and participant filters.
- DATE FILTERING: Use fromDate and toDate in ISO 8601 format (e.g., "2026-01-01") only when the user explicitly asks about a specific time period.
- USER INFO: Use fireflies_get_user (no parameters) if you need the user''s email or account details.',
    true, true, CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(), 'SLACK', 'Slack',
    'Search messages, channels, and send messages.',
    '/assets/connectors/slack.svg', 'message-square',
    'EXTERNAL_MCP', NULL, ARRAY['search:read.public', 'search:read.private', 'channels:history', 'groups:history', 'mpim:history', 'im:history', 'users:read']::TEXT[], true,
    'For Slack:
- SEARCHING: Use search tools to find messages, files, users, and channels. Provide relevant keywords from the user''s query.
- "MY MESSAGES": When user says "my messages" or uses first-person language, search for messages from the authenticated user.
- CHANNELS: When searching for messages in a specific channel, use the channel name filter. If the user mentions a channel by name, search for it first.
- THREADS: When the user asks about a conversation or wants full context, read the entire thread, not just individual messages.
- SENDING MESSAGES: When the user asks to send a message, confirm the channel and content before sending. Always double-check the target channel.
- CANVASES: Use canvas tools for creating or reading structured documents within Slack.
- USER LOOKUP: When the user asks about a specific person, use user search/profile tools to find them by name or email.',
    true, true, CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(), 'WOOCOMMERCE', 'WooCommerce',
    'Manage products and orders from your WooCommerce store.',
    '/assets/connectors/woocommerce.svg', 'shopping-cart',
    'API_KEY_CUSTOM_HEADER', NULL, ARRAY[]::TEXT[], false,
    'For WooCommerce (store management):
- PRODUCTS: Use the product tools to list, search, or read product details. For "recent products" list sorted by date DESC and limit results to 20. For "out of stock" filter by stock_status="outofstock".
- ORDERS: Use the order tools to list and inspect orders. For "recent orders" use per_page=20 sorted by date DESC. For status questions filter by status (pending, processing, on-hold, completed, cancelled, refunded, failed). Always include date_created and total when listing.
- WRITES: Creating or updating products/orders has real effects on the live store. Confirm the exact intent with the user before calling any create/update tool; never guess SKUs, prices, or statuses.
- PERMISSIONS: The connected REST keys may be read-only. If a write call returns a permission error, tell the user to generate read_write keys in WooCommerce → Settings → Advanced → REST API rather than retrying.
- CURRENCY: Prices are returned as strings in the store''s currency. Don''t reformat or convert — display as-is.',
    true, true, CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(), 'OPEN_MERCATO', 'Open Mercato',
    'Look up customers, deals and orders from Open Mercato – a CRM/ERP framework built with AI and designed for AI.',
    '/assets/connectors/open-mercato.svg', 'building-2',
    'API_KEY_CUSTOM_HEADER', NULL, ARRAY[]::TEXT[], false,
    'For Open Mercato (CRM/ERP/OMS):
- This connector exposes Open Mercato''s own generic "search"/"execute" tools, which query its REST API across every enabled module (customers, deals, orders, custom entities). There are no fixed per-entity tools — read the tool descriptions at call time to see what''s available.
- WRITES: "execute" can call mutating endpoints (create/update/delete). Confirm the exact intent with the user before writing anything; never guess IDs, statuses, or amounts.
- SCOPE: results are already scoped to the connected organization/tenant by the upstream server — don''t ask the user which tenant, and don''t pass a different one.
- If a call fails with a permission error, tell the user the connected API key may lack the required role rather than retrying blindly.',
    true, true, CURRENT_TIMESTAMP
  )
ON CONFLICT ("slug") DO NOTHING;
