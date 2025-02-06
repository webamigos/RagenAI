import { StatusCodes } from 'http-status-codes';
import { NextRequest, NextResponse } from 'next/server';

import {
  setSentryClerkOrganizationTag,
  setSentryContext,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';

import { getApiContext } from '../../../__logic__/context/api.context';
import { ApiDbService } from '../../../__logic__/services/api-db.service';
import { ApiErrorService } from '../../../__logic__/services/api-errors.service';
import { chatMessagesSchema } from '../../../__logic__/dtos/chat.dto';
import { ChatType } from '@/app/contracts/Message';
import { prepareApiSseMessage } from '@/libs/sse/prepare-sse-message';
import { getAllSettings } from '@/app/lib/services/settings';
import { ApiKeyError } from '@/libs/chains/errors';
import { initializePublicRagChain } from '@/app/api/guest-threads/[...guestDetails]/services/initializePublicBasicRag';
import { createMessageInDB, getMessageById } from '@/app/lib/services/message';
import { logger } from '@/app/lib/utils/logger';
import { SseExceptionFilter } from '@/app/api/threads/services/sseExceptionFilter';
import { ApiSseMessageEvent, SseMessageEvent } from '@/app/contracts/Events';
import { Role, Source } from '@prisma/client';

export const dynamic = 'force-dynamic';

export type Params = {
  params: { threadPublicId: string };
};

export const POST = async (request: NextRequest, { params }: Params) => {
  const threadPublicId = params.threadPublicId;
  try {
    setSentryServiceTag('api.chat.threadId.stream.get');
    const body = await request.json();
    const parsedData = chatMessagesSchema.parse(body);

    const apiContext = await getApiContext(request);

    setSentryClerkOrganizationTag(apiContext.orgId);

    const apiDbService = new ApiDbService(apiContext);

    let runId: string;
    const encoder = new TextEncoder();

    return new Response(
      new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode(prepareApiSseMessage('init')));

          try {
            const {
              eventStream,
              finalAnswerRunName,
              threadRecord,
              threadMessage,
            } = await apiDbService.streamChatMessages(
              threadPublicId,
              parsedData,
              controller
            );

            setSentryContext('EXTRA_DATA', {
              userQuestion: parsedData,
              threadPublicId,
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
                controller.enqueue(
                  encoder.encode(
                    prepareApiSseMessage('delta', { content: textChunk })
                  )
                );
              } else if (
                event.event === 'on_parser_end' &&
                event.name === finalAnswerRunName
              ) {
                controller.enqueue(
                  encoder.encode(prepareApiSseMessage('llm_completed'))
                );

                controller.enqueue(
                  encoder.encode(
                    prepareApiSseMessage('save_assistant_response')
                  )
                );

                const dbMessage = await createMessageInDB({
                  thread: threadRecord,
                  message: {
                    id: threadMessage.public_id,
                    content: event.data.output,
                    source: Source.API,
                  },
                  role: Role.ASSISTANT,
                  runId,
                });

                controller.enqueue(
                  encoder.encode(
                    prepareApiSseMessage('assistant_response_saved')
                  )
                );

                // TODO: replace to: { messaage: {}, response: {}}
                const messageToSend: ApiSseMessageEvent = {
                  id: dbMessage.public_id,
                  content: dbMessage.content,
                  role: dbMessage.role,
                  created_at: dbMessage.created_at.toISOString(),
                };

                controller.enqueue(
                  encoder.encode(
                    prepareApiSseMessage('final_response', messageToSend)
                  )
                );

                // close stream
                controller.enqueue(
                  encoder.encode(prepareApiSseMessage('close'))
                );
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
  } catch (err) {
    return ApiErrorService.handleErrors(err);
  }
};
