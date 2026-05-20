'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { McpConnectorStatus } from '@/generated/prisma/client';
import db from '@ragenai/prisma-client';
import { getProjectMcpProvidersQuery } from '@/features/projects/services/queries/get-project-mcp-providers-query';
import { saveProjectMcpProvidersCommand } from '@/features/projects/services/commands/save-project-mcp-providers-command';
import { markIntegrationsPromptedCommand } from '@/features/projects/services/commands/mark-integrations-prompted-command';
import { getAvailableConnectorProvidersForOrg } from '@/features/connectors/services/queries/get-available-connectors-query';
import { logger } from '@/app/lib/utils/logger';

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
    const orgId = await getOrgIdFromAuthOrThrow();

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    });

    if (!project || project.organizationId !== orgId) {
      return [];
    }

    return await getProjectMcpProvidersQuery(projectId, orgId);
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
    const orgId = await getOrgIdFromAuthOrThrow();

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

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    });

    if (!project || project.organizationId !== orgId) {
      logger.error(
        { projectId, orgId },
        'Unauthorized: project does not belong to user organization',
      );
      return { success: false };
    }

    await saveProjectMcpProvidersCommand(projectId, providers);
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
    return await markIntegrationsPromptedCommand(projectId);
  } catch (error) {
    logger.error({ err: error }, 'Failed to mark integrations prompted');
    return { success: false };
  }
}
