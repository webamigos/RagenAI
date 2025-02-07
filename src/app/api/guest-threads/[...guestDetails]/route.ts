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

import { getAllSettings } from '@/app/lib/services/settings';
import { ApiKeyError } from '@/libs/chains/errors';
import {
  setSentryClerkOrganizationTag,
  setSentryContext,
} from '@/app/lib/services/sentry';
import { setSentryServiceTag } from '@/app/lib/services/sentry';
import { initializePublicRagChain } from './services/initializePublicBasicRag';
import { SseExceptionFilter } from '../../threads/services/sseExceptionFilter';
import { decodeKey } from '@/app/[locale]/(marketing)/generate-access-key/actions/generate-key';
import { sendApiEvent } from '@/libs/sse/prepare-sse-message';
import { createMessageSchema } from '@/app/contracts/Message';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = {
  params: { guestDetails: string[] };
};

const prepareSseMessage = (
  event: string,
  data: SseInitEvent | SseMessageEvent | SseMessageDelta | SseMessageError
): string => {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
};

// TODO: a lot duplication with src/app/api/threads/[publicThreadId]/route.ts
// the most difference is creating initializePublicRagChain instead of initializeRagChain
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const [publicThreadId, organizationAccessToken] = params.guestDetails;

    const orgId = await decodeKey(organizationAccessToken);

    setSentryServiceTag('threads');
    if (!orgId) {
      throw new Error('Unauthorized');
    }
    setSentryClerkOrganizationTag(orgId);

    const body = await request.json();
    const parsedData = createMessageSchema.parse(body);

    return new Response(
      new ReadableStream({
        async start(controller) {
          sendApiEvent(controller, 'init');

          let runId: string = '';

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

            // TODO: handle moderated message
            // save message
            sendApiEvent(controller, 'save_user_message');

            const threadMessage = await createAndStoreOpenAIThreadMessage({
              threadEntity: threadRecord,
              prompt: parsedData.prompt,
            });

            sendApiEvent(controller, 'user_message_saved', {
              id: threadMessage.public_id,
            });

            const { chain, finalAnswerRunName } =
              await initializePublicRagChain({
                settings: { ...rawSettings, apiKey: rawSettings.apiKey },
                organizationId: orgId,
              });

            if (!threadMessage) {
              logger.error('Thread message not found');
              controller.close();
              return;
            }

            sendApiEvent(controller, 'get_thread_messages');
            const threadMessages = await getThreadMessages(publicThreadId);

            sendApiEvent(controller, 'add_thread_messages_to_lmm');

            const conv_history = threadMessages?.messages
              .map((msg) => `${msg.role.toLowerCase()}: ${msg.content}`)
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
                  },
                  message: {
                    id: threadMessage.public_id, // fixed in DEV-78
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
