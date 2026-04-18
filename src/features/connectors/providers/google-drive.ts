import { McpConnectorProvider } from '@/generated/prisma/client';
import type { ProviderDefinition } from '../contracts/connector.types';
import { MCP_GOOGLE_AUTH_URL, MCP_GOOGLE_SERVER_URL } from './shared-config';

export const GOOGLE_DRIVE_PROVIDER: ProviderDefinition = {
  provider: McpConnectorProvider.GOOGLE_DRIVE,
  name: 'Google Drive',
  description: 'Search and read documents from your Google Drive.',
  icon: 'folder',
  mcpServerUrl: MCP_GOOGLE_SERVER_URL,
  authBaseUrl: MCP_GOOGLE_AUTH_URL,
  authPath: '/auth/google',
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  systemPromptFragment: `For Google Drive:
- Use the available Drive tools to search and read documents from the user's Google Drive.
- When searching, use relevant keywords from the user's query.
- Drive access is read-only — you can search and read documents but cannot create or modify them.`,
};
