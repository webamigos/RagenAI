'use server';

import db from '@ragenai/prisma-client';
import { McpConnectorStatus } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';

export const getEnabledConnectorsQuery = async (
  organizationId: string,
  userId: string,
) => {
  try {
    return await db.mcpConnector.findMany({
      where: {
        organization_id: organizationId,
        user_id: userId,
        enabled: true,
        status: McpConnectorStatus.CONNECTED,
      },
      select: {
        id: true,
        provider: true,
        mcp_server_url: true,
        customer_id: true,
        organization_id: true,
        user_id: true,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching enabled connectors');
    throw error;
  }
};
