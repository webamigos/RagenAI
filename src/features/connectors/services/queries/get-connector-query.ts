import db from '@ragenai/prisma-client';
import {
  type McpConnectorProvider,
  McpConnectorStatus,
} from '@/generated/prisma/client';

export type ConnectorLookupResult = {
  mcp_server_url: string;
  customer_id: string;
  baseUrl: string;
} | null;

export const getConnectorQuery = async (
  organizationId: string,
  userId: string,
  provider: McpConnectorProvider,
): Promise<ConnectorLookupResult> => {
  const connector = await db.mcpConnector.findUnique({
    where: {
      organization_id_user_id_provider: {
        organization_id: organizationId,
        user_id: userId,
        provider,
      },
    },
    select: {
      mcp_server_url: true,
      customer_id: true,
      enabled: true,
      status: true,
    },
  });

  if (
    !connector ||
    connector.status !== McpConnectorStatus.CONNECTED ||
    !connector.enabled ||
    !connector.mcp_server_url ||
    !connector.customer_id
  ) {
    return null;
  }

  // mcp_server_url has /mcp suffix (for MCP protocol), strip it for REST endpoints
  const baseUrl = connector.mcp_server_url.replace(/\/mcp$/, '');

  return {
    mcp_server_url: connector.mcp_server_url,
    customer_id: connector.customer_id,
    baseUrl,
  };
};
