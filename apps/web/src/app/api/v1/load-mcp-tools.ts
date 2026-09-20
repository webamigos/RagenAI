import { logger } from '@/app/lib/utils/logger';
import { getEnabledConnectorsQuery } from '@/features/connectors/services/queries/get-enabled-connectors-query';
import { getAvailableConnectorsForOrg } from '@/features/connectors/services/queries/get-available-connectors-query';
import { getProjectMcpProvidersQuery } from '@/features/projects/services/queries/get-project-mcp-providers-query';
import { createMcpToolsFromConnectors } from '@/libs/mcp/client';
import { buildMcpContext } from '@/libs/mcp/provider-instructions';

type LoadMcpToolsParams = {
  orgId: string;
  userId: string;
  projectId: string;
};

type LoadMcpToolsResult = {
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

    // One resolution of the catalogue for the whole turn: the allowlist and
    // the definitions the loader needs come from the same rows.
    const available = await getAvailableConnectorsForOrg(orgId);
    const definitions = Object.fromEntries(
      available.map((definition) => [definition.provider, definition]),
    );
    connectors = connectors.filter((c) => c.provider in definitions);

    if (projectId && connectors.length > 0) {
      const projectMcpProviders = await getProjectMcpProvidersQuery(projectId);
      connectors = connectors.filter((c) =>
        projectMcpProviders.includes(c.provider),
      );
    }

    if (connectors.length === 0) {
      return {
        mcpTools: undefined,
        mcpContext: undefined,
        closeMcpClients: noop,
      };
    }

    const { tools, loadedProviders, closeAll } =
      await createMcpToolsFromConnectors(connectors, definitions);

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
      definitions,
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
