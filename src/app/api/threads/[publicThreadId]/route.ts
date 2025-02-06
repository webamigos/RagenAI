import { NextRequest } from 'next/server';

import { Role } from '@prisma/client';
import {
  getThreadMessages,
  getThreadDetails,
} from '../../../lib/services/thread';
import {
  createAndStoreOpenAIThreadMessage,
  createMessageInDB,
  getMessageById,
} from '../../../lib/services/message';
import {
  SseInitEvent,
  SseMessageEvent,
  SseMessageDelta,
  SseMessageError,
  ApiSseMessageEvent,
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
import { ChatType, createMessageSchema } from '@/app/contracts/Message';
import { sendApiEvent } from '@/libs/sse/prepare-sse-message';
import { sendMessage } from '@/app/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = {
  params: { publicThreadId: string };
};

const prepareSseMessage = (
  event: string,
  data: SseInitEvent | SseMessageEvent | SseMessageDelta | SseMessageError
): string => {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
};
let runId: string;

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { orgId, userId } = getAuth(request);
    setSentryServiceTag('threads');
    if (!orgId) {
      throw new Error('Unauthorized');
    }
    setSentryClerkOrganizationTag(orgId);

    const { publicThreadId } = params;
    const mode = request?.nextUrl?.searchParams.get('mode');
    const filteredMode =
      mode === ChatType.CONVERSATION ? ChatType.CONVERSATION : ChatType.RAG;

    const body = await request.json();
    const parsedData = createMessageSchema.parse(body);

    /**
    * TODO: there is code duplication, we can create new functions similar to API:
    *
    * 1. create eventStream, threadRecord and threadMessage
    * const {
        eventStream,
        finalAnswerRunName,
        threadRecord,
        threadMessage,
      } = await apiDbService.streamChatMessages(
        threadPublicId,
        parsedData,
        controller
      );

      2. Inside we can get more vars:
      const {
        chain,
        finalAnswerRunName,
        threadRecord,
        threadMessage,
        runId,
        conv_history,
      } = await this.prepareChainToRun(publicThreadId, payload, controller);
    */
    return new Response(
      new ReadableStream({
        async start(controller) {
          sendApiEvent(controller, 'init');

          try {
            const rawSettings = await getAllSettings(orgId);
            if (!rawSettings.apiKey) {
              throw new ApiKeyError();
            }

            sendApiEvent(controller, 'find_thread');

            const threadRecord = await getThreadDetails(publicThreadId);

            sendApiEvent(controller, 'thread_found', {
              id: threadRecord.public_id,
            });

            // save message
            sendApiEvent(controller, 'save_user_message');

            const threadMessage = await createAndStoreOpenAIThreadMessage({
              threadEntity: threadRecord,
              prompt: parsedData.prompt,
              visitorId: userId,
            });

            sendApiEvent(controller, 'user_message_saved', {
              id: threadMessage.public_id,
            });

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

            if (!threadMessage) {
              logger.error('Thread message not found');
              controller.close();
              return;
            }

            sendApiEvent(controller, 'get_thread_messages');
            const threadMessages = await getThreadMessages(publicThreadId);

            sendApiEvent(controller, 'add_thread_messages_to_lmm');

            const conv_history = threadMessages?.messages
              .map((msg) => `${msg.role}: ${msg.content}`)
              .join('\n');

            sendApiEvent(controller, 'start_lmm');

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
              publicMessageId: threadMessage.public_id,
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

                sendApiEvent(controller, 'delta', {
                  content: textChunk,
                  runId,
                });
              } else if (
                event.event === 'on_parser_end' &&
                event.name === finalAnswerRunName
              ) {
                sendApiEvent(controller, 'llm_completed');

                sendApiEvent(controller, 'save_assistant_response');

                const dbMessage = await createMessageInDB({
                  thread: {
                    ...threadRecord,
                    visitor_id: threadRecord.visitor_id,
                    preferred_communication_type:
                      threadRecord.preferred_communication_type,
                  },
                  message: {
                    id: threadMessage.public_id,
                    created_at: Math.floor(Date.now() / 1000),
                    content: event.data.output,
                  },
                  role: Role.ASSISTANT,
                  runId,
                  messageType: threadRecord.preferred_communication_type,
                });

                sendApiEvent(controller, 'assistant_response_saved');

                const messageToSend: ApiSseMessageEvent = {
                  id: dbMessage.public_id,
                  role: dbMessage.role,
                  created_at: dbMessage.created_at.toISOString(),
                  content: dbMessage.content,
                  run_id: runId,
                };

                sendApiEvent(controller, 'final_response', messageToSend);

                // close stream
                sendApiEvent(controller, 'close');

                controller.close();
              }
            }
          } catch (error) {
            const exceptionFilter = new SseExceptionFilter();
            logger.error({ err: error }, 'Error processing SSE');
            exceptionFilter.handleError(error, controller);
            controller.close();
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
      'Unexpected error in thread stream GET handler'
    );
    return new Response('Internal Server Error', { status: 500 });
  }
}
