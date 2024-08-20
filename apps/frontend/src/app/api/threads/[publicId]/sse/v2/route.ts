import OpenAI from 'openai';

import db from '@salesyy/prisma-client';

import { createMessage } from '../../../../../lib/services/message';
import {
  SseInitEvent,
  SseMessageDelta,
  SseMessageEvent,
} from '../../../../../contracts/Events';
import {
  parseThreadDelta,
  parseThreadMessage,
} from '../../../../../lib/services/utils';
import { Role } from '@prisma/client';

export const runtime = 'nodejs';

// This is required to enable streaming
export const dynamic = 'force-dynamic';

type Params = {
  params: { publicId: string };
};

const openai = new OpenAI();
const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID!;

const prepareSseMessage = (
  event: string,
  data: SseInitEvent | SseMessageEvent | SseMessageDelta
) => {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
};

export async function GET(_request: Request, { params }: Params) {
  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();

  writer.write(prepareSseMessage('init', { type: 'init' }));

  const publicThreadId = params.publicId;

  try {
    const threadEntity = await db.thread.findUniqueOrThrow({
      where: { public_id: publicThreadId },
      select: {
        id: true,
        public_id: true,
        openai_thread_id: true,
        created_at: true,
      },
    });

    const thread = await openai.beta.threads.retrieve(
      threadEntity.openai_thread_id
    );

    // step: get current assistant
    const assistant = await openai.beta.assistants.retrieve(ASSISTANT_ID);

    const run = openai.beta.threads.runs
      //Legacy
      .createAndStream(thread.id, {
        assistant_id: assistant.id,
      })
      .on('event', async (event: any) => {
        // FIXME: AssistantStreamEvent
        // TODO: podziałać na deltach, zamiast czekać na całośc odpowiedzi
        if (event.event === 'thread.message.delta') {
          const parseDelta = parseThreadDelta(event.data.delta);
          writer.write(
            prepareSseMessage('message', {
              type: 'delta',
              payload: { content: parseDelta },
            })
          );
        }

        if (event.event === 'thread.message.completed') {
          if (event.data.role === 'assistant') {
            const assistantMessageContent = parseThreadMessage(event.data);

            const dbMessage = await createMessage({
              thread: threadEntity,
              message: {
                id: event.data.id,
                created_at: event.data.created_at,
                content: assistantMessageContent,
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
      })
      .on('textCreated', () => process.stdout.write('\nassistant > '))
      .on('textDelta', (textDelta) => writer.write(textDelta.value));
  } catch (error) {
    console.log('Endpoint error: ', error);
  }

  return new Response(responseStream.readable, {
    // Set headers for Server-Sent Events (SSE) / stream from the server
    headers: {
      Connection: 'keep-alive',
      'Content-Encoding': 'none',
      'Cache-Control': 'no-cache, no-transform',
      'Content-Type': 'text/event-stream; charset=utf-8',
    },
  });
}
