'use server';

import db from '@ragenai/prisma-client';
import {
  type McpConnectorProvider,
  McpConnectorStatus,
} from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
import { getProviderDefinition } from '../../constants/providers';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';
import { UnauthorizedException } from '@/libs/utils/errors';

export const createConnectorCommand = async (
  organizationId: string,
  userId: string,
  provider: McpConnectorProvider,
) => {
  const canConnect = await isFeatureEnabledQuery(
    organizationId,
    'mcpConnectors',
  );
  if (!canConnect) {
    throw new UnauthorizedException(
      'MCP connectors are not enabled for your organization plan',
    );
  }

  const providerDef = getProviderDefinition(provider);
  if (!providerDef) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const customerId = `${organizationId}:${userId}:${provider.toLowerCase()}`;
  const baseUrl = providerDef.mcpServerUrl.replace(/\/+$/, '');
  let mcpServerUrl: string;
  if (
    providerDef.authType === 'external_mcp' ||
    providerDef.authType === 'api_key_bearer'
  ) {
    mcpServerUrl = baseUrl;
  } else if (baseUrl.endsWith('/mcp')) {
    mcpServerUrl = baseUrl;
  } else {
    mcpServerUrl = `${baseUrl}/mcp`;
  }

  try {
    const connector = await db.mcpConnector.upsert({
      where: {
        organizationId_userId_provider: {
          organizationId: organizationId,
          userId: userId,
          provider,
        },
      },
      update: {
        status: McpConnectorStatus.PENDING,
        mcpServerUrl: mcpServerUrl,
        customerId: customerId,
      },
      create: {
        organizationId: organizationId,
        userId: userId,
        provider,
        mcpServerUrl: mcpServerUrl,
        customerId: customerId,
        status: McpConnectorStatus.PENDING,
      },
      select: {
        id: true,
        provider: true,
        customerId: true,
        mcpServerUrl: true,
        status: true,
      },
    });

    trackAudit({
      action: 'connector.connected',
      entityType: 'connector',
      entityId: connector.id,
      newData: { provider: connector.provider },
    });

    return connector;
  } catch (error) {
    logger.error({ err: error }, 'Error creating connector');
    throw error;
  }
};
