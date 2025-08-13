import { NextRequest } from 'next/server';

import {
  setSentryClerkOrganizationTag,
  setSentryContext,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';

import { getApiContext } from '../../../../__logic__/context/api.context';
import { ApiDbService } from '../../../../__logic__/services/api-db.service';
import { ApiErrorService } from '../../../../__logic__/services/api-errors.service';
import { chatMessagesSchema } from '../../../../__logic__/dtos/chat.dto';
import { sendApiEvent } from '@/libs/sse/prepare-sse-message';
import { createMessageInDB } from '@/app/lib/services/message';
import { logger } from '@/app/lib/utils/logger';
import { SseExceptionFilter } from '@/app/api/threads/services/sseExceptionFilter';
import { ApiSseMessageEvent } from '@/app/contracts/Events';
import { Role, Source } from '@prisma/client';

export const dynamic = 'force-dynamic';

export type Params = {
  params: Promise<{ publicId: string }>;
};

export const POST = async (request: NextRequest, { params }: Params) => {
  const { publicId } = await params;
  try {
    setSentryServiceTag('api.threads.threadId.messages.stream.get');
    const body = await request.json();
    const parsedData = chatMessagesSchema.parse(body);

    const apiContext = await getApiContext(request);

    setSentryClerkOrganizationTag(apiContext.orgId);

    const apiDbService = new ApiDbService(apiContext);

    let runId: string;

    return new Response(
      new ReadableStream({
        async start(controller) {
          sendApiEvent(controller, 'init');

          try {
            const {
              eventStream,
              finalAnswerRunName,
              threadRecord,
              threadMessage,
            } = await apiDbService.streamChatMessages(
              publicId,
              parsedData,
              controller
            );

            setSentryContext('EXTRA_DATA', {
              userQuestion: parsedData,
              threadPublicId: publicId,
            });

            // streaming part
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
                sendApiEvent(controller, 'delta', { content: textChunk });
              } else if (
                event.event === 'on_parser_end' &&
                event.name === finalAnswerRunName
              ) {
                sendApiEvent(controller, 'llm_completed');

                sendApiEvent(controller, 'save_assistant_response');

                const dbMessage = await createMessageInDB({
                  threadId: threadRecord.id,
                  message: {
                    id: threadMessage.public_id,
                    content: event.data.output,
                    source: Source.API,
                  },
                  role: Role.ASSISTANT,
                  runId,
                });

                sendApiEvent(controller, 'assistant_response_saved');

                try {
                  // TODO: replace to: { messaage: {}, response: {}}
                  const messageToSend: ApiSseMessageEvent = {
                    id: dbMessage.public_id,
                    content: '', // We clear the content – the client already has the full message from the delta events
                    role: dbMessage.role,
                    created_at: dbMessage.created_at.toISOString(),
                    run_id: runId,
                  };

                  sendApiEvent(controller, 'final_response', messageToSend);

                  // close stream
                  sendApiEvent(controller, 'close');

                  controller.close();
                } catch (finalResponseError) {
                  logger.error(
                    { err: finalResponseError },
                    'Error sending final_response after assistant_response_saved'
                  );

                  try {
                    sendApiEvent(controller, 'close');
                    controller.close();
                  } catch (closeError) {
                    logger.error(
                      { err: closeError },
                      'Error closing stream after final_response error'
                    );
                  }
                }
              }
            }
          } catch (error) {
            const exceptionFilter = new SseExceptionFilter();
            logger.error({ err: error }, 'Error processing SSE');

            exceptionFilter.handleError(error, controller);

            try {
              controller.close();
            } catch (closeError) {
              logger.error({ err: closeError }, 'Error closing controller');
            }
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
  } catch (err) {
    return ApiErrorService.handleErrors(err);
  }
};
