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
        organization_id: organizationId,
        user_id: userId,
      },
      select: {
        id: true,
        provider: true,
        mcp_server_url: true,
        customer_id: true,
        enabled: true,
        status: true,
        connected_at: true,
        created_at: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching connectors for user');
    throw error;
  }
};
