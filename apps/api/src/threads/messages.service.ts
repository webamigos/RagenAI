import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  buildList,
  stripPrefix,
  type OpenAIListEnvelope,
} from '../common/utils/openai-format.js';
import { toOpenAIMessage, type OpenAIMessage } from './messages.mapper.js';
import { type ApiContext } from '../common/types/api-context.js';

export type CreateMessageInput = {
  role: 'user' | 'assistant';
  content: string;
};

export type ListMessagesInput = {
  limit?: number;
  order?: 'asc' | 'desc';
  after?: string;
};

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    threadIdInput: string,
    context: ApiContext,
    query: ListMessagesInput,
  ): Promise<OpenAIListEnvelope<OpenAIMessage>> {
    const thread = await this.resolveThreadOrThrow(threadIdInput, context);
    const limit = query.limit ?? 20;
    const order = query.order ?? 'desc';
    const cursorId = query.after ? stripPrefix(query.after, 'msg') : undefined;

    const rows = await this.prisma.client.message.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: order },
      take: limit,
      ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
    });

    const isEncrypted = thread.encryptedDek !== null;
    return buildList(rows.map((m) => toOpenAIMessage(m, { isEncrypted })));
  }

  async get(
    threadIdInput: string,
    messageIdInput: string,
    context: ApiContext,
  ): Promise<OpenAIMessage> {
    const thread = await this.resolveThreadOrThrow(threadIdInput, context);
    const rawMsgId = stripPrefix(messageIdInput, 'msg');
    const row = await this.prisma.client.message.findFirst({
      where: { id: rawMsgId, threadId: thread.id },
    });
    if (!row) {
      throw new NotFoundException(`Message '${messageIdInput}' not found`);
    }
    return toOpenAIMessage(row, { isEncrypted: thread.encryptedDek !== null });
  }

  /**
   * Persist a message on the thread. Does NOT run the model — the
   * OpenAI Assistants flow separates persistence (this endpoint) from
   * execution (runs, which we don't implement yet). For AI generation
   * against a conversation, use `POST /v1/chat/completions` with the
   * messages array inlined.
   */
  async create(
    threadIdInput: string,
    input: CreateMessageInput,
    context: ApiContext,
  ): Promise<OpenAIMessage> {
    const thread = await this.resolveThreadOrThrow(threadIdInput, context);

    const row = await this.prisma.client.message.create({
      data: {
        threadId: thread.id,
        role: input.role === 'assistant' ? 'ASSISTANT' : 'USER',
        content: input.content,
        source: 'API',
      },
    });

    return toOpenAIMessage(row, {
      isEncrypted: thread.encryptedDek !== null,
    });
  }

  async remove(
    threadIdInput: string,
    messageIdInput: string,
    context: ApiContext,
  ): Promise<{ id: string; object: 'thread.message.deleted'; deleted: true }> {
    const thread = await this.resolveThreadOrThrow(threadIdInput, context);
    const rawMsgId = stripPrefix(messageIdInput, 'msg');

    const { count } = await this.prisma.client.message.deleteMany({
      where: { id: rawMsgId, threadId: thread.id },
    });
    if (count === 0) {
      throw new NotFoundException(`Message '${messageIdInput}' not found`);
    }

    return {
      id: messageIdInput,
      object: 'thread.message.deleted',
      deleted: true,
    };
  }

  private async resolveThreadOrThrow(
    threadIdInput: string,
    context: ApiContext,
  ) {
    const rawId = stripPrefix(threadIdInput, 'thread');
    const thread = await this.prisma.client.thread.findFirst({
      where: {
        id: rawId,
        organizationId: context.orgId,
      },
      select: { id: true, encryptedDek: true },
    });
    if (!thread) {
      throw new NotFoundException(`Thread '${threadIdInput}' not found`);
    }
    return thread;
  }
}
