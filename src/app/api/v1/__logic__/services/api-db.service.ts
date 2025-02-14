import {
  PrismaClient,
  Role,
  Thread,
  UserDocument,
  Source,
  Message,
} from '@prisma/client';

import db from '@ragenai/prisma-client';
import OpenAI from 'openai';

import { ApiContext } from '../types/ApiContext';
import { parseResponse } from '../filters/replace-ids.filter';
import { UpdateThreadDto } from '../dtos/update-thread.dto';
import { NotFoundException } from './api-errors.service';
import { ChatMessageDto } from '../dtos/chat.dto';
import { QueryDto } from '../dtos/query.dto';
import { getAllSettings } from '@/app/lib/services/settings';
import { ApiKeyError } from '@/libs/chains/errors';
import { initializePublicRagChain } from '@/app/api/guest-threads/[...guestDetails]/services/initializePublicBasicRag';

import {
  createAndStoreMessage,
  createMessageInDB,
} from '@/app/lib/services/message';
import { findOrCreateThread } from '@/app/lib/services/thread';
import {
  prepareApiSseMessage,
  sendApiEvent,
} from '@/libs/sse/prepare-sse-message';

type ApiCollection<T extends { id: string | number | bigint }> = Omit<
  T,
  'public_id'
> & {
  id: T['id'];
};
type ApiUserDocument = ApiCollection<UserDocument>;
type ApiThread = ApiCollection<Thread>;
type ApiMessage = ApiCollection<Message>;

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

    return parseResponse(documents);
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

    return parseResponse(document);
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

    return parseResponse(documents);
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

    return parseResponse(document);
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

    return parseResponse(updatedThread);
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
        organization_id: this.context.orgId,
        user_id: this.context.userId,
        source: Source.API,
      },
    });

    return {
      id: threadRecord.public_id,
    };
  }

  async getChatMessages(
    publicThreadId: Thread['public_id']
  ): Promise<ApiMessage[]> {
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

    return parseResponse(messages);
  }

  private async prepareChainToRun(
    publicThreadId: Thread['public_id'],
    payload: ChatMessageDto,
    controller?: ReadableStreamDefaultController
  ) {
    const rawSettings = await getAllSettings(this.context.orgId);
    if (!rawSettings.apiKey) {
      throw new ApiKeyError();
    }
    let runId = '';

    if (controller) {
      sendApiEvent(controller, 'find_thread');
    }

    const { threadRecord } = await findOrCreateThread(
      publicThreadId,
      this.context.userId
    );

    if (controller) {
      sendApiEvent(controller, 'thread_found', {
        id: threadRecord.public_id,
      });

      sendApiEvent(controller, 'save_user_message');
    }

    const threadMessage = await createAndStoreMessage({
      prompt: payload.content,
      threadRecord,
      visitorId: this.context.userId,
    });

    if (controller) {
      sendApiEvent(controller, 'user_message_saved', {
        id: threadMessage.public_id,
      });

      sendApiEvent(controller, 'init_lmm');
    }

    const basicRag = await initializePublicRagChain({
      settings: { ...rawSettings, apiKey: rawSettings.apiKey },
      organizationId: this.context.orgId,
    });
    const chain = basicRag.chain;
    const finalAnswerRunName = basicRag.finalAnswerRunName;

    if (controller) {
      sendApiEvent(controller, 'get_thread_messages');
    }

    const threadMessages = await this.getChatMessages(publicThreadId);

    if (controller) {
      sendApiEvent(controller, 'add_thread_messages_to_lmm');
    }

    const conv_history = threadMessages
      .map((msg) => `${msg.role.toLowerCase()}: ${msg.content}`)
      .join('\n');

    return {
      chain,
      finalAnswerRunName,
      runId,
      threadRecord,
      threadMessage,
      conv_history,
    };
  }

  // TODO: moderation
  async createChatMessages(
    publicThreadId: Thread['public_id'],
    payload: ChatMessageDto
  ) {
    const { chain, threadRecord, threadMessage, runId, conv_history } =
      await this.prepareChainToRun(publicThreadId, payload);

    // for chat without streaming:
    const chatResponse = await chain.invoke({
      question: payload.content,
      chat_history: conv_history,
    });

    const dbMessage = await createMessageInDB({
      thread: threadRecord,
      message: {
        id: threadMessage.public_id,
        content: chatResponse,
        source: Source.API,
      },
      role: Role.ASSISTANT,
      runId,
    });

    return {
      id: dbMessage.public_id,
      content: dbMessage.content,
      role: dbMessage.role,
      created_at: dbMessage.created_at,
    };
  }

  async streamChatMessages(
    publicThreadId: Thread['public_id'],
    payload: ChatMessageDto,
    controller: ReadableStreamDefaultController
  ) {
    const {
      chain,
      finalAnswerRunName,
      threadRecord,
      threadMessage,
      runId,
      conv_history,
    } = await this.prepareChainToRun(publicThreadId, payload, controller);

    const encoder = new TextEncoder();
    controller.enqueue(encoder.encode(prepareApiSseMessage('start_lmm')));

    const eventStream = chain.streamEvents(
      {
        question: payload.content,
        chat_history: conv_history,
      },
      {
        version: 'v2',
      }
    );

    return { eventStream, finalAnswerRunName, threadRecord, threadMessage };
  }

  // FIXME: it takes a lot of time
  async query(payload: QueryDto) {
    // TODO: code duplication
    const rawSettings = await getAllSettings(this.context.orgId);
    if (!rawSettings.apiKey) {
      throw new ApiKeyError();
    }

    const basicRag = await initializePublicRagChain({
      settings: { ...rawSettings, apiKey: rawSettings.apiKey },
      organizationId: this.context.orgId,
    });
    const chain = basicRag.chain;

    const result = await chain.invoke({
      question: payload.content,
      chat_history: ' ', // FIXME: workaround
    });

    return result;
  }
}
