import OpenAI from 'openai';
import { Role, Thread } from '@prisma/client';

import db from '@salesyy/prisma-client';
import { createMessage } from './message';

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
export const askAssistant = async (input: string, publicThreadId: string) => {
  // step: get current assistant
  const assistant = await openai.beta.assistants.retrieve(ASSISTANT_ID);

  // console.log({ assistant });

  // step: create thread
  // A Thread represents a conversation. We recommend creating one Thread per user
  // as soon as the user initiates the conversation. Pass any user-specific context
  // and files in this thread by creating Messages.

  let thread;
  let threadEntity: Thread;
  try {
    threadEntity = await db.thread.findUniqueOrThrow({
      where: { public_id: publicThreadId },
    });
    if (!threadEntity.openai_thread_id) {
      thread = await openai.beta.threads.create();
      await db.thread.update({
        where: { public_id: publicThreadId },
        data: { openai_thread_id: thread.id },
      });
    } else {
      thread = await openai.beta.threads.retrieve(
        threadEntity.openai_thread_id
      );
    }
  } catch {
    // TODO: implement
    throw new Error(`Cannot fetch thread ${publicThreadId}`);
  }

  const threadId = thread.id;

  // step: add a message to a thread
  const message = await openai.beta.threads.messages.create(threadId, {
    role: 'user',
    content: input.trim(), // TODO: sanitize
  });
  console.log({ message, content: message.content[0].text.value });
  await createMessage({
    thread: threadEntity,
    message: {
      id: message.id,
      created_at: message.created_at,
      content: message.content[0].text.value,
    },
    role: Role.USER,
  }); // TODO: can trow an error

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
    await new Promise((resolve) => setTimeout(resolve, 2000));
    runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
  }

  // console.log({ status });

  // step: check the answer
  const messages = await openai.beta.threads.messages.list(threadId);

  const lastMessageForRun = messages.data
    .filter(
      (message) => message.run_id === runId && message.role === 'assistant'
    )
    .pop();

  // TODO: response
  if (lastMessageForRun) {
    console.log(`${lastMessageForRun.content[0].text.value}`);

    await createMessage({
      thread: threadEntity,
      message: {
        id: lastMessageForRun.id,
        created_at: lastMessageForRun.created_at,
        content: lastMessageForRun.content[0].text.value,
      },
      role: Role.ASSISTANT,
    }); // TODO: can trow an error
  }

  return lastMessageForRun.content[0].text.value;

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
