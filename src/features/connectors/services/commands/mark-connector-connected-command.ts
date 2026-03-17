'use server';

import db from '@ragenai/prisma-client';
import { McpConnectorStatus } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';

export const markConnectorConnectedCommand = async (
  connectorId: string,
  organizationId: string,
  userId: string,
) => {
  try {
    return await db.mcpConnector.update({
      where: {
        id: connectorId,
        organizationId: organizationId,
        userId: userId,
      },
      data: {
        status: McpConnectorStatus.CONNECTED,
        connectedAt: new Date(),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error marking connector as connected');
    throw error;
  }
};
