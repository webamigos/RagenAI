import { logger } from '@/app/lib/utils/logger';
import { getEnabledConnectorsQuery } from '@/features/connectors/services/queries/get-enabled-connectors-query';
import { getAvailableConnectorProvidersForOrg } from '@/features/connectors/services/queries/get-available-connectors-query';
import { getProjectMcpProvidersQuery } from '@/features/projects/services/queries/get-project-mcp-providers-query';
import { createMcpToolsFromConnectors } from '@/libs/mcp/client';
import { buildMcpContext } from '@/libs/mcp/provider-instructions';

type LoadMcpToolsParams = {
  orgId: string;
  userId: string;
  projectId: string;
};

type LoadMcpToolsResult = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mcpTools: Record<string, any> | undefined;
  mcpContext: string | undefined;
  closeMcpClients: () => Promise<void>;
};

/**
 * Load MCP tools for an API request. Mirrors the connector-loading
 * logic in `assistant-stream.ts` but without session-based auth —
 * the userId comes from the internal `x-user-id` header instead.
 */
export async function loadMcpToolsForApiRequest({
  orgId,
  userId,
  projectId,
}: LoadMcpToolsParams): Promise<LoadMcpToolsResult> {
  const noop = async () => {};

  try {
    let connectors = await getEnabledConnectorsQuery(orgId, userId);

    const orgAllowedProviders =
      await getAvailableConnectorProvidersForOrg(orgId);
    connectors = connectors.filter((c) =>
      orgAllowedProviders.includes(c.provider),
    );

    if (projectId && connectors.length > 0) {
      const projectMcpProviders = await getProjectMcpProvidersQuery(projectId);
      if (projectMcpProviders.length > 0) {
        connectors = connectors.filter((c) =>
          projectMcpProviders.includes(c.provider),
        );
      }
    }

    if (connectors.length === 0) {
      return {
        mcpTools: undefined,
        mcpContext: undefined,
        closeMcpClients: noop,
      };
    }

    const { tools, loadedProviders, closeAll } =
      await createMcpToolsFromConnectors(connectors);

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const currentDateTime = new Date().toLocaleString('en-US', {
      timeZone,
      dateStyle: 'full',
      timeStyle: 'long',
    });
    const mcpContext = buildMcpContext(
      loadedProviders,
      timeZone,
      currentDateTime,
    );

    logger.info(
      { toolCount: Object.keys(tools).length },
      'MCP tools loaded for API request',
    );

    return { mcpTools: tools, mcpContext, closeMcpClients: closeAll };
  } catch (error) {
    logger.error(
      { err: error },
      'Failed to load MCP tools for API request, continuing without them',
    );
    return {
      mcpTools: undefined,
      mcpContext: undefined,
      closeMcpClients: noop,
    };
  }
}
