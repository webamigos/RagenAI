'use server';

import db from '@ragenai/prisma-client';
import { McpConnectorStatus } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { resolveConnectorDefinitionQuery } from '../queries/get-connector-definitions-query';
import { ragenAuthClient } from '@/libs/ragen-vault';

/**
 * Store an API key as a Bearer token for direct MCP server auth.
 * Used for providers like Fireflies where OAuth doesn't give proper data access
 * but the API key works as a Bearer token against their MCP server.
 */
export const registerApiKeyBearerCommand = async (
  organizationId: string,
  userId: string,
  provider: string,
  apiKey: string,
) => {
  const providerDef = await resolveConnectorDefinitionQuery(provider);
  if (!providerDef || providerDef.authType !== 'api_key_bearer') {
    throw new Error(`Invalid provider for API key bearer auth: ${provider}`);
  }

  const customerId = `${organizationId}:${userId}:${provider.toLowerCase()}`;

  try {
    // Store the API key in ragen-vault (encrypted at rest)
    await ragenAuthClient.storeToken(customerId, provider, {
      accessToken: apiKey,
      tokenType: 'Bearer',
    });

    // Create/update the connector and mark as connected
    return await db.mcpConnector.upsert({
      where: {
        organizationId_userId_providerSlug: {
          organizationId: organizationId,
          userId: userId,
          providerSlug: provider,
        },
      },
      update: {
        status: McpConnectorStatus.CONNECTED,
        mcpServerUrl: providerDef.mcpServerUrl,
        customerId: customerId,
        connectedAt: new Date(),
      },
      create: {
        organizationId: organizationId,
        userId: userId,
        providerSlug: provider,
        mcpServerUrl: providerDef.mcpServerUrl,
        customerId: customerId,
        status: McpConnectorStatus.CONNECTED,
        connectedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        connectedAt: true,
      },
    });
  } catch (error) {
    logger.error({ err: error, provider }, 'Error registering API key bearer');
    throw error;
  }
};
