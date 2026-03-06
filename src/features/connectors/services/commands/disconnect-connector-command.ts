'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export const disconnectConnectorCommand = async (
  connectorId: string,
  organizationId: string,
  userId: string,
) => {
  try {
    return await db.mcpConnector.delete({
      where: {
        id: connectorId,
        organization_id: organizationId,
        user_id: userId,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error disconnecting connector');
    throw error;
  }
};
