import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  buildList,
  stripPrefix,
  type OpenAIListEnvelope,
} from '../common/utils/openai-format.js';
import {
  toOpenAIThread,
  type OpenAIDeletedThread,
  type OpenAIThread,
} from './threads.mapper.js';
import { type ApiContext } from '../common/types/api-context.js';
import { type CreateThreadDto } from './dto/create-thread.dto.js';
import { type UpdateThreadDto } from './dto/update-thread.dto.js';
import { type ListThreadsDto } from './dto/list-threads.dto.js';
import { AssistantScopeService } from '../common/services/assistant-scope.service.js';

@Injectable()
export class ThreadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assistantScope: AssistantScopeService,
  ) {}

  async list(
    context: ApiContext,
    query: ListThreadsDto,
  ): Promise<OpenAIListEnvelope<OpenAIThread>> {
    const limit = query.limit ?? 20;
    const order = query.order ?? 'desc';
    const cursorId = query.after
      ? stripPrefix(query.after, 'thread')
      : undefined;

    const rows = await this.prisma.client.thread.findMany({
      where: { organizationId: context.orgId },
      orderBy: { createdAt: order },
      take: limit,
      ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      select: this.threadSelect(),
    });

    return buildList(rows.map((r) => toOpenAIThread(r)));
  }

  async get(id: string, context: ApiContext): Promise<OpenAIThread> {
    return toOpenAIThread(await this.findOrThrow(id, context));
  }

  async create(
    dto: CreateThreadDto,
    context: ApiContext,
  ): Promise<OpenAIThread> {
    // The key's scope decides; `assistant_id` has to agree with it. Null is
    // a scope of its own — a thread on the knowledge base.
    const projectId = await this.assistantScope.resolve(
      dto.assistant_id,
      context,
    );

    const thread = await this.prisma.client.thread.create({
      data: {
        title: dto.title ?? null,
        organizationId: context.orgId,
        userId: context.userId,
        projectId,
        source: 'API',
        ...(dto.messages?.length
          ? {
              messages: {
                create: dto.messages.map((m) => ({
                  role: m.role === 'assistant' ? 'ASSISTANT' : 'USER',
                  content: m.content,
                  source: 'API' as const,
                })),
              },
            }
          : {}),
      },
      select: this.threadSelect(),
    });

    return toOpenAIThread(thread);
  }

  async update(
    id: string,
    dto: UpdateThreadDto,
    context: ApiContext,
  ): Promise<OpenAIThread> {
    const rawId = stripPrefix(id, 'thread');
    await this.findOrThrow(id, context);

    // findOrThrow already verified org ownership, but re-scope the
    // update's where clause to org too — defence-in-depth against any
    // future refactor that drops the preceding check.
    const thread = await this.prisma.client.thread.update({
      where: {
        id: rawId,
        organizationId: context.orgId,
      },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
      },
      select: this.threadSelect(),
    });

    return toOpenAIThread(thread);
  }

  async remove(id: string, context: ApiContext): Promise<OpenAIDeletedThread> {
    const rawId = stripPrefix(id, 'thread');
    await this.findOrThrow(id, context);

    // Schema doesn't have onDelete:Cascade on the Message.threadId FK,
    // so wipe messages first. Wrap both deletes in one transaction so
    // a mid-flight failure doesn't leave orphaned messages behind.
    await this.prisma.client.$transaction([
      this.prisma.client.message.deleteMany({
        where: { threadId: rawId },
      }),
      this.prisma.client.thread.deleteMany({
        where: {
          id: rawId,
          organizationId: context.orgId,
        },
      }),
    ]);

    return { id, object: 'thread.deleted', deleted: true };
  }

  private async findOrThrow(id: string, context: ApiContext) {
    const rawId = stripPrefix(id, 'thread');
    const thread = await this.prisma.client.thread.findFirst({
      where: {
        id: rawId,
        organizationId: context.orgId,
      },
      select: this.threadSelect(),
    });
    if (!thread) {
      throw new NotFoundException(`Thread '${id}' not found`);
    }
    return thread;
  }

  private threadSelect() {
    return {
      id: true,
      title: true,
      createdAt: true,
      projectId: true,
    } as const;
  }
}
