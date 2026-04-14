import { McpConnectorProvider } from '@/generated/prisma/client';
import type { ProviderDefinition } from '../contracts/connector.types';

const MCP_GOOGLE_SERVER_URL =
  process.env.MCP_GOOGLE_SERVER_URL || 'http://localhost:8000';
const MCP_GOOGLE_AUTH_URL =
  process.env.MCP_GOOGLE_AUTH_URL || MCP_GOOGLE_SERVER_URL;

const MCP_CLICKUP_SERVER_URL =
  process.env.MCP_CLICKUP_SERVER_URL || 'https://mcp.clickup.com/mcp';
const MCP_HUBSPOT_SERVER_URL =
  process.env.MCP_HUBSPOT_SERVER_URL || 'https://mcp.hubspot.com';
const MCP_FIREFLIES_SERVER_URL =
  process.env.MCP_FIREFLIES_SERVER_URL || 'https://api.fireflies.ai/mcp';
const MCP_SLACK_SERVER_URL =
  process.env.MCP_SLACK_SERVER_URL || 'https://mcp.slack.com/mcp';

export const CONNECTOR_PROVIDERS: ProviderDefinition[] = [
  {
    provider: McpConnectorProvider.GOOGLE_DRIVE,
    name: 'Google Drive',
    description: 'Search and read documents from your Google Drive.',
    icon: 'folder',
    mcpServerUrl: MCP_GOOGLE_SERVER_URL,
    authBaseUrl: MCP_GOOGLE_AUTH_URL,
    authPath: '/auth/google',
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  },
  {
    provider: McpConnectorProvider.GOOGLE_CALENDAR,
    name: 'Google Calendar',
    description: 'View calendar events and check availability.',
    icon: 'calendar',
    mcpServerUrl: MCP_GOOGLE_SERVER_URL,
    authBaseUrl: MCP_GOOGLE_AUTH_URL,
    authPath: '/auth/google',
    scopes: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events.readonly',
    ],
  },
  {
    provider: McpConnectorProvider.GMAIL,
    name: 'Gmail',
    description: 'Search emails and read messages.',
    icon: 'mail',
    mcpServerUrl: MCP_GOOGLE_SERVER_URL,
    authBaseUrl: MCP_GOOGLE_AUTH_URL,
    authPath: '/auth/google',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
  },
  {
    provider: McpConnectorProvider.CLICKUP,
    name: 'ClickUp',
    description: 'Manage tasks, projects, and workspaces.',
    icon: 'check-square',
    mcpServerUrl: MCP_CLICKUP_SERVER_URL,
    authType: 'external_mcp',
  },
  {
    provider: McpConnectorProvider.HUBSPOT,
    name: 'HubSpot',
    description: 'Access contacts, companies, deals, and CRM data.',
    icon: 'database',
    mcpServerUrl: MCP_HUBSPOT_SERVER_URL,
    authType: 'external_mcp',
    oauthClientId: process.env.HUBSPOT_MCP_CLIENT_ID,
    oauthClientSecret: process.env.HUBSPOT_MCP_CLIENT_SECRET,
  },
  {
    provider: McpConnectorProvider.SLACK,
    name: 'Slack',
    description: 'Search messages, channels, and send messages.',
    icon: 'message-square',
    mcpServerUrl: MCP_SLACK_SERVER_URL,
    authType: 'external_mcp',
    oauthClientId: process.env.SLACK_MCP_CLIENT_ID,
    oauthClientSecret: process.env.SLACK_MCP_CLIENT_SECRET,
    useUserScope: true,
    scopes: [
      'search:read.public',
      'search:read.private',
      'channels:history',
      'groups:history',
      'mpim:history',
      'im:history',
      'users:read',
    ],
  },
  {
    provider: McpConnectorProvider.FIREFLIES,
    name: 'Fireflies.ai',
    description: 'Search meeting transcripts, summaries, and action items.',
    icon: 'mic',
    mcpServerUrl: MCP_FIREFLIES_SERVER_URL,
    authType: 'api_key_bearer',
    apiKeyHelpUrl:
      'https://docs.fireflies.ai/getting-started/quickstart#obtaining-authentication-credentials',
  },
  {
    provider: McpConnectorProvider.GOOGLE_ANALYTICS,
    name: 'Google Analytics',
    description: 'Access traffic reports, conversions, and audience insights.',
    icon: 'chart-bar',
    mcpServerUrl: MCP_GOOGLE_SERVER_URL,
    authBaseUrl: MCP_GOOGLE_AUTH_URL,
    authPath: '/auth/google',
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  },
  {
    provider: McpConnectorProvider.GOOGLE_ADS,
    name: 'Google Ads',
    description: 'View campaigns, performance, and track costs.',
    icon: 'megaphone',
    mcpServerUrl: MCP_GOOGLE_SERVER_URL,
    authBaseUrl: MCP_GOOGLE_AUTH_URL,
    authPath: '/auth/google',
    scopes: ['https://www.googleapis.com/auth/adwords'],
  },
  {
    provider: McpConnectorProvider.WOOCOMMERCE,
    name: 'WooCommerce',
    description: 'Manage products and orders from your WooCommerce store.',
    icon: 'shopping-cart',
    // Per-connector URL — computed from the user's shop URL + mcpServerUrlPath
    // at registration time. The value here is only used as a placeholder.
    mcpServerUrl: '',
    authType: 'api_key_custom_header',
    headerName: 'X-MCP-API-Key',
    mcpServerUrlPath: '/wp-json/woocommerce/mcp',
    apiKeyHelpUrl:
      'https://woocommerce.com/document/woocommerce-rest-api/#section-2',
  },
];

export const getProviderDefinition = (
  provider: McpConnectorProvider,
): ProviderDefinition | undefined => {
  return CONNECTOR_PROVIDERS.find((p) => p.provider === provider);
};
