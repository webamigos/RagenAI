import db from '@ragenai/prisma-client';
import { McpConnectorStatus } from '@/generated/prisma/client';
import { ragenAuthClient } from '@/libs/ragen-vault';
import { logger } from '@/app/lib/utils/logger';

/**
 * The catalogue slug, which for a built-in is the old enum member verbatim —
 * vault token paths and `customerId`s already hold that string.
 */
const FIREFLIES_SLUG = 'FIREFLIES';

export type FirefliesConnectorResult = {
  apiKey: string;
} | null;

export const getFirefliesConnectorQuery = async (
  organizationId: string,
  userId: string,
): Promise<FirefliesConnectorResult> => {
  const connector = await db.mcpConnector.findUnique({
    where: {
      organizationId_userId_providerSlug: {
        organizationId: organizationId,
        userId: userId,
        providerSlug: FIREFLIES_SLUG,
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
      FIREFLIES_SLUG,
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
