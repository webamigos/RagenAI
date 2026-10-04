import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import type { SmokeClient } from './smoke.js';

/**
 * The smoke test's view of the official MCP client, over Streamable HTTP —
 * the transport a deployed server is reached by. A tool's result is the text
 * of its content parts, which for every Ragen tool is one JSON envelope.
 */
export function sdkClient(url: URL, apiKey: string): SmokeClient {
  const client = new Client({ name: 'ragen-mcp-smoke', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
  });

  return {
    async connect() {
      try {
        await client.connect(transport);
      } catch (error) {
        // The SDK keeps the HTTP status in `code` and leaves it out of the
        // message, and the status is the one fact that says what went wrong
        // (401: the header; 404: the path).
        const code = (error as { code?: unknown }).code;
        if (typeof code === 'number' && error instanceof Error) {
          throw new Error(`HTTP ${code}: ${error.message}`, { cause: error });
        }
        throw error;
      }
      return client.getServerVersion();
    },
    async listTools() {
      const { tools } = await client.listTools();
      return tools.map((tool) => tool.name);
    },
    async callTool(name, args) {
      const result = await client.callTool({ name, arguments: args });
      const content = (result.content ?? []) as {
        type: string;
        text?: string;
      }[];
      return {
        text: content
          .filter((part) => part.type === 'text')
          .map((part) => part.text ?? '')
          .join(''),
        isError: result.isError === true,
      };
    },
    close: () => client.close(),
  };
}
