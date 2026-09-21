import db from '@ragenai/prisma-client';
import { McpConnectorStatus } from '@/generated/prisma/client';
import { resolveConnectorDefinitionQuery } from './get-connector-definitions-query';

export type ConnectorLookupResult = {
  mcpServerUrl: string;
  customerId: string;
  baseUrl: string;
} | null;

export const getConnectorQuery = async (
  organizationId: string,
  userId: string,
  provider: string,
): Promise<ConnectorLookupResult> => {
  const connector = await db.mcpConnector.findUnique({
    where: {
      organizationId_userId_providerSlug: {
        organizationId: organizationId,
        userId: userId,
        providerSlug: provider,
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

  // A disabled entry, or one no longer in the catalogue, resolves to nothing
  // — and that has to end the lookup rather than fall through to the stored
  // row. Disabling is the switch an operator has instead of a feature flag,
  // and an entry that is off everywhere except the connectors already using
  // it is not off.
  const providerDef = await resolveConnectorDefinitionQuery(provider);
  if (!providerDef) {
    return null;
  }

  // Use authBaseUrl from provider definition for REST endpoints (HTTP API),
  // falling back to mcpServerUrl with /mcp suffix stripped
  const baseUrl =
    providerDef.authBaseUrl || connector.mcpServerUrl.replace(/\/mcp$/, '');

  return {
    mcpServerUrl: connector.mcpServerUrl,
    customerId: connector.customerId,
    baseUrl,
  };
};
