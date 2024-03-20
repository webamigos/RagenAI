import OpenAI from 'openai';
import { Redis } from '@upstash/redis';
import { Role } from '@prisma/client';

import db from '@salesyy/prisma-client';

import { createMessage } from './message';
import { parseThreadMessage } from './utils';
import { redisChannelPrefix } from '../../config';
import { type SseMessageEvent } from '../../contracts/Events';

const openai = new OpenAI();
const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID!;

/**
 * A typical integration of the Assistants API has the following flow:
 *
 * 1. Create an Assistant in the API by defining its custom instructions and picking a model. If helpful, enable tools like Code Interpreter, Retrieval, and Function calling.
 * 2. Create a Thread when a user starts a conversation.
 * 3. Add Messages to the Thread as the user ask questions.
 * 4. Run the Assistant on the Thread to trigger responses. This automatically calls the relevant tools.
 *
 * @param input Question to the assistant
 *
 */
export const askAssistant = async (publicThreadId: string) => {
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
  const threadId = thread.id;

  // step: get current assistant
  const assistant = await openai.beta.assistants.retrieve(ASSISTANT_ID);

  // step: run the assistant
  // without streaming
  let run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: assistant.id,
    // instructions: 'Co to jest sprzedaz b2b?', // this will override the default instructions of the Assistant
  });

  // with streaming
  // const run = openai.beta.threads.runs.createAndStream(thread.id, {
  //   assistant_id: assistant.id
  // })
  //   .on('textCreated', (text) => process.stdout.write('\nassistant > '))
  //   .on('textDelta', (textDelta, snapshot) => process.stdout.write(textDelta.value))
  //   .on('toolCallCreated', (toolCall) => process.stdout.write(`\nassistant > ${toolCall.type}\n\n`))
  //   .on('toolCallDelta', (toolCallDelta, snapshot) => {
  //     if (toolCallDelta.type === 'code_interpreter') {
  //       if (toolCallDelta.code_interpreter.input) {
  //         process.stdout.write(toolCallDelta.code_interpreter.input);
  //       }
  //       if (toolCallDelta.code_interpreter.outputs) {
  //         process.stdout.write("\noutput >\n");
  //         toolCallDelta.code_interpreter.outputs.forEach(output => {
  //           if (output.type === "logs") {
  //             process.stdout.write(`\n${output.logs}\n`);
  //           }
  //         });
  //       }
  //     }
  //   });

  const runId = run.id;

  // step: check the status
  run = await openai.beta.threads.runs.retrieve(threadId, runId);

  // Polling mechanism to see if runStatus is completed
  // TODO: this should be done more robust
  while (['queued', 'in_progress', 'cancelling'].includes(run.status)) {
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second
    run = await openai.beta.threads.runs.retrieve(threadId, runId);
  }

  // step: check the answer
  if (run.status === 'completed') {
    const messages = await openai.beta.threads.messages.list(threadId);

    const lastMessageForRun = messages.data
      .filter(
        (message) => message.run_id === runId && message.role === 'assistant'
      )
      .pop();

    // TODO: response
    if (lastMessageForRun) {
      const assistantMessageContent = parseThreadMessage(lastMessageForRun);
      console.log(`${assistantMessageContent}`);

      const dbMessage = await createMessage({
        thread: threadEntity,
        message: {
          id: lastMessageForRun.id,
          created_at: lastMessageForRun.created_at,
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

      const stringifiedMessage = JSON.stringify(messageToSend);

      try {
        const redis = new Redis({
          url: process.env.REDIS_URL!,
          token: process.env.REDIS_TOKEN!,
        });

        await redis.publish(
          `${redisChannelPrefix}-${publicThreadId}`, // mewa-123
          stringifiedMessage
        );
      } catch (e) {
        console.log('Redis publish error: ', e);
      }

      return true;
    }
  }

  throw new Error('Cannot fetch message from assistant');
};
