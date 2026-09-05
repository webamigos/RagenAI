import { z } from 'zod';
import type { FastMCP } from 'fastmcp';

import { listAssistants } from '../client/ragen-api-client.js';
import type { RagenSession } from '../auth.js';

export function registerListAssistantsTool(
  server: FastMCP<RagenSession>,
): void {
  server.addTool({
    name: 'ragen_list_assistants',
    description:
      "List the Ragen assistants available to the caller's organization, with the id and name of each. Use this to find an assistant_id to pass to ragen_chat.",
    parameters: z.object({}),
    execute: async (_args, { session }) => {
      if (!session) {
        return JSON.stringify({
          success: false,
          error: 'No authenticated session — this should not happen.',
        });
      }

      const result = await listAssistants(session.apiKey);

      if (result.ok) {
        return JSON.stringify({
          success: true,
          assistants: result.assistants,
        });
      }
      return JSON.stringify({
        success: false,
        status: result.status,
        error: result.message,
      });
    },
  });
}
