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
        organizationId: organizationId,
        userId: userId,
        enabled: true,
        status: McpConnectorStatus.CONNECTED,
      },
      select: {
        id: true,
        provider: true,
        mcpServerUrl: true,
        customerId: true,
        organizationId: true,
        userId: true,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching enabled connectors');
    throw error;
  }
};
