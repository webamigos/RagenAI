import { NextRequest } from 'next/server';

import { Role } from '@prisma/client';
import {
  getThreadMessages,
  getThreadDetails,
} from '../../../lib/services/thread';
import {
  createMessageInDB,
  getMessageById,
} from '../../../lib/services/message';
import { initializeChainV2 } from '../utills';
import {
  SseInitEvent,
  SseMessageEvent,
  SseMessageDelta,
  SseMessageError,
} from '../../../contracts/Events';
import { logger } from '../../../lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = {
  params: { stream: string[] };
};

const prepareSseMessage = (
  event: string,
  data: SseInitEvent | SseMessageEvent | SseMessageDelta | SseMessageError
): string => {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
};
let runId: string;

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const chain = await initializeChainV2(request);

    const [publicThreadId, publicMessageId] = params.stream;

    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream({
        async start(controller) {
          controller.enqueue(
            encoder.encode(prepareSseMessage('init', { type: 'init' }))
          );

          try {
            const threadMessage = await getMessageById(publicMessageId);

            if (!threadMessage) {
              logger.error('Thread message not found');
              controller.close();
              return;
            }

            const threadMessages = await getThreadMessages(publicThreadId);
            const threadEntity = await getThreadDetails(publicThreadId);

            const conv_history = threadMessages?.messages
              .map((msg) => `${msg.role.toLowerCase()}: ${msg.content}`)
              .join('\n');

            const eventStream = await chain.streamEvents(
              {
                question: threadMessage.content,
                chat_history: conv_history,
              },
              {
                version: 'v2',
              }
            );

            let fullMessage = '';
            let chainRunIds = [];

            for await (const event of eventStream) {
              //TODO: find a better way to handle filtering out standalone-question llm response events!
              if (!event?.metadata?.store) {
                continue;
              }

              if (event.event === 'on_chain_start') {
                chainRunIds.push(event.run_id);
                runId = chainRunIds[0];
              }

              if (event.event === 'on_parser_stream') {
                const textChunk = event.data.chunk || '';
                fullMessage += textChunk;
                controller.enqueue(
                  encoder.encode(
                    prepareSseMessage('message', {
                      type: 'delta',
                      payload: { content: textChunk, runId },
                    })
                  )
                );
              } else if (event.event === 'on_parser_end') {
                const dbMessage = await createMessageInDB({
                  thread: {
                    ...threadEntity,
                    visitor_id: threadEntity.visitor_id,
                  },
                  message: {
                    id: publicMessageId,
                    created_at: Math.floor(Date.now() / 1000),
                    content: event.data.output,
                  },
                  role: Role.ASSISTANT,
                  runId,
                });

                const messageToSend: SseMessageEvent = {
                  type: 'message',
                  payload: {
                    public_id: dbMessage.public_id,
                    role: dbMessage.role,
                    created_at: dbMessage.created_at,
                    content: dbMessage.content,
                    run_id: runId,
                  },
                };

                controller.enqueue(
                  encoder.encode(prepareSseMessage('message', messageToSend))
                );
              }
            }
          } catch (error) {
            logger.error('Error processing SSE:', error);
            controller.enqueue(
              encoder.encode(
                prepareSseMessage('error', {
                  type: 'error',
                  message: 'Internal Server Error',
                })
              )
            );
          }
        },
      }),
      {
        headers: {
          Connection: 'keep-alive',
          'Content-Encoding': 'none',
          'Cache-Control': 'no-cache, no-transform',
          'Content-Type': 'text/event-stream; charset=utf-8',
        },
      }
    );
  } catch (error) {
    logger.error('Unexpected error in GET handler:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
