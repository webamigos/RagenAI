import { McpConnectorProvider } from '@/generated/prisma/client';
import type { ProviderDefinition } from '../contracts/connector.types';

const MCP_GOOGLE_SERVER_URL = (() => {
  if (process.env.MCP_GOOGLE_SERVER_URL) {
    return process.env.MCP_GOOGLE_SERVER_URL;
  }
  if (process.env.NODE_ENV !== 'development') {
    throw new Error(
      'MCP_GOOGLE_SERVER_URL is required in non-development environments',
    );
  }
  return 'http://localhost:8000';
})();

export const CONNECTOR_PROVIDERS: ProviderDefinition[] = [
  {
    provider: McpConnectorProvider.GOOGLE_DRIVE,
    name: 'Google Drive',
    description: 'Search and read documents from your Google Drive.',
    icon: 'folder',
    mcpServerUrl: MCP_GOOGLE_SERVER_URL,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  },
  {
    provider: McpConnectorProvider.GOOGLE_CALENDAR,
    name: 'Google Calendar',
    description: 'View calendar events and check availability.',
    icon: 'calendar',
    mcpServerUrl: MCP_GOOGLE_SERVER_URL,
    scopes: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events.readonly',
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
    description: 'View campaigns, performance, and track costs.',
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
