import { z } from 'zod';
import type { FastMCP } from 'fastmcp';

import { listAssistants } from '../client/ragen-api-client.js';
import { logger } from '../logger.js';
import { withToolSpan } from '../telemetry/with-tool-span.js';
import type { RagenSession } from '../auth.js';

const TOOL_NAME = 'ragen_list_assistants';

export function registerListAssistantsTool(
  server: FastMCP<RagenSession>,
): void {
  server.addTool({
    name: TOOL_NAME,
    description:
      "List the Ragen assistants available to the caller's organization, with the id and name of each. Use this to find an assistant_id to pass to ragen_chat.",
    parameters: z.object({}),
    execute: async (_args, { session }) => {
      if (!session) {
        logger.error(
          { tool: TOOL_NAME },
          'Tool executed without an authenticated session',
        );
        return JSON.stringify({
          success: false,
          error: 'No authenticated session — this should not happen.',
        });
      }

      return withToolSpan(TOOL_NAME, {}, async () => {
        const result = await listAssistants(session.apiKey);

        if (result.ok) {
          logger.info(
            { tool: TOOL_NAME, assistantCount: result.assistants.length },
            'Tool call succeeded',
          );
          return {
            payload: JSON.stringify({
              success: true,
              assistants: result.assistants,
            }),
          };
        }

        logger.error(
          { tool: TOOL_NAME, status: result.status, error: result.message },
          'Tool call failed',
        );
        return {
          payload: JSON.stringify({
            success: false,
            status: result.status,
            error: result.message,
          }),
          failure: {
            message: result.message,
            attributes: { 'ragen.api.status': result.status },
          },
        };
      });
    },
  });
}
