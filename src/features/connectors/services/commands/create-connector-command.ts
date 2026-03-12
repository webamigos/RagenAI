'use server';

import db from '@ragenai/prisma-client';
import {
  type McpConnectorProvider,
  McpConnectorStatus,
} from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { getProviderDefinition } from '../../constants/providers';

export const createConnectorCommand = async (
  organizationId: string,
  userId: string,
  provider: McpConnectorProvider,
) => {
  const providerDef = getProviderDefinition(provider);
  if (!providerDef) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const customerId = `${organizationId}:${userId}:${provider.toLowerCase()}`;
  const mcpServerUrl =
    providerDef.authType === 'external_mcp'
      ? providerDef.mcpServerUrl
      : `${providerDef.mcpServerUrl}/mcp`;

  try {
    return await db.mcpConnector.upsert({
      where: {
        organization_id_user_id_provider: {
          organization_id: organizationId,
          user_id: userId,
          provider,
        },
      },
      update: {
        status: McpConnectorStatus.PENDING,
        mcp_server_url: mcpServerUrl,
        customer_id: customerId,
      },
      create: {
        organization_id: organizationId,
        user_id: userId,
        provider,
        mcp_server_url: mcpServerUrl,
        customer_id: customerId,
        status: McpConnectorStatus.PENDING,
      },
      select: {
        id: true,
        provider: true,
        customer_id: true,
        mcp_server_url: true,
        status: true,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating connector');
    throw error;
  }
};
