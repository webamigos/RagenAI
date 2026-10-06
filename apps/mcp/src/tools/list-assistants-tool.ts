import { apiAuthorization } from '../auth.js';
import { z } from 'zod';
import type { FastMCP } from 'fastmcp';

import { listAssistants } from '../client/ragen-api-client.js';
import { logger } from '../logger.js';
import { withToolSpan } from '../telemetry/with-tool-span.js';
import { noSessionResult } from './no-session.js';
import type { RagenSession } from '../auth.js';

const TOOL_NAME = 'ragen_list_assistants';

export function registerListAssistantsTool(
  server: FastMCP<RagenSession>,
): void {
  server.addTool({
    name: TOOL_NAME,
    description:
      'List the Ragen assistants this API key can reach, with the id and name of each. A key scoped to the whole knowledge base lists every assistant its organization owns; a key created for one assistant lists that one. Use this to find an assistant_id for ragen_chat — or, if exactly one comes back, to confirm you can omit it.',
    parameters: z.object({}),
    execute: async (_args, { session }) => {
      if (!session) {
        return noSessionResult(TOOL_NAME);
      }

      return withToolSpan(TOOL_NAME, {}, async () => {
        const result = await listAssistants(apiAuthorization(session));

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
