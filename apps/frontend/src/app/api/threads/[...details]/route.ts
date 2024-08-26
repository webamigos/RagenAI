import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

import db from '@salesyy/prisma-client';

import { createMessageInDB } from '../../../lib/services/message';
import {
  SseInitEvent,
  SseMessageDelta,
  SseMessageEvent,
} from '../../../contracts/Events';
import { Role } from '@prisma/client';
import { NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_CHAT_MODEL;
const TEMPLATE = `
{chat_history}
user: {input}
assistant:`;

type Params = {
  params: { details: string[] };
};

const chat = new ChatOpenAI({
  apiKey,
  model,
  temperature: 1,
  verbose: true,
  streaming: true,
});

const prepareSseMessage = (
  event: string,
  data: SseInitEvent | SseMessageEvent | SseMessageDelta
) => {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
};

export async function GET(_request: Request, { params }: Params) {
  const publicThreadId = params.details[0];
  const publicMessageId = params.details[1];

  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  writer.write(prepareSseMessage('init', { type: 'init' }));

  try {
    const thredMessage = await db.message.findUnique({
      where: {
        public_id: publicMessageId,
      },
    });

    const threadMessages = await db.thread.findUnique({
      where: {
        public_id: publicThreadId,
      },
      select: {
        messages: {
          orderBy: {
            created_at: 'asc',
          },
        },
      },
    });

    const chatHistory = threadMessages?.messages
      .map((msg) => {
        return `${msg.role.toLowerCase()}: ${msg.content}`;
      })
      .join('\n');

    const threadEntity = await db.thread.findUniqueOrThrow({
      where: { public_id: publicThreadId },
      select: {
        id: true,
        public_id: true,
        openai_thread_id: true,
        created_at: true,
      },
    });

    const promptTemplate = new PromptTemplate({
      template: TEMPLATE,
      inputVariables: ['chat_history', 'input'],
    });

    const prompt = await promptTemplate.format({
      chat_history: chatHistory || '',
      input: thredMessage!.content,
    });

    const chain = chat.pipe(new StringOutputParser());

    const eventStream = await chain.streamEvents(prompt, {
      version: 'v1',
    });

    let fullMessage = '';
    for await (const event of eventStream) {
      if (event.event === 'on_llm_stream') {
        const textChunk = event.data.chunk?.text || '';
        fullMessage += textChunk;
        writer.write(
          prepareSseMessage('message', {
            type: 'delta',
            payload: { content: textChunk },
          })
        );
      } else if (event.event === 'on_chain_end') {
        const dbMessage = await createMessageInDB({
          thread: threadEntity,
          message: {
            id: publicMessageId,
            created_at: Math.floor(Date.now() / 1000),
            content: fullMessage,
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
    NextResponse.json(
      { error: 'Error processing SSE' },
      { status: StatusCodes.BAD_REQUEST }
    );
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
