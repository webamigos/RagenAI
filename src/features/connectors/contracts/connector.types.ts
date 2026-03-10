import type {
  McpConnector,
  McpConnectorProvider,
  McpConnectorStatus,
} from '@/generated/prisma/client';

export type ConnectorDto = Pick<
  McpConnector,
  | 'id'
  | 'provider'
  | 'mcp_server_url'
  | 'customer_id'
  | 'enabled'
  | 'status'
  | 'connected_at'
  | 'created_at'
>;

export type ProviderDefinition = {
  provider: McpConnectorProvider;
  name: string;
  description: string;
  icon: string;
  mcpServerUrl: string;
  authPath: string;
  authType?: 'oauth' | 'api_key';
  scopes?: string[];
};

export type { McpConnectorProvider, McpConnectorStatus };
