import db from '@ragenai/prisma-client';
import {
  McpConnectorProvider,
  McpConnectorStatus,
} from '@/generated/prisma/client';

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
    },
  });

  if (
    !connector ||
    connector.status !== McpConnectorStatus.CONNECTED ||
    !connector.enabled
  ) {
    return null;
  }

  const token = await db.mcpOAuthToken.findUnique({
    where: {
      organization_id_user_id_provider: {
        organization_id: organizationId,
        user_id: userId,
        provider: McpConnectorProvider.FIREFLIES,
      },
    },
    select: { access_token: true },
  });

  if (!token?.access_token) {
    return null;
  }

  return { apiKey: token.access_token };
};
