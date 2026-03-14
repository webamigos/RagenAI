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
      organization_id_user_id_provider: {
        organization_id: organizationId,
        user_id: userId,
        provider: McpConnectorProvider.FIREFLIES,
      },
    },
    select: {
      enabled: true,
      status: true,
      customer_id: true,
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
      connector.customer_id,
      McpConnectorProvider.FIREFLIES,
    );

    if (!token?.access_token) {
      return null;
    }

    return { apiKey: token.access_token };
  } catch (err) {
    logger.warn('Failed to retrieve Fireflies token from vault', {
      error: err,
    });
    return null;
  }
};
