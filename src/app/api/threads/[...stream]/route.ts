import { NextRequest } from 'next/server';

import { Role, Thread } from '@prisma/client';
import {
  getThreadMessages,
  getThreadDetails,
} from '../../../lib/services/thread';
import {
  createMessageInDB,
  getMessageById,
} from '../../../lib/services/message';
import {
  SseInitEvent,
  SseMessageEvent,
  SseMessageDelta,
  SseMessageError,
} from '../../../contracts/Events';
import { logger } from '../../../lib/utils/logger';
import { getAuth } from '@clerk/nextjs/server';
import { initializeRagChain } from '../services/initializeBasicRag';
import { initializeConversationChain } from '../services/initializeConversationChain';
import { getAllSettings } from '@/app/lib/services/settings';
import { ApiKeyError } from '@/libs/chains/errors';
import { SseExceptionFilter } from '../services/sseExceptionFilter';
import {
  setSentryClerkOrganizationTag,
  setSentryContext,
} from '@/app/lib/services/sentry';
import { setSentryServiceTag } from '@/app/lib/services/sentry';
import { Runnable } from '@langchain/core/runnables';
import { ChatType } from '@/app/contracts/Message';
import { prepareSseMessage } from '@/libs/sse/prepare-sse-message';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = {
  params: { stream: string[] };
};

let runId: string;

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { orgId } = getAuth(request);
    setSentryServiceTag('threads');
    if (!orgId) {
      throw new Error('Unauthorized');
    }
    setSentryClerkOrganizationTag(orgId);

    const [publicThreadId, publicMessageId] = params.stream;
    const mode = request?.nextUrl?.searchParams.get('mode');
    const filteredMode =
      mode === ChatType.CONVERSATION ? ChatType.CONVERSATION : ChatType.RAG;

    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream({
        async start(controller) {
          controller.enqueue(
            encoder.encode(prepareSseMessage('init', { type: 'init' }))
          );

          try {
            const rawSettings = await getAllSettings(orgId);
            if (!rawSettings.apiKey) {
              throw new ApiKeyError();
            }

            let chain: Runnable;
            let finalAnswerRunName: string;

            if (filteredMode === ChatType.CONVERSATION) {
              const conversation = await initializeConversationChain({
                settings: { ...rawSettings, apiKey: rawSettings.apiKey },
              });
              chain = conversation.chain;
              finalAnswerRunName = conversation.finalAnswerRunName;
            } else {
              const basicRag = await initializeRagChain({
                settings: { ...rawSettings, apiKey: rawSettings.apiKey },
              });
              chain = basicRag.chain;
              finalAnswerRunName = basicRag.finalAnswerRunName;
            }

            const threadMessage = await getMessageById(publicMessageId);

            if (!threadMessage) {
              logger.error('Thread message not found');
              controller.close();
              return;
            }

            const threadMessages = await getThreadMessages(publicThreadId);
            const threadRecord = await getThreadDetails(publicThreadId);

            const conv_history = threadMessages?.messages
              .map((msg) => `${msg.role}: ${msg.content}`)
              .join('\n');

            const eventStream = chain.streamEvents(
              {
                question: threadMessage.content,
                chat_history: conv_history,
              },
              {
                version: 'v2',
              }
            );

            setSentryContext('EXTRA_DATA', {
              userQuestion: threadMessage.content,
              publicThreadId,
              publicMessageId,
            });

            let fullMessage = '';
            let chainRunIds = [];

            for await (const event of eventStream) {
              if (event.event === 'on_chain_start') {
                chainRunIds.push(event.run_id);
                runId = chainRunIds[0];
              }

              if (
                event.event === 'on_parser_stream' &&
                event.name === finalAnswerRunName
              ) {
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
              } else if (
                event.event === 'on_parser_end' &&
                event.name === finalAnswerRunName
              ) {
                const dbMessage = await createMessageInDB({
                  thread: {
                    ...(threadRecord as Thread),
                    visitor_id: threadRecord.visitor_id,
                    preferred_communication_type:
                      threadRecord.preferred_communication_type,
                  },
                  message: {
                    id: publicMessageId,
                    content: event.data.output,
                  },
                  role: Role.ASSISTANT,
                  runId,
                  messageType: threadEntity.preferred_communication_type,
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
            const exceptionFilter = new SseExceptionFilter();
            logger.error({ err: error }, 'Error processing SSE');
            exceptionFilter.handleError(error, controller);
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
    logger.error(
      { err: error },
      'Unexpected error in thread streamGET handler'
    );
    return new Response('Internal Server Error', { status: 500 });
  }
}
