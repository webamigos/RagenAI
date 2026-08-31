import { McpConnectorProvider } from '../../generated/prisma/client.js';
import type { ProviderDefinition } from '../types.js';
import { MCP_HUBSPOT_SERVER_URL } from './shared-config.js';

export const HUBSPOT_PROVIDER: ProviderDefinition = {
  provider: McpConnectorProvider.HUBSPOT,
  name: 'HubSpot',
  description: 'Access contacts, companies, deals, and CRM data.',
  icon: 'database',
  mcpServerUrl: MCP_HUBSPOT_SERVER_URL,
  authType: 'external_mcp',
  oauthClientId: process.env.HUBSPOT_MCP_CLIENT_ID,
  oauthClientSecret: process.env.HUBSPOT_MCP_CLIENT_SECRET,
  systemPromptFragment: `For HubSpot (CRM):
- FIRST STEP: Always call get_user_details before any other HubSpot tool to get your ownerId and permissions.
- OWNER FILTERING: When the user says "my" contacts/deals/tickets (first-person language like "I", "my", "me"), filter by hubspot_owner_id = {ownerId} from get_user_details. Without this filter, you will return ALL account records, not the user's own.
- SORTING: When the user asks for "recent", "latest", or "last" records, sort by "lastmodifieddate" DESCENDING. Default to this sorting when listing records without a specific query.
- DATE FILTERING: When user asks for "recent" or "latest" records, also filter by lastmodifieddate > 90 days ago (use operator GT with a date value 90 days before today). This prevents showing very old records that haven't been touched in years. If no results are found with the date filter, retry without it and inform the user.
- PROPERTIES: Always request relevant properties for meaningful results. For contacts: firstname, lastname, email, phone, company, lastmodifieddate, createdate. For deals: dealname, dealstage, amount, pipeline, closedate, lastmodifieddate, createdate. For companies: name, domain, industry, lastmodifieddate, createdate.
- PAGINATION: Check the "total" count in results. If total exceeds the returned results, inform the user there are more records available.
- INDEX DELAY: HubSpot search results may have a slight delay for very recently created or modified records (up to a few hours). When showing recent records, add a brief note that very recent changes may not appear immediately in search results. If the user asks about a specific contact/deal that doesn't appear in search, try searching by email/name using the "query" parameter which uses a different, more real-time lookup.`,
};
