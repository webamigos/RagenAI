import { z } from 'zod';
import type { FastMCP } from 'fastmcp';

import { searchKnowledgeBase } from '../client/ragen-api-client.js';
import { logger } from '../logger.js';
import { withToolSpan } from '../telemetry/with-tool-span.js';
import type { RagenSession } from '../auth.js';

const TOOL_NAME = 'ragen_search_knowledge_base';

export function registerSearchKnowledgeBaseTool(
  server: FastMCP<RagenSession>,
): void {
  server.addTool({
    name: TOOL_NAME,
    description:
      "Search a Ragen assistant's knowledge base and return the most relevant document chunks, without generating an answer. Use this to ground your own reasoning in the assistant's documents from inside another application — for a generated answer instead, use ragen_chat.",
    parameters: z.object({
      assistant_id: z
        .string()
        .describe(
          'The Ragen assistant (project) ID whose knowledge base to search.',
        ),
      query: z.string().min(1).describe('The search query.'),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe(
          "Maximum number of chunks to return. Defaults to the organization's configured retrieval count.",
        ),
    }),
    execute: async (args, { session }) => {
      // See ../tools/chat-tool.ts for why this guard exists but should never
      // trigger in practice.
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
          const result = await searchKnowledgeBase(session.apiKey, {
            assistant_id: args.assistant_id,
            query: args.query,
            max_results: args.max_results,
          });

          if (result.ok) {
            logger.info(
              {
                tool: TOOL_NAME,
                assistantId: args.assistant_id,
                fileCount: result.fileIds.length,
              },
              'Tool call succeeded',
            );
            return {
              payload: JSON.stringify({
                success: true,
                context: result.context,
                file_ids: result.fileIds,
              }),
            };
          }

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
