'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export const toggleConnectorCommand = async (
  connectorId: string,
  organizationId: string,
  userId: string,
  enabled: boolean,
) => {
  try {
    return await db.mcpConnector.update({
      where: {
        id: connectorId,
        organization_id: organizationId,
        user_id: userId,
      },
      data: {
        enabled,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error toggling connector');
    throw error;
  }
};
