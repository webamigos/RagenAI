'use server';

import db from '@ragenai/prisma-client';
import {
  type McpConnectorProvider,
  McpConnectorStatus,
} from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { getProviderDefinition } from '../../constants/providers';
import { ragenAuthClient } from '@/libs/ragen-vault';

/**
 * Store an API key as a Bearer token for direct MCP server auth.
 * Used for providers like Fireflies where OAuth doesn't give proper data access
 * but the API key works as a Bearer token against their MCP server.
 */
export const registerApiKeyBearerCommand = async (
  organizationId: string,
  userId: string,
  provider: McpConnectorProvider,
  apiKey: string,
) => {
  const providerDef = getProviderDefinition(provider);
  if (!providerDef || providerDef.authType !== 'api_key_bearer') {
    throw new Error(`Invalid provider for API key bearer auth: ${provider}`);
  }

  const customerId = `${organizationId}:${userId}:${provider.toLowerCase()}`;

  try {
    // Store the API key in ragen-vault (encrypted at rest)
    await ragenAuthClient.storeToken(customerId, provider, {
      access_token: apiKey,
      token_type: 'Bearer',
    });

    // Create/update the connector and mark as connected
    return await db.mcpConnector.upsert({
      where: {
        organization_id_user_id_provider: {
          organization_id: organizationId,
          user_id: userId,
          provider,
        },
      },
      update: {
        status: McpConnectorStatus.CONNECTED,
        mcp_server_url: providerDef.mcpServerUrl,
        customer_id: customerId,
        connected_at: new Date(),
      },
      create: {
        organization_id: organizationId,
        user_id: userId,
        provider,
        mcp_server_url: providerDef.mcpServerUrl,
        customer_id: customerId,
        status: McpConnectorStatus.CONNECTED,
        connected_at: new Date(),
      },
      select: {
        id: true,
        status: true,
        connected_at: true,
      },
    });
  } catch (error) {
    logger.error({ err: error, provider }, 'Error registering API key bearer');
    throw error;
  }
};
