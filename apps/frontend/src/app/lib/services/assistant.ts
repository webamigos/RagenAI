import OpenAI from 'openai';
import { Thread } from '@prisma/client';

import db from '@salesyy/prisma-client';

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
export const askAssistant = async (input: string, publicThreadId?: string) => {
  // step: get current assistant
  const assistant = await openai.beta.assistants.retrieve(ASSISTANT_ID);

  // console.log({ assistant });

  // step: create thread
  // A Thread represents a conversation. We recommend creating one Thread per user
  // as soon as the user initiates the conversation. Pass any user-specific context
  // and files in this thread by creating Messages.

  let thread;
  let threadEntity: Thread;
  if (publicThreadId) {
    // thread passed from frontend
    try {
      threadEntity = await db.thread.findUniqueOrThrow({
        where: { public_id: publicThreadId },
      });
      thread = await openai.beta.threads.retrieve(threadEntity.openai_id);
    } catch (e) {
      thread = await openai.beta.threads.create();
      threadEntity = await db.thread.create({
        data: { openai_id: thread.id },
      });
    }
  } else {
    // new session
    thread = await openai.beta.threads.create();
    threadEntity = await db.thread.create({
      data: { openai_id: thread.id },
    });
    console.log({ threadEntity });
  }

  const threadId = thread.id;

  // step: add a message to a thread
  const message = await openai.beta.threads.messages.create(threadId, {
    role: 'user',
    content: input.trim(), // TODO: sanitize
  });

  // step: run the assistant
  // const run = await openai.beta.threads.runs.create(threadId, {
  //   assistant_id: assistant.id,
  //   // instructions: 'Co to jest sprzedaz b2b?', // this will override the default instructions of the Assistant
  // });

  // const runId = run.id;

  // step: check the status
  // const status = await openai.beta.threads.runs.retrieve(threadId, runId);

  // console.log({ status });

  // step: check the answer
  // const messages = await openai.beta.threads.messages.list(threadId);

  // messages.data.forEach((message) => {
  //   console.log({
  //     id: message.id,
  //     role: message.role,
  //     content: message.content,
  //     content_0: message.content[0],
  //     // text: message.content[0],
  //   });
  // });
};
