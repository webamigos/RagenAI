'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { ragenAuthClient } from '@/libs/ragen-vault';

export const disconnectConnectorCommand = async (
  connectorId: string,
  organizationId: string,
  userId: string,
) => {
  try {
    const connector = await db.mcpConnector.findUnique({
      where: {
        id: connectorId,
        organizationId: organizationId,
        userId: userId,
      },
      select: { provider: true, customerId: true },
    });

    if (!connector) {
      throw new Error('Connector not found');
    }

    // Delete token from ragen-vault
    try {
      await ragenAuthClient.deleteToken(
        connector.customerId,
        connector.provider,
      );
    } catch (error) {
      logger.warn(
        { err: error, provider: connector.provider },
        'Failed to delete token from ragen-vault (may not exist)',
      );
    }

    // Delete the connector record
    return await db.mcpConnector.delete({
      where: {
        id: connectorId,
        organizationId: organizationId,
        userId: userId,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error disconnecting connector');
    throw error;
  }
};
