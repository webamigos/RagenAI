import { Role } from '@prisma/client';
import {
  getThreadMessages,
  getThreadDetails,
} from '../../../lib/services/thread';
import {
  createAndStoreOpenAIThreadMessage,
  createMessageInDB,
} from '../../../lib/services/message';
import { ApiSseMessageEvent } from '../../../contracts/Events';
import { logger } from '../../../lib/utils/logger';
import { initializeRagChain } from './initializeBasicRag';
import { initializeConversationChain } from '../services/initializeConversationChain';
import { getAllSettings } from '@/app/lib/services/settings';
import { ApiKeyError } from '@/libs/chains/errors';
import { SseExceptionFilter } from '../services/sseExceptionFilter';
import { setSentryContext } from '@/app/lib/services/sentry';
import { Runnable } from '@langchain/core/runnables';
import { ChatType, CreateMessageDto } from '@/app/contracts/Message';
import { sendApiEvent } from '@/libs/sse/prepare-sse-message';
import { initializePublicRagChain } from '../../guest-threads/[...guestDetails]/services/initializePublicBasicRag';
import { AssistantMode } from '@/app/contracts/Assistant';

type Config = {
  publicThreadId: string;
  userMessage: CreateMessageDto;
  orgId: string;
  mode: AssistantMode;
  filteredMode?: ChatType;
  userId?: string;
};

export async function streamEvents({
  publicThreadId,
  userMessage,
  orgId,
  mode,
  filteredMode,
  userId,
}: Config) {
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

          // TODO: to optimize we can move database queries after chain run
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
            prompt: userMessage.prompt,
            visitorId: userId,
          });

          if (!threadMessage) {
            logger.error('Thread message not found');
            controller.close();
            return;
          }

          sendApiEvent(controller, 'user_message_saved', {
            id: threadMessage.public_id,
          });

          let chain: Runnable | undefined = undefined;
          let finalAnswerRunName: string | undefined = undefined;

          // TODO: stream chain errors
          if (mode === AssistantMode.INTERNAL) {
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
          } else if (mode === AssistantMode.PUBLIC) {
            const publicRag = await initializePublicRagChain({
              settings: { ...rawSettings, apiKey: rawSettings.apiKey },
              organizationId: orgId,
            });
            chain = publicRag.chain;
            finalAnswerRunName = publicRag.finalAnswerRunName;
          }

          if (!chain) {
            // TODO: invalid chain error
            sendApiEvent(controller, 'close');

            controller.close();
            return;
          }

          // TODO: to optimize db queries we can pass messages from client instead of fetching from db?
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
            // TODO: stream selected chain events
            // e. g. related to start and end of vector store  retrieval
            // sendApiEvent(controller, event.event, {
            //   name: event.name,
            // });

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
                  preferred_communication_type:
                    threadRecord.preferred_communication_type,
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

              // close stream
              sendApiEvent(controller, 'close');

              controller.close();
            }
          }
        } catch (error) {
          const exceptionFilter = new SseExceptionFilter();
          logger.error({ err: error }, 'Error processing SSE');
          // this also sends error event which can be handled in UI
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
}
