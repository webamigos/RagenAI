import { HttpResponseOutputParser } from 'langchain/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { ChatOpenAI } from '@langchain/openai';
import {
  Message as VercelChatMessage,
  StreamingTextResponse,
  createStreamDataTransformer,
} from 'ai';
import { Redis } from '@upstash/redis';
import { Role } from '@prisma/client';

import db from '@salesyy/prisma-client';
import { createMessage } from './message';
import { redisChannelPrefix } from '../../config';
import { type SseMessageEvent } from '../../contracts/Events';

const TEMPLATE = `
  Current conversation:
  {chat_history}§
  user: {input}
  assistant:`;

const modelName = process.env.OPENAI_MODEL;
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
export const askAssistant = async (
  publicThreadId: string,
  _request?: Request
) => {
  const threadEntity = await db.thread.findUniqueOrThrow({
    where: { public_id: publicThreadId },
    select: {
      id: true,
      public_id: true,
      openai_thread_id: true,
      created_at: true,
    },
  });

  const { messages } = await _request!.json();

  const formatMessage = (messages: VercelChatMessage) => {
    return `${messages.role}: ${messages.content}`;
  };

  const llm = new ChatOpenAI({ modelName, temperature: 0.25, verbose: true });
  const promptTemplate = PromptTemplate.fromTemplate(TEMPLATE);
  const parser = new HttpResponseOutputParser();
  const chain = promptTemplate.pipe(llm.bind({ stop: ['?'] })).pipe(parser);

  const formattedPreviousMessages = messages.slice(0, -1).map(formatMessage);
  const currentMessageContent = messages.at(-1)?.content;

  const stream = await chain.stream({
    chat_history: formattedPreviousMessages.join('\n'),
    input: currentMessageContent,
  });

  const dbMessage = await createMessage({
    thread: threadEntity,
    message: {
      id: `msg_${Date.now()}`,
      created_at: Number(new Date()),
      content: currentMessageContent,
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

  return new StreamingTextResponse(
    stream.pipeThrough(createStreamDataTransformer())
  );

  // throw new Error('Cannot fetch message from assistant');
};
