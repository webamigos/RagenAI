'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { McpConnectorStatus } from '@/generated/prisma/client';
import db from '@ragenai/prisma-client';
import { getAvailableConnectorProvidersForOrg } from '@/features/connectors/services/queries/get-available-connectors-query';
import { logger } from '@/app/lib/utils/logger';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';

export type ConnectedProvider = {
  provider: string;
  name: string;
};

const MAX_PROVIDERS = 50;
const MAX_PROVIDER_LENGTH = 100;

export async function getConnectedProvidersAction(): Promise<
  ConnectedProvider[]
> {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }

  const [connectors, availableProviders] = await Promise.all([
    db.mcpConnector.findMany({
      where: {
        organizationId: orgId,
        userId,
        status: McpConnectorStatus.CONNECTED,
      },
      select: { provider: true },
      orderBy: { provider: 'asc' },
    }),
    getAvailableConnectorProvidersForOrg(orgId),
  ]);

  return connectors
    .filter((c) => availableProviders.includes(c.provider))
    .map((c) => ({
      provider: c.provider,
      name: c.provider,
    }));
}

export async function getProjectMcpProvidersAction(
  projectId: string,
): Promise<string[]> {
  try {
    const [orgId, userId] = await Promise.all([
      getOrgIdFromAuthOrThrow(),
      getCurrentUserId(),
    ]);
    if (!userId) {
      return [];
    }
    // apps/api's getProjectMcpProviders already scopes by organizationId
    // internally — no need to duplicate the project-ownership check here.
    return await ragenApiRequest<string[]>({
      method: 'GET',
      path: `/v1/internal/projects/${encodeURIComponent(projectId)}/mcp-providers`,
      userId,
      orgId,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get project MCP providers');
    return [];
  }
}

export async function saveProjectMcpProvidersAction(
  projectId: string,
  providers: string[],
): Promise<{ success: boolean }> {
  try {
    const [orgId, userId] = await Promise.all([
      getOrgIdFromAuthOrThrow(),
      getCurrentUserId(),
    ]);
    if (!userId) {
      return { success: false };
    }

    if (!Array.isArray(providers)) {
      logger.error('Invalid providers: not an array');
      return { success: false };
    }

    if (providers.length > MAX_PROVIDERS) {
      logger.error(
        { count: providers.length },
        'Invalid providers: exceeds max count',
      );
      return { success: false };
    }

    const valid = providers.every(
      (p) =>
        typeof p === 'string' &&
        p.length > 0 &&
        p.length <= MAX_PROVIDER_LENGTH,
    );

    if (!valid) {
      logger.error('Invalid providers: contains invalid entries');
      return { success: false };
    }

    // apps/api's saveProjectMcpProviders requires 'manage'-level project
    // access internally (requireAccess) — a stricter, correct replacement
    // for this action's previous plain org-membership check.
    await ragenApiRequest({
      method: 'PUT',
      path: `/v1/internal/projects/${encodeURIComponent(projectId)}/mcp-providers`,
      userId,
      orgId,
      body: { providers },
    });
    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Failed to save project MCP providers');
    return { success: false };
  }
}

export async function getIntegrationsPromptStatusAction(
  projectId: string,
): Promise<{ promptedAt: string | null }> {
  try {
    const orgId = await getOrgIdFromAuthOrThrow();
    const settings = await db.projectSettings.findUnique({
      where: { projectId },
      select: {
        integrationsPromptedAt: true,
        project: { select: { organizationId: true } },
      },
    });
    if (settings?.project && settings.project.organizationId !== orgId) {
      return { promptedAt: null };
    }
    return {
      promptedAt: settings?.integrationsPromptedAt
        ? settings.integrationsPromptedAt.toISOString()
        : null,
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to get integrations prompt status');
    return { promptedAt: null };
  }
}

export async function markIntegrationsPromptedAction(
  projectId: string,
): Promise<{ success: boolean }> {
  try {
    const [orgId, userId] = await Promise.all([
      getOrgIdFromAuthOrThrow(),
      getCurrentUserId(),
    ]);
    if (!userId) {
      return { success: false };
    }
    return await ragenApiRequest({
      method: 'POST',
      path: `/v1/internal/projects/${encodeURIComponent(projectId)}/mark-integrations-prompted`,
      userId,
      orgId,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to mark integrations prompted');
    return { success: false };
  }
}
