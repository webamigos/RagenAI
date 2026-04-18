import { McpConnectorProvider } from '@/generated/prisma/client';
import type { ProviderDefinition } from '../contracts/connector.types';
import { MCP_GOOGLE_AUTH_URL, MCP_GOOGLE_SERVER_URL } from './shared-config';

export const GOOGLE_ADS_PROVIDER: ProviderDefinition = {
  provider: McpConnectorProvider.GOOGLE_ADS,
  name: 'Google Ads',
  description: 'View campaigns, performance, and track costs.',
  icon: 'megaphone',
  mcpServerUrl: MCP_GOOGLE_SERVER_URL,
  authBaseUrl: MCP_GOOGLE_AUTH_URL,
  authPath: '/auth/google',
  scopes: ['https://www.googleapis.com/auth/adwords'],
  systemPromptFragment: `For Google Ads:
- CUSTOMER ID: All Ads tools require ads_customer_id (10-digit, no dashes). If the user hasn't provided it, ask them for it. Do NOT guess.
- WORKFLOW: Always call list_campaigns first to discover available campaigns before calling get_campaign_performance (which requires the exact campaign name).
- DATE RANGES: Use start_date and end_date in YYYY-MM-DD format. Default to last 30 days if user doesn't specify.
- COST OVERVIEW: For "how much am I spending?" or "what's my ad budget?", use get_cost_summary which gives totals across all campaigns.
- CAMPAIGN DETAILS: For "how is campaign X performing?", first list_campaigns to verify the name, then get_campaign_performance with the exact name.`,
};
