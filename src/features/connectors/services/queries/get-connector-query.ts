import db from '@ragenai/prisma-client';
import {
  type McpConnectorProvider,
  McpConnectorStatus,
} from '@/generated/prisma/client';
import { getProviderDefinition } from '../../constants/providers';

export type ConnectorLookupResult = {
  mcpServerUrl: string;
  customerId: string;
  baseUrl: string;
} | null;

export const getConnectorQuery = async (
  organizationId: string,
  userId: string,
  provider: McpConnectorProvider,
): Promise<ConnectorLookupResult> => {
  const connector = await db.mcpConnector.findUnique({
    where: {
      organizationId_userId_provider: {
        organizationId: organizationId,
        userId: userId,
        provider,
      },
    },
    select: {
      mcpServerUrl: true,
      customerId: true,
      enabled: true,
      status: true,
    },
  });

  if (
    !connector ||
    connector.status !== McpConnectorStatus.CONNECTED ||
    !connector.enabled ||
    !connector.mcpServerUrl ||
    !connector.customerId
  ) {
    return null;
  }

  // Use authBaseUrl from provider definition for REST endpoints (HTTP API),
  // falling back to mcpServerUrl with /mcp suffix stripped
  const providerDef = getProviderDefinition(provider);
  const baseUrl =
    providerDef?.authBaseUrl || connector.mcpServerUrl.replace(/\/mcp$/, '');

  return {
    mcpServerUrl: connector.mcpServerUrl,
    customerId: connector.customerId,
    baseUrl,
  };
};
