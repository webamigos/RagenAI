import { Role } from '@prisma/client';

import {
  getMessageById,
  getThreadDetails,
  getThreadMessages,
} from './../services/dbService';
import { createMessageInDB } from '../../../lib/services/message';
import { chain } from '../utills';
import {
  SseInitEvent,
  SseMessageEvent,
  SseMessageDelta,
} from '../../../contracts/Events';
import { logger } from '../../../lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = {
  params: { details: string[] };
};

const prepareSseMessage = (
  event: string,
  data: SseInitEvent | SseMessageEvent | SseMessageDelta
): string => {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
};

export async function GET(_request: Request, { params }: Params) {
  const publicThreadId = params.details[0];
  const publicMessageId = params.details[1];

  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  writer.write(prepareSseMessage('init', { type: 'init' }));

  try {
    const thredMessage = await getMessageById(publicMessageId);
    const threadMessages = await getThreadMessages(publicThreadId);
    const threadEntity = await getThreadDetails(publicThreadId);

    const conv_history = threadMessages?.messages
      .map((msg) => `${msg.role.toLowerCase()}: ${msg.content}`)
      .join('\n');

    //if you need add another files to context - uncomment
    //await addDocumentsToStore(splitDocs);

    const eventStream = await chain.streamEvents(
      {
        question: thredMessage!.content,
        conv_history: conv_history,
      },
      {
        version: 'v2',
      }
    );
    let fullMessage = '';

    for await (const event of eventStream) {
      if (event.event === 'on_parser_stream') {
        const textChunk = event.data.chunk || '';
        fullMessage += textChunk;
        writer.write(
          prepareSseMessage('message', {
            type: 'delta',
            payload: { content: textChunk },
          })
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
        });

        const messageToSend: SseMessageEvent = {
          type: 'message',
          payload: {
            public_id: dbMessage.public_id,
            role: dbMessage.role,
            created_at: dbMessage.created_at,
            content: dbMessage.content,
          },
        };

        writer.write(prepareSseMessage('message', messageToSend));
      }
    }
  } catch (error) {
    logger.error('Error processing SSE: %o', error);
  }

  return new Response(responseStream.readable, {
    headers: {
      Connection: 'keep-alive',
      'Content-Encoding': 'none',
      'Cache-Control': 'no-cache, no-transform',
      'Content-Type': 'text/event-stream; charset=utf-8',
    },
  });
}
