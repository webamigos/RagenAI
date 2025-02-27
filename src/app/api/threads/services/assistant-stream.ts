import { HumanMessage } from '@langchain/core/messages';
import { Role, Source } from '@prisma/client';

import { AssistantMode } from '@/app/contracts/Assistant';
import { ChatType, CreateMessageDto } from '@/app/contracts/Message';
import { setSentryContext } from '@/app/lib/services/sentry';
import { getAllSettings } from '@/app/lib/services/settings';
import { ApiKeyError } from '@/libs/chains/errors';
import { sendApiEvent } from '@/libs/sse/prepare-sse-message';
import { Runnable } from '@langchain/core/runnables';
import { StreamEvent } from '@langchain/core/tracers/log_stream';
import { IterableReadableStream } from '@langchain/core/utils/stream';
import { ApiSseMessageEvent } from '../../../contracts/Events';
import {
  createAndStoreMessage,
  createMessageInDB,
} from '../../../lib/services/message';
import {
  getThreadDetails,
  getThreadMessages,
} from '../../../lib/services/thread';
import { logger } from '../../../lib/utils/logger';
import { initializePublicRagChain } from '../../guest-threads/[...guestDetails]/services/initializePublicBasicRag';
import { SseExceptionFilter } from '../services/sseExceptionFilter';
import { initializeRagChain } from './initializeBasicRag';
import { initializeRetrievalAgentChain } from './initializeRetrievalAgentChain';

type Config = {
  publicThreadId: string;
  userMessage: CreateMessageDto;
  orgId: string;
  mode: AssistantMode;
  filteredMode?: ChatType;
  visitorId?: string;
};

export async function streamEvents({
  publicThreadId,
  userMessage,
  orgId,
  mode,
  filteredMode,
  visitorId,
}: Config) {
  return new ReadableStream({
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

        const threadMessage = await createAndStoreMessage({
          threadId: threadRecord.id,
          prompt: userMessage.prompt,
          visitorId, // only for public threads
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
            //TODO -> make a separate function for conversation chain, now agent is used for conversation mode!!!
            const conversation = await initializeRetrievalAgentChain({
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
        let eventStream: IterableReadableStream<StreamEvent>;
        //Dirty fix for agent mode
        if (
          mode === AssistantMode.INTERNAL &&
          filteredMode === ChatType.CONVERSATION
        ) {
          eventStream = chain.streamEvents(
            {
              messages: [new HumanMessage(threadMessage.content)],
              question: threadMessage.content,
              chat_history: conv_history,
            },
            {
              version: 'v2',
            }
          );
        } else {
          eventStream = chain.streamEvents(
            {
              question: threadMessage.content,
              chat_history: conv_history,
            },
            {
              version: 'v2',
            }
          );
        }

        setSentryContext('EXTRA_DATA', {
          userQuestion: threadMessage.content,
          publicThreadId,
          publicMessageId: threadMessage.public_id,
        });

        let fullMessage = '';
        let chainRunIds = [];

        for await (const event of eventStream) {
          // eslint-disable-next-line no-console
          console.log('event', event);
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
            (event.event === 'on_parser_stream' &&
              event.name === finalAnswerRunName) ||
            (event.event === 'on_chat_model_stream' &&
              event.metadata.langgraph_node === 'generate')
          ) {
            const textChunk =
              event.metadata.langgraph_node === 'generate'
                ? event.data.chunk.content || ''
                : event.data.chunk;
            fullMessage += textChunk;

            sendApiEvent(controller, 'delta', {
              content: textChunk,
            });
          } else if (
            (event.event === 'on_parser_end' &&
              event.name === finalAnswerRunName) ||
            (event.event === 'on_chain_end' &&
              event.metadata.langgraph_node === 'generate' &&
              event.name === 'generate')
          ) {
            sendApiEvent(controller, 'llm_completed');

            sendApiEvent(controller, 'save_assistant_response');

            const dbMessage = await createMessageInDB({
              threadId: threadRecord.id,
              message: {
                id: threadMessage.public_id,
                content: fullMessage, //TODO -> fix this
                source: Source.UI,
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
  });
}
