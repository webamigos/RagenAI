import { z } from 'zod';
import type { FastMCP } from 'fastmcp';

import { chat } from '../client/ragen-api-client.js';
import type { RagenSession } from '../auth.js';

export function registerChatTool(server: FastMCP<RagenSession>): void {
  server.addTool({
    name: 'ragen_chat',
    description:
      "Send a message to a Ragen assistant and get its answer. The assistant retrieves from its own organization's knowledge base — pass the assistant_id of the specific assistant to talk to.",
    parameters: z.object({
      assistant_id: z
        .string()
        .describe('The Ragen assistant (project) ID to send the message to.'),
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
        return JSON.stringify({
          success: false,
          error: 'No authenticated session — this should not happen.',
        });
      }
      const result = await chat(session.apiKey, {
        assistant_id: args.assistant_id,
        content: args.message,
        context: args.context,
        reasoning_effort: args.reasoning_effort,
      });

      if (result.ok) {
        return JSON.stringify({ success: true, text: result.text });
      }
      return JSON.stringify({
        success: false,
        status: result.status,
        error: result.message,
      });
    },
  });
}
