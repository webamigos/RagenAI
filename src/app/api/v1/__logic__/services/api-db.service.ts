import { PrismaClient, Role, Thread, UserDocument } from '@prisma/client';

import db from '@ragenai/prisma-client';
import OpenAI from 'openai';
import { Source } from '@prisma/client';

import { ApiContext } from '../types/ApiContext';
import { replaceIds } from '../filters/replace-ids.filter';
import { UpdateThreadDto } from '../dtos/update-thread.dto';
import { NotFoundException } from './api-errors.service';
import { ChatMessageDto } from '../dtos/chat.dto';
import { Runnable } from '@langchain/core/runnables';
import { initializeConversationChain } from '@/app/api/threads/services/initializeConversationChain';
import { initializeRagChain } from '@/app/api/threads/services/initializeBasicRag';
import { getAllSettings } from '@/app/lib/services/settings';
import { ApiKeyError } from '@/libs/chains/errors';
import { initializePublicRagChain } from '@/app/api/guest-threads/[...guestDetails]/services/initializePublicBasicRag';
import {
  runId,
  prepareSseMessage,
} from '@/app/api/guest-threads/[...guestDetails]/route';
import { SseMessageEvent } from '@/app/contracts/Events';
import {
  createAndStoreOpenAIThreadMessage,
  createMessageInDB,
} from '@/app/lib/services/message';
import { setSentryContext } from '@/app/lib/services/sentry';
import {
  getThreadMessages,
  getThreadDetails,
  findOrCreateOpenAIThread,
} from '@/app/lib/services/thread';

type ApiCollection<T extends { id: string | number | bigint }> = Omit<
  T,
  'public_id'
> & {
  id: T['id'];
};
type ApiUserDocument = ApiCollection<UserDocument>;
type ApiThread = ApiCollection<Thread>;

export class ApiDbService {
  private db: PrismaClient;
  private context: ApiContext;

  constructor(context: ApiContext) {
    this.db = db;
    if (!context.orgId) {
      throw new Error('Invalid organization');
    }
    this.context = context;
  }

  async getDocuments(): Promise<ApiUserDocument[]> {
    const documents = await db.userDocument.findMany({
      where: {
        organization_id: this.context.orgId,
      },
      select: {
        public_id: true, // make an alias and return as id?
        title: true,
        // content: true, it may be large field
        created_at: true,
        updated_at: true,
        file: {
          // is this needed?
          select: {
            public_id: true, // make an alias and return as id?
            file_name: true,
            file_size: true,
            created_at: true,
            file_type: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return replaceIds(documents);
  }

  async getDocument(
    publicId: UserDocument['public_id']
  ): Promise<ApiUserDocument> {
    const document = await db.userDocument.findFirst({
      where: {
        organization_id: this.context.orgId,
        public_id: publicId,
      },
      select: {
        public_id: true, // make an alias and return as id?
        title: true,
        // content: true, it may be large field
        created_at: true,
        updated_at: true,
        file: {
          // is this needed?
          select: {
            public_id: true, // make an alias and return as id?
            file_name: true,
            file_size: true,
            created_at: true,
            file_type: true,
          },
        },
      },
    });

    return replaceIds(document);
  }

  // ======== THREADS ========
  async getUserThreads(): Promise<ApiThread[]> {
    const documents = await db.thread.findMany({
      where: {
        organization_id: this.context.orgId,
        user_id: this.context.userId,
      },
      select: {
        public_id: true,
        title: true,
        source: true,
        created_at: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return replaceIds(documents);
  }

  async getUserThread(publicId: Thread['public_id']): Promise<ApiThread> {
    const document = await db.thread.findFirst({
      where: {
        public_id: publicId,
        organization_id: this.context.orgId,
        user_id: this.context.userId,
      },
      select: {
        public_id: true,
        title: true,
        source: true,
        created_at: true,
      },
    });

    return replaceIds(document);
  }

  async updateUserThread(
    publicId: Thread['public_id'],
    payload: UpdateThreadDto
  ): Promise<ApiThread> {
    const record = this.getUserThread(publicId);

    if (!record) {
      throw new NotFoundException();
    }
    // TODO: what about public threads which doesn't have organization_id or user_id?
    const updatedThread = await this.db.thread.update({
      where: {
        public_id: publicId,
        organization_id: this.context.orgId,
        user_id: this.context.userId,
      },
      data: {
        title: payload.title,
      },
      select: {
        public_id: true,
        title: true,
        source: true,
        created_at: true,
      },
    });

    return replaceIds(updatedThread);
  }

  async deleteUserThread(publicId: Thread['public_id']): Promise<void> {
    const record = this.getUserThread(publicId);

    if (!record) {
      throw new NotFoundException();
    }
    // TODO: what about public threads which doesn't have organization_id or user_id?

    await this.db.thread.delete({
      where: {
        public_id: publicId,
        organization_id: this.context.orgId,
        user_id: this.context.userId,
      },
    });
  }

  // TODO: decouple from OpenAI
  async createUserThread(): Promise<{ id: Thread['public_id'] }> {
    const openai = new OpenAI();

    // TODO: move creation of Open AI thread to first message
    const thread = await openai.beta.threads.create();

    const threadRecord = await db.thread.create({
      data: {
        openai_thread_id: thread.id,
        organization_id: this.context.orgId,
        user_id: this.context.userId,
        source: Source.API,
      },
    });

    return {
      id: threadRecord.public_id,
    };
  }

  async getChatMessages(publicThreadId: Thread['public_id']) {
    const messages = await db.message.findMany({
      where: {
        thread: {
          organization_id: this.context.orgId,
          user_id: this.context.userId,
          public_id: publicThreadId,
        },
      },
      select: {
        public_id: true,
        created_at: true,
        role: true,
        content: true,
      },
      orderBy: {
        created_at: 'asc',
      },
    });

    return replaceIds(messages);
  }

  // TODO: moderation
  async createChatMessages(
    publicThreadId: Thread['public_id'],
    payload: ChatMessageDto
  ) {
    // TODO: code duplication
    const rawSettings = await getAllSettings(this.context.orgId);
    if (!rawSettings.apiKey) {
      throw new ApiKeyError();
    }
    let runId = '';

    const { thread, threadRecord } = await findOrCreateOpenAIThread(
      publicThreadId,
      this.context.userId
    );

    const threadMessage = await createAndStoreOpenAIThreadMessage({
      prompt: payload.content,
      thread,
      threadRecord,
      visitorId: this.context.userId,
    });

    const basicRag = await initializePublicRagChain({
      settings: { ...rawSettings, apiKey: rawSettings.apiKey },
      organizationId: this.context.orgId,
    });
    const chain = basicRag.chain;
    const finalAnswerRunName = basicRag.finalAnswerRunName;

    const threadMessages = await getThreadMessages(publicThreadId);

    const conv_history = threadMessages?.messages
      .map((msg) => `${msg.role.toLowerCase()}: ${msg.content}`)
      .join('\n');

    const eventStream = chain.streamEvents(
      {
        question: payload.content,
        chat_history: conv_history,
      },
      {
        version: 'v2',
      }
    );

    let fullMessage = '';
    let chainRunIds = [];

    for await (const event of eventStream) {
      if (event.event === 'on_chain_start') {
        chainRunIds.push(event.run_id);
        runId = chainRunIds[0];
      }

      if (
        event.event === 'on_parser_stream' &&
        event.name === finalAnswerRunName
      ) {
        const textChunk = event.data.chunk || '';
        fullMessage += textChunk;
      } else if (
        event.event === 'on_parser_end' &&
        event.name === finalAnswerRunName
      ) {
        const dbMessage = await createMessageInDB({
          thread: {
            ...(threadRecord as Thread),
            visitor_id: threadRecord.visitor_id,
          },
          message: {
            id: threadMessage.public_id,
            created_at: Math.floor(Date.now() / 1000),
            content: event.data.output,
          },
          role: Role.ASSISTANT,
          runId,
        });

        return dbMessage.content;
      }
    }
  }
}
