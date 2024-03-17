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
  const run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: assistant.id,
    // instructions: 'Co to jest sprzedaz b2b?', // this will override the default instructions of the Assistant
  });

  const runId = run.id;

  // step: check the status
  let runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);

  // Polling mechanism to see if runStatus is completed
  // TODO: this should be done more robust
  while (runStatus.status !== 'completed') {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
  }

  // step: check the answer
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
        `${redisChannelPrefix}-${publicThreadId}`,
        stringifiedMessage
      );
    } catch (e) {
      console.log('Redis publish error: ', e);
    }

    // redis.set(
    //   publicThreadId, // TODO: rather runId not thread?
    //   stringifiedMessage
    // );

    return true;
  }

  throw new Error('Cannot fetch message from assistant');
};
