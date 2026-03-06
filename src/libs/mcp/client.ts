import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { logger } from '@/app/lib/utils/logger';

export type McpConnectorInfo = {
  id: string;
  provider: string;
  mcp_server_url: string;
  customer_id: string;
};

/**
 * Create MCP clients for a list of connectors and gather their tools.
 * Returns merged tools and a cleanup function to close all clients.
 */
export async function createMcpToolsFromConnectors(
  connectors: McpConnectorInfo[],
) {
  const clients: MCPClient[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mergedTools: Record<string, any> = {};

  for (const connector of connectors) {
    try {
      const client = await createMCPClient({
        transport: {
          type: 'http',
          url: connector.mcp_server_url,
          headers: {
            'x-customer-id': connector.customer_id,
          },
        },
      });

      clients.push(client);

      const tools = await client.tools();

      // Prefix tool names with provider to avoid collisions
      const prefix = connector.provider.toLowerCase();
      for (const [name, tool] of Object.entries(tools)) {
        mergedTools[`${prefix}__${name}`] = tool;
      }

      logger.info(
        {
          provider: connector.provider,
          toolCount: Object.keys(tools).length,
          toolNames: Object.keys(tools),
        },
        'MCP tools loaded from connector',
      );
    } catch (error) {
      logger.error(
        {
          err: error,
          provider: connector.provider,
          mcpServerUrl: connector.mcp_server_url,
        },
        'Failed to initialize MCP connector, skipping',
      );
    }
  }

  const closeAll = async () => {
    for (const client of clients) {
      try {
        await client.close();
      } catch (error) {
        logger.error({ err: error }, 'Error closing MCP client');
      }
    }
  };

  return { tools: mergedTools, closeAll };
}
