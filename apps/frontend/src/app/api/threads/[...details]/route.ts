import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { MultiFileLoader } from 'langchain/document_loaders/fs/multi_file';
import { NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';

import { Role } from '@prisma/client';

import { createChatInstance } from './../services/ChatService';
import {
  getMessageById,
  getThreadDetails,
  getThreadMessages,
} from './../services/dbService';
import { createMessageInDB } from '../../../lib/services/message';
import {
  SseInitEvent,
  SseMessageDelta,
  SseMessageEvent,
} from '../../../contracts/Events';
import { PROMPT_TEMPLATE } from '../../../config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const apiKey = process.env.OPENAI_API_KEY!;
const model = process.env.OPENAI_CHAT_MODEL!;

type Params = {
  params: { details: string[] };
};

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
    const thredMessage = await getMessageById(publicMessageId);
    const threadMessages = await getThreadMessages(publicThreadId);
    const threadEntity = await getThreadDetails(publicThreadId);

    const promptTemplate = new PromptTemplate({
      template: PROMPT_TEMPLATE,
      inputVariables: ['chat_history', 'input', 'context'],
    });
    const multiFileLoader = new MultiFileLoader(
      [
        'src/data/ProceduratworzeniacontentuYouTubeSolo.pdf',
        'src/data/PROCEDURAtworzeniapostaLinkedIn.pdf',
        'src/data/PROCEDURAWEBINAR(Checklistawebinarowa).pdf',
        'src/data/ProceduraStrategiaMarketingowaLeadMagnet.pdf',
      ],
      {
        '.pdf': (path: string) => new PDFLoader(path),
      }
    );

    const chatHistory = threadMessages?.messages
      .map((msg) => {
        return `${msg.role.toLowerCase()}: ${msg.content}`;
      })
      .join('\n');

    const docs = await multiFileLoader.load();
    const prompt = await promptTemplate.format({
      chat_history: chatHistory || '',
      input: thredMessage!.content,
      context: docs,
    });
    const chain = createChatInstance(apiKey, model).pipe(
      new StringOutputParser()
    );
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
