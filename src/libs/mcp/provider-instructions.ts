import type { McpConnectorProvider } from '@/generated/prisma/client';

const HUBSPOT_INSTRUCTIONS = `For HubSpot (CRM):
- FIRST STEP: Always call get_user_details before any other HubSpot tool to get your ownerId and permissions.
- OWNER FILTERING: When the user says "my" contacts/deals/tickets (first-person language like "I", "my", "me"), filter by hubspot_owner_id = {ownerId} from get_user_details. Without this filter, you will return ALL account records, not the user's own.
- SORTING: When the user asks for "recent", "latest", or "last" records, sort by "lastmodifieddate" DESCENDING. Default to this sorting when listing records without a specific query.
- DATE FILTERING: When user asks for "recent" or "latest" records, also filter by lastmodifieddate > 90 days ago (use operator GT with a date value 90 days before today). This prevents showing very old records that haven't been touched in years. If no results are found with the date filter, retry without it and inform the user.
- PROPERTIES: Always request relevant properties for meaningful results. For contacts: firstname, lastname, email, phone, company, lastmodifieddate, createdate. For deals: dealname, dealstage, amount, pipeline, closedate, lastmodifieddate, createdate. For companies: name, domain, industry, lastmodifieddate, createdate.
- PAGINATION: Check the "total" count in results. If total exceeds the returned results, inform the user there are more records available.
- INDEX DELAY: HubSpot search results may have a slight delay for very recently created or modified records (up to a few hours). When showing recent records, add a brief note that very recent changes may not appear immediately in search results. If the user asks about a specific contact/deal that doesn't appear in search, try searching by email/name using the "query" parameter which uses a different, more real-time lookup.`;

const CLICKUP_INSTRUCTIONS = `For ClickUp:
- SORTING: When listing tasks, sort by updatedAt DESC by default to show most recently active items first.
- "MY TASKS": When the user says "my tasks" or uses first-person language, first call clickup_get_workspace_members to find the authenticated user's member ID, then use that ID as an assignee filter in clickup_search. If clickup_resolve_assignees is available, you can try it with the user's name — but do NOT use ["me"] as it may not be supported.
- ASSET TYPE: When the user asks about tasks specifically, filter by asset_types: ["task"]. When asking about docs, use ["doc"].
- STATUS FILTERING: For "current", "active", or "in progress" work, filter by task_statuses: ["active"]. For "todo" or "backlog", use ["unstarted"]. For "done" or "completed", use ["done", "closed"]. Don't filter by status when user asks for "all" tasks.
- DATE FILTERING: For "overdue tasks", filter with due_date_to set to today's date and task_statuses: ["unstarted", "active"]. For "tasks due this week", use due_date_from and due_date_to with the current week range.
- HIERARCHY: If the user mentions a specific space, folder, or list by name, use clickup_get_workspace_hierarchy or clickup_get_list/clickup_get_folder to resolve IDs, then filter by location.`;

const GOOGLE_CALENDAR_INSTRUCTIONS = (timeZone: string) => `For Google Calendar:
- TIMEZONE: Always pass timeZone="${timeZone}" in every calendar query (list_events, find_free_time, find_meeting_times, create_event, update_event).
- TIME RANGES: Always provide both timeMin and timeMax. For "today": use start/end of today. For "this week": use Monday to Sunday. For "tomorrow": use start/end of tomorrow. Format: YYYY-MM-DDTHH:MM:SS (no timezone suffix — timeZone param handles it).
- CONDENSED vs FULL: Use condenseEventDetails=true (default) for listing/overview queries. Use condenseEventDetails=false only when user asks for attendee details, attachments, or full event info.
- CREATING EVENTS: Always include timeZone in start and end objects. If user doesn't specify a time, ask for it. For all-day events use date format (YYYY-MM-DD).
- AVAILABILITY: For "when am I free?" use gcal_find_my_free_time. For "find a time with X" use gcal_find_meeting_times — don't manually scan events.`;

const GOOGLE_DRIVE_INSTRUCTIONS = `For Google Drive:
- Use the available Drive tools to search and read documents from the user's Google Drive.
- When searching, use relevant keywords from the user's query.
- Drive access is read-only — you can search and read documents but cannot create or modify them.`;

const GMAIL_INSTRUCTIONS = `For Gmail:
- RECENT EMAILS: When user asks for "recent emails" or "latest messages", call gmail_search_messages with no query (q omitted) to get most recent messages.
- SEARCH SYNTAX: Use Gmail search operators: from:, to:, subject:, is:unread, is:starred, has:attachment, after:YYYY/M/D, before:YYYY/M/D. Combine with spaces for AND, OR for alternatives.
- DATE QUERIES: For "emails from today", use after: with today's date in YYYY/M/D format. For "emails this week", calculate the Monday date.
- THREADS: When the user asks about a conversation or wants full context, use gmail_read_thread with the threadId from search results, not just gmail_read_message.
- DRAFTS: When user says "draft a reply" or "compose an email", use gmail_create_draft — never claim to send emails directly. Make clear it creates a draft, not a sent message.`;

const GOOGLE_ANALYTICS_INSTRUCTIONS = `For Google Analytics (GA4):
- PROPERTY ID: All Analytics tools require a property_id (numeric GA4 property ID). If the user hasn't provided it, ask them for it. Do NOT guess.
- DATE RANGES: Use start_date and end_date in YYYY-MM-DD format. Also supports relative dates: "7daysAgo", "30daysAgo", "today", "yesterday". For "this month", calculate the first day of the current month as start_date and "today" as end_date.
- DEFAULT RANGE: When user asks for a report without specifying dates, default to "30daysAgo" to "today" for a meaningful overview.
- TOOL SELECTION: For general traffic overview use get_traffic_report. For conversion/goal data use get_conversion_data. For "which pages are most popular" use get_top_pages. For demographics/devices/countries use get_audience_insights.
- COMBINE REPORTS: When user asks a broad question like "how is my website doing?", call get_traffic_report AND get_top_pages together to give a comprehensive answer.`;

const GOOGLE_ADS_INSTRUCTIONS = `For Google Ads:
- CUSTOMER ID: All Ads tools require ads_customer_id (10-digit, no dashes). If the user hasn't provided it, ask them for it. Do NOT guess.
- WORKFLOW: Always call list_campaigns first to discover available campaigns before calling get_campaign_performance (which requires the exact campaign name).
- DATE RANGES: Use start_date and end_date in YYYY-MM-DD format. Default to last 30 days if user doesn't specify.
- COST OVERVIEW: For "how much am I spending?" or "what's my ad budget?", use get_cost_summary which gives totals across all campaigns.
- CAMPAIGN DETAILS: For "how is campaign X performing?", first list_campaigns to verify the name, then get_campaign_performance with the exact name.`;

const FIREFLIES_INSTRUCTIONS = `For Fireflies.ai (meeting transcripts):
- CRITICAL: When calling any Fireflies tool, ONLY pass the parameters you truly need. Omit all optional parameters — do NOT pass empty strings, zeros, false, or empty arrays.
- LISTING TRANSCRIPTS: Call fireflies_get_transcripts with ONLY {"limit": 10}. No other parameters. This returns the user's recent transcripts.
- "MY MEETINGS" / "RECENT MEETINGS": Same as above — just call fireflies_get_transcripts with {"limit": 10}. All transcripts belong to the authenticated user.
- TRANSCRIPT DETAILS: Use fireflies_get_transcript with a transcriptId for full transcript. Use fireflies_fetch with an id for complete meeting data (transcript + summary + metadata) in one call.
- SUMMARIES: Use fireflies_get_summary with a transcriptId for summary, action items, keywords, and topics.
- SEARCHING: Use fireflies_search with a query string. Supports keyword, date ranges, and participant filters.
- DATE FILTERING: Use fromDate and toDate in ISO 8601 format (e.g., "2026-01-01") only when the user explicitly asks about a specific time period.
- USER INFO: Use fireflies_get_user (no parameters) if you need the user's email or account details.`;

const PROVIDER_INSTRUCTIONS: Record<
  string,
  string | ((timeZone: string) => string)
> = {
  HUBSPOT: HUBSPOT_INSTRUCTIONS,
  CLICKUP: CLICKUP_INSTRUCTIONS,
  GOOGLE_CALENDAR: GOOGLE_CALENDAR_INSTRUCTIONS,
  GOOGLE_DRIVE: GOOGLE_DRIVE_INSTRUCTIONS,
  GMAIL: GMAIL_INSTRUCTIONS,
  GOOGLE_ANALYTICS: GOOGLE_ANALYTICS_INSTRUCTIONS,
  GOOGLE_ADS: GOOGLE_ADS_INSTRUCTIONS,
  FIREFLIES: FIREFLIES_INSTRUCTIONS,
};

export function buildMcpContext(
  connectorProviders: string[],
  timeZone: string,
  currentDateTime: string,
): string {
  const header = `You have access to external tools via connected integrations (${connectorProviders.join(', ')}). Authentication is handled automatically — just call the tools directly without any credentials.

Current date and time: ${currentDateTime} (timezone: ${timeZone}). Use this to resolve relative dates like "today", "tomorrow", "this week", etc. when calling calendar or other time-based tools. Always provide both time_min and time_max for calendar queries to get precise results.`;

  const sections: string[] = [header];

  for (const provider of connectorProviders) {
    const instruction = PROVIDER_INSTRUCTIONS[provider];
    if (instruction) {
      sections.push(
        typeof instruction === 'function' ? instruction(timeZone) : instruction,
      );
    }
  }

  return sections.join('\n\n');
}
