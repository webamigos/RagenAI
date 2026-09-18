import { z } from 'zod';
import type { FastMCP } from 'fastmcp';

import { chat } from '../client/ragen-api-client.js';
import { logger } from '../logger.js';
import { withToolSpan } from '../telemetry/with-tool-span.js';
import type { RagenSession } from '../auth.js';

const TOOL_NAME = 'ragen_chat';

export function registerChatTool(server: FastMCP<RagenSession>): void {
  server.addTool({
    name: TOOL_NAME,
    description:
      "Send a message to a Ragen assistant and get its answer. The assistant retrieves from its own organization's knowledge base. Omit assistant_id unless you have one: the API key already carries a scope, and a key bound to a single assistant refuses a request naming a different one.",
    parameters: z.object({
      assistant_id: z
        .string()
        .optional()
        .describe(
          'The Ragen assistant (project) ID to send the message to. Optional — the API key decides by itself, and naming an assistant the key is not scoped to is refused. Use ragen_list_assistants to see which ones this key can reach.',
        ),
      message: z.string().min(1).describe('The message to send.'),
      context: z
        .string()
        .optional()
        .describe(
          'Optional additional context (e.g. the content of the page the caller is on).',
        ),
      reasoning_effort: z
        .enum(['low', 'medium', 'high'])
        .optional()
        .describe(
          'OpenAI-style reasoning effort. Only honored by reasoning-capable models; ignored otherwise.',
        ),
    }),
    execute: async (args, { session }) => {
      // `session` is typed optional by FastMCP (only absent when authenticate
      // isn't wired up, or for the stdio transport this server never uses) —
      // the `authenticate` hook in ../auth.ts always runs for httpStream and
      // always returns an apiKey or rejects the connection, so this is a
      // type-safety guard, not a real runtime path.
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

      return withToolSpan(
        TOOL_NAME,
        { 'ragen.assistant_id': args.assistant_id },
        async () => {
          const result = await chat(session.apiKey, {
            assistant_id: args.assistant_id,
            content: args.message,
            context: args.context,
            reasoning_effort: args.reasoning_effort,
          });

          if (result.ok) {
            logger.info(
              { tool: TOOL_NAME, assistantId: args.assistant_id },
              'Tool call succeeded',
            );
            return {
              payload: JSON.stringify({ success: true, text: result.text }),
            };
          }

          // The only record of a failed tool call: the payload below goes to
          // the MCP client, not to our logs, so without this an apps/api 500
          // or an unreachable token vault leaves nothing behind on this side.
          logger.error(
            {
              tool: TOOL_NAME,
              assistantId: args.assistant_id,
              status: result.status,
              error: result.message,
            },
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
        },
      );
    },
  });
}
