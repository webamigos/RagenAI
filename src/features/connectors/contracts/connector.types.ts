import type {
  McpConnector,
  McpConnectorProvider,
  McpConnectorStatus,
} from '@/generated/prisma/client';

export type ConnectorDto = Pick<
  McpConnector,
  | 'id'
  | 'provider'
  | 'mcpServerUrl'
  | 'customerId'
  | 'enabled'
  | 'status'
  | 'connectedAt'
  | 'createdAt'
>;

export type ProviderDefinition = {
  provider: McpConnectorProvider;
  name: string;
  description: string;
  icon: string;
  mcpServerUrl: string;
  authBaseUrl?: string;
  authPath?: string;
  authType?: 'oauth' | 'api_key' | 'api_key_bearer' | 'external_mcp';
  apiKeyHelpUrl?: string;
  scopes?: string[];
  oauthClientId?: string;
  oauthClientSecret?: string;
  /** If true, rewrites `scope` → `user_scope` in the OAuth authorization URL (required by Slack). */
  useUserScope?: boolean;
};

export type { McpConnectorProvider, McpConnectorStatus };
