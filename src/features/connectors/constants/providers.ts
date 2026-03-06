import { McpConnectorProvider } from '@/generated/prisma/client';
import type { ProviderDefinition } from '../contracts/connector.types';

const MCP_GOOGLE_SERVER_URL =
  process.env.MCP_GOOGLE_SERVER_URL || 'http://localhost:8000';

export const CONNECTOR_PROVIDERS: ProviderDefinition[] = [
  {
    provider: McpConnectorProvider.GOOGLE_CALENDAR,
    name: 'Google Calendar',
    description: 'View, create, and manage calendar events.',
    icon: 'calendar',
    mcpServerUrl: MCP_GOOGLE_SERVER_URL,
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  },
  {
    provider: McpConnectorProvider.GOOGLE_ANALYTICS,
    name: 'Google Analytics',
    description: 'Access traffic reports, conversions, and audience insights.',
    icon: 'chart-bar',
    mcpServerUrl: MCP_GOOGLE_SERVER_URL,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  },
  {
    provider: McpConnectorProvider.GOOGLE_ADS,
    name: 'Google Ads',
    description: 'Manage campaigns, view performance, and track costs.',
    icon: 'megaphone',
    mcpServerUrl: MCP_GOOGLE_SERVER_URL,
    scopes: ['https://www.googleapis.com/auth/adwords'],
  },
];

export const getProviderDefinition = (
  provider: McpConnectorProvider,
): ProviderDefinition | undefined => {
  return CONNECTOR_PROVIDERS.find((p) => p.provider === provider);
};
