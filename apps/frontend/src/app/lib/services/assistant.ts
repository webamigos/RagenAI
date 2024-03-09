import OpenAI from 'openai';

const openai = new OpenAI();
const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID!;

export const askAssistant = async (input: string) => {
  // step: get current assistant
  const assistant = await openai.beta.assistants.retrieve(ASSISTANT_ID);

  console.log({ assistant });

  // step: create thread
  const thread = await openai.beta.threads.create();
  console.log({ thread });

  // const threadId = thread.id;
  const threadId = 'thread_OOc9fxXw08vvz4zh1ZOZxdv5';

  // step: add a message to a thread
  const message = await openai.beta.threads.messages.create(threadId, {
    role: 'user',
    content: input,
  });

  // step: run the assistant
  const run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: assistant.id,
    // instructions: 'Co to jest sprzedaz b2b?',
  });

  const runId = run.id;

  // step: check the status
  const status = await openai.beta.threads.runs.retrieve(threadId, runId);

  console.log({ status });

  // step: check the answer
  const messages = await openai.beta.threads.messages.list(threadId);

  messages.data.forEach((message) => {
    console.log({
      id: message.id,
      role: message.role,
      content: message.content,
      text: message.content[0],
    });
  });
};
