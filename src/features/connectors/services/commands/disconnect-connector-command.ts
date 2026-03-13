'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export const disconnectConnectorCommand = async (
  connectorId: string,
  organizationId: string,
  userId: string,
) => {
  try {
    const connector = await db.mcpConnector.findUnique({
      where: {
        id: connectorId,
        organization_id: organizationId,
        user_id: userId,
      },
      select: { provider: true },
    });

    if (!connector) {
      throw new Error('Connector not found');
    }

    return await db.$transaction(async (tx) => {
      await tx.mcpOAuthToken.deleteMany({
        where: {
          organization_id: organizationId,
          user_id: userId,
          provider: connector.provider,
        },
      });

      return tx.mcpConnector.delete({
        where: {
          id: connectorId,
          organization_id: organizationId,
          user_id: userId,
        },
      });
    });
  } catch (error) {
    logger.error({ err: error }, 'Error disconnecting connector');
    throw error;
  }
};
