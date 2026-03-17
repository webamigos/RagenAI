'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import type { ConnectorDto } from '../../contracts/connector.types';

export const getUserConnectorsQuery = async (
  organizationId: string,
  userId: string,
): Promise<ConnectorDto[]> => {
  try {
    return await db.mcpConnector.findMany({
      where: {
        organizationId: organizationId,
        userId: userId,
      },
      select: {
        id: true,
        provider: true,
        mcpServerUrl: true,
        customerId: true,
        enabled: true,
        status: true,
        connectedAt: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching connectors for user');
    throw error;
  }
};
