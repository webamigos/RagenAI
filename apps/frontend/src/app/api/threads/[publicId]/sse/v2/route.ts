import OpenAI from 'openai';

import db from '@salesyy/prisma-client';
import { type AssistantStreamEvent } from 'openai/resources/beta/assistants/assistants';

import {
  createMessage,
  createThreadMessage,
} from '../../../../../lib/services/message';
import { SseInitEvent, SseMessageEvent } from '../../../../../contracts/Events';
import { parseThreadMessage } from '../../../../../lib/services/utils';
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
  data: SseInitEvent | SseMessageEvent
) => {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
};

export async function GET(_request: Request, { params }: Params) {
  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();

  writer.write(prepareSseMessage('init', { type: 'init' }));

  const publicThreadId = params.publicId;

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

  const messageResponse = await createThreadMessage({
    prompt: 'co jest stolicą francji?',
    thread,
    threadEntity,
    visitorId: '123',
  });

  const threadId = thread.id;

  // step: get current assistant
  const assistant = await openai.beta.assistants.retrieve(ASSISTANT_ID);

  const run = openai.beta.threads.runs
    .createAndStream(thread.id, {
      assistant_id: assistant.id,
    })
    .on('event', async (event: AssistantStreamEvent) => {
      console.log({ event });
      if (event.event === 'thread.message.completed') {
        if (event.data.role === 'assistant') {
          const assistantMessageContent = parseThreadMessage(event.data);
          console.log(`${assistantMessageContent}`);

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
    .on('textCreated', (text) => process.stdout.write('\nassistant > '))
    .on(
      'textDelta',
      (textDelta, snapshot) =>
        // process.stdout.write(textDelta.value)
        writer.write(textDelta.value)
      // writer.write(`event: message\ndata: ${message}\n\n`)
    );
  // .on('toolCallCreated', (toolCall) =>
  //   process.stdout.write(`\nassistant > ${toolCall.type}\n\n`)
  // )
  // .on('toolCallDelta', (toolCallDelta, snapshot) => {
  //   if (toolCallDelta.type === 'code_interpreter') {
  //     if (toolCallDelta.code_interpreter.input) {
  //       process.stdout.write(toolCallDelta.code_interpreter.input);
  //     }
  //     if (toolCallDelta.code_interpreter.outputs) {
  //       process.stdout.write('\noutput >\n');
  //       toolCallDelta.code_interpreter.outputs.forEach((output) => {
  //         if (output.type === 'logs') {
  //           process.stdout.write(`\n${output.logs}\n`);
  //         }
  //       });
  //     }
  //   }
  // });

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
