import db from '@ragenai/prisma-client';
import {
  McpConnectorProvider,
  McpConnectorStatus,
} from '@/generated/prisma/client';
import { ragenAuthClient } from '@/libs/ragen-vault';
import { logger } from '@/app/lib/utils/logger';

export type FirefliesConnectorResult = {
  apiKey: string;
} | null;

export const getFirefliesConnectorQuery = async (
  organizationId: string,
  userId: string,
): Promise<FirefliesConnectorResult> => {
  const connector = await db.mcpConnector.findUnique({
    where: {
      organizationId_userId_provider: {
        organizationId: organizationId,
        userId: userId,
        provider: McpConnectorProvider.FIREFLIES,
      },
    },
    select: {
      enabled: true,
      status: true,
      customerId: true,
    },
  });

  if (
    !connector ||
    connector.status !== McpConnectorStatus.CONNECTED ||
    !connector.enabled
  ) {
    return null;
  }

  try {
    const token = await ragenAuthClient.getToken(
      connector.customerId,
      McpConnectorProvider.FIREFLIES,
    );

    if (!token?.accessToken) {
      return null;
    }

    return { apiKey: token.accessToken };
  } catch (err) {
    logger.warn('Failed to retrieve Fireflies token from vault', {
      error: err,
    });
    return null;
  }
};
