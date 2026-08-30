import { McpConnectorProvider } from '../../generated/prisma/client.js';
import type { ProviderDefinition } from '../types.js';
import { MCP_GOOGLE_AUTH_URL, MCP_GOOGLE_SERVER_URL } from './shared-config.js';

export const GOOGLE_ANALYTICS_PROVIDER: ProviderDefinition = {
  provider: McpConnectorProvider.GOOGLE_ANALYTICS,
  name: 'Google Analytics',
  description: 'Access traffic reports, conversions, and audience insights.',
  icon: 'chart-bar',
  mcpServerUrl: MCP_GOOGLE_SERVER_URL,
  authBaseUrl: MCP_GOOGLE_AUTH_URL,
  authPath: '/auth/google',
  scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  systemPromptFragment: `For Google Analytics (GA4):
- PROPERTY ID: All Analytics tools require a property_id (numeric GA4 property ID). If the user hasn't provided it, ask them for it. Do NOT guess.
- DATE RANGES: Use start_date and end_date in YYYY-MM-DD format. Also supports relative dates: "7daysAgo", "30daysAgo", "today", "yesterday". For "this month", calculate the first day of the current month as start_date and "today" as end_date.
- DEFAULT RANGE: When user asks for a report without specifying dates, default to "30daysAgo" to "today" for a meaningful overview.
- TOOL SELECTION: For general traffic overview use get_traffic_report. For conversion/goal data use get_conversion_data. For "which pages are most popular" use get_top_pages. For demographics/devices/countries use get_audience_insights.
- COMBINE REPORTS: When user asks a broad question like "how is my website doing?", call get_traffic_report AND get_top_pages together to give a comprehensive answer.`,
};
