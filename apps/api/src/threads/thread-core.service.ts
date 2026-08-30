import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { MessagesService } from '../messages/messages.service.js';
import {
  createMessageSchema,
  type CreateMessageDto,
} from '../messages/types.js';
import { decryptMessageContents } from '../crypto/decrypt-messages.js';
import { type ThreadDocumentUI } from '../chains/types/thread-document.js';
import {
  type CreateThreadDto,
  type ThreadAction,
  type ThreadContextAction,
  type ToggleStarredResult,
} from './thread-core.types.js';

const THREAD_SELECT = {
  id: true,
  createdAt: true,
  isStarred: true,
  title: true,
  projectId: true,
  teamId: true,
  project: { select: { id: true, title: true } },
  team: { select: { id: true, name: true } },
} as const;

const ALL_THREADS_SELECT = {
  ...THREAD_SELECT,
  organizationId: true,
} as const;

/**
 * Ported from ragen-app's src/features/threads/services/{commands,queries}/*.ts
 * (the panel-UI thread feature — CRUD, listing, search — distinct from this
 * directory's pre-existing `ThreadsService`/`ThreadsController`, which back
 * the OpenAI-compatible public API and are untouched by this port). See
 * docs/adrs/21-monorepo-and-api-decoupling.md — Phase C, sixth (last) slice.
 *
 * `getOrgIdFromAuthOrThrow()`/`getVisitorIdFromCookie()` (ragen-app's
 * session-cookie helpers) became explicit `orgId`/`visitorId` parameters,
 * same pattern as every other Phase C slice. `trackAudit` became
 * `AuditLogService.track()`.
 *
 * Not ported: `trackThreadCreatedCommand` — a no-op retained in ragen-app
 * only for backward compatibility with old callers (usage tracking moved
 * to the AiUsage table). Porting a no-op adds nothing.
 */
@Injectable()
export class ThreadsCoreService {
  private readonly logger = new Logger(ThreadsCoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly projects: ProjectsService,
    private readonly messages: MessagesService,
  ) {}

  // ---- Commands ----

  async createThread({
    visitorId,
    projectId,
    mentionedProjectId,
    preferredModel,
    threadDocuments,
    orgId,
    userId,
  }: {
    visitorId: string | null | undefined;
    projectId?: string;
    mentionedProjectId?: string;
    preferredModel?: string;
    threadDocuments?: ThreadDocumentUI[];
    orgId: string;
    userId?: string;
  }) {
    try {
      if (!orgId) {
        throw new Error('Organization ID is required');
      }

      const threadRecord = await this.prisma.client.thread.create({
        data: {
          organizationId: orgId,
          userId: userId,
          projectId: projectId ?? null,
          mentionedProjectId: mentionedProjectId,
          visitorId: userId ? userId : visitorId,
          preferredModel: preferredModel,
        },
      });

      if (threadDocuments && threadDocuments.length > 0 && userId && orgId) {
        const documentsWithUserFileId = threadDocuments.filter(
          (doc) => doc.userFileId,
        );

        if (documentsWithUserFileId.length > 0) {
          const userFileIds = documentsWithUserFileId.map(
            (doc) => doc.userFileId!,
          );

          const validFiles = await this.prisma.client.userFile.findMany({
            where: {
              id: { in: userFileIds },
              organizationId: orgId,
            },
            select: { id: true },
          });

          const validFileIds = new Set(validFiles.map((f) => f.id));
          const validDocuments = documentsWithUserFileId.filter((doc) =>
            validFileIds.has(doc.userFileId!),
          );

          if (validDocuments.length > 0) {
            const threadDocumentData = validDocuments.map((doc) => ({
              threadId: threadRecord.id,
              userFileId: doc.userFileId!,
            }));

            await this.prisma.client.threadDocument.createMany({
              data: threadDocumentData,
            });
          }
        }

        this.logger.log(
          `Created ThreadDocument relationships for uploaded files (threadId=${threadRecord.id}, totalThreadDocumentsCount=${threadDocuments.length}, savedThreadDocumentsCount=${documentsWithUserFileId.length})`,
        );
      }

      this.auditLog.track({
        orgId,
        userId,
        action: 'thread.created',
        entityType: 'thread',
        entityId: threadRecord.id,
        newData: { projectId: projectId ?? null },
      });

      return {
        id: threadRecord.id,
        projectId: projectId ?? null,
      };
    } catch (error) {
      this.logger.error('Failed to create new thread', error);
      throw error;
    }
  }

  async createThreadAction(
    orgId: string,
    userId: string | undefined,
    projectId?: string,
    mentionedProjectId?: string,
    preferredModel?: string,
    threadDocuments?: ThreadDocumentUI[],
  ): Promise<ThreadAction> {
    try {
      const thread = await this.createThread({
        visitorId: null,
        projectId,
        mentionedProjectId,
        preferredModel,
        threadDocuments,
        orgId,
        userId,
      });

      return {
        success: true,
        thread: {
          id: thread.id,
          projectId: thread.projectId,
        },
      };
    } catch (error) {
      this.logger.error('Cannot create thread', error);
      return { success: false, errorMessage: 'Cannot create thread' };
    }
  }

  async createGuestThread({
    organizationId,
    projectId,
    mentionedProjectId,
    preferredModel,
    visitorId,
  }: {
    organizationId?: string;
    projectId?: string;
    mentionedProjectId?: string;
    preferredModel?: string;
    visitorId: string;
  }): Promise<ThreadAction> {
    try {
      const threadRecord = await this.prisma.client.thread.create({
        data: {
          organizationId: organizationId,
          visitorId: visitorId,
          projectId: projectId,
          mentionedProjectId: mentionedProjectId,
          preferredModel: preferredModel,
        },
      });

      return {
        success: true,
        thread: {
          id: threadRecord.id,
          projectId: projectId ?? null,
        },
      };
    } catch (error) {
      this.logger.error('Cannot create guest thread', error);
      return { success: false, errorMessage: 'Cannot create thread' };
    }
  }

  async deleteThread(
    threadId: string,
    orgId: string,
  ): Promise<{ success: true } | { success: false; errorMessage: string }> {
    try {
      const thread = await this.prisma.client.thread.findFirst({
        where: { id: threadId, organizationId: orgId },
      });

      if (!thread) {
        return { success: false, errorMessage: 'Thread not found' };
      }

      await this.prisma.client.message.deleteMany({
        where: { threadId: thread.id },
      });
      await this.prisma.client.threadDocument.deleteMany({
        where: { threadId: thread.id },
      });
      await this.prisma.client.thread.delete({ where: { id: thread.id } });

      this.auditLog.track({
        orgId,
        action: 'thread.deleted',
        entityType: 'thread',
        entityId: threadId,
        oldData: { title: thread.title },
      });

      this.logger.log(`Thread deleted (threadId=${threadId})`);

      return { success: true };
    } catch (error) {
      this.logger.error(`Error deleting thread (threadId=${threadId})`, error);
      return { success: false, errorMessage: 'Failed to delete thread' };
    }
  }

  async renameThread(
    threadId: string,
    title: string,
    orgId: string,
  ): Promise<
    { success: true; title: string } | { success: false; errorMessage: string }
  > {
    try {
      const thread = await this.prisma.client.thread.findFirst({
        where: { id: threadId, organizationId: orgId },
      });

      if (!thread) {
        return { success: false, errorMessage: 'Thread not found' };
      }

      await this.prisma.client.thread.update({
        where: { id: threadId },
        data: { title: title.trim() },
      });

      this.auditLog.track({
        orgId,
        action: 'thread.renamed',
        entityType: 'thread',
        entityId: threadId,
        oldData: { title: thread.title },
        newData: { title: title.trim() },
      });

      this.logger.log(`Thread renamed (threadId=${threadId}, title=${title})`);

      return { success: true, title: title.trim() };
    } catch (error) {
      this.logger.error(`Error renaming thread (threadId=${threadId})`, error);
      return { success: false, errorMessage: 'Failed to rename thread' };
    }
  }

  async toggleThreadStarred(
    threadId: string,
    isStarred: boolean,
    orgId: string,
  ): Promise<ToggleStarredResult> {
    try {
      const thread = await this.prisma.client.thread.findFirst({
        where: { id: threadId, organizationId: orgId },
      });

      if (!thread) {
        return { success: false, errorMessage: 'Thread not found' };
      }

      const updated = await this.prisma.client.thread.update({
        where: { id: threadId },
        data: { isStarred: isStarred },
        select: { id: true, isStarred: true },
      });

      this.logger.log(
        `Thread starred status updated (threadId=${threadId}, isStarred=${isStarred})`,
      );

      return {
        success: true,
        id: updated.id,
        isStarred: updated.isStarred,
      };
    } catch (error) {
      this.logger.error(
        `Error toggling thread starred status (threadId=${threadId}, isStarred=${isStarred})`,
        error,
      );
      return {
        success: false,
        errorMessage: 'Failed to update starred status',
      };
    }
  }

  async removeThreadProjectContext(publicThreadId: string) {
    try {
      const updatedThread = await this.prisma.client.thread.update({
        where: { id: publicThreadId },
        data: { mentionedProjectId: null },
        select: { id: true, mentionedProjectId: true },
      });

      this.logger.log(
        `Thread project context removed successfully (threadId=${publicThreadId})`,
      );

      return updatedThread;
    } catch (error) {
      this.logger.error(
        `Failed to remove thread context ${publicThreadId}`,
        error,
      );
      throw error;
    }
  }

  async removeThreadContext(
    threadId: string,
    orgId: string,
  ): Promise<ThreadContextAction> {
    try {
      const thread = await this.prisma.client.thread.findFirst({
        where: { id: threadId, organizationId: orgId },
      });

      if (!thread) {
        return { success: false, errorMessage: 'Thread not found' };
      }

      const updatedThread = await this.removeThreadProjectContext(threadId);

      this.logger.log(
        `Thread context removed successfully (threadId=${threadId}, orgId=${orgId})`,
      );

      return {
        success: true,
        mentionedProjectId: updatedThread.mentionedProjectId,
      };
    } catch (error) {
      this.logger.error(
        `Error removing thread context (threadId=${threadId})`,
        error,
      );
      return {
        success: false,
        errorMessage: 'Failed to remove thread context',
      };
    }
  }

  async updateThreadProjectContext(
    publicThreadId: string,
    mentionedProjectId: string | null,
  ) {
    try {
      const updatedThread = await this.prisma.client.thread.update({
        where: { id: publicThreadId },
        data: { mentionedProjectId: mentionedProjectId },
        select: { id: true, mentionedProjectId: true },
      });

      this.logger.log(
        `Thread project context updated successfully (threadId=${publicThreadId}, mentionedProjectId=${mentionedProjectId})`,
      );

      return updatedThread;
    } catch (error) {
      this.logger.error(
        `Failed to update thread context ${publicThreadId}`,
        error,
      );
      throw error;
    }
  }

  async updateThreadContext(
    threadId: string,
    mentionedProjectId: string | null,
    orgId: string,
  ): Promise<ThreadContextAction> {
    try {
      const thread = await this.prisma.client.thread.findFirst({
        where: { id: threadId, organizationId: orgId },
      });

      if (!thread) {
        return { success: false, errorMessage: 'Thread not found' };
      }

      if (mentionedProjectId) {
        const project = await this.prisma.client.project.findFirst({
          where: { id: mentionedProjectId, organizationId: orgId },
        });

        if (!project) {
          return {
            success: false,
            errorMessage: 'Project not found or access denied',
          };
        }
      }

      const updatedThread = await this.updateThreadProjectContext(
        threadId,
        mentionedProjectId,
      );

      this.logger.log(
        `Thread context updated successfully (threadId=${threadId}, mentionedProjectId=${updatedThread.mentionedProjectId}, orgId=${orgId})`,
      );

      return {
        success: true,
        mentionedProjectId: updatedThread.mentionedProjectId,
      };
    } catch (error) {
      this.logger.error(
        `Error updating thread context (threadId=${threadId}, mentionedProjectId=${mentionedProjectId})`,
        error,
      );
      return {
        success: false,
        errorMessage: 'Failed to update thread context',
      };
    }
  }

  async findOrCreateThread(
    threadId: CreateThreadDto['id'],
    visitorId: string,
    organizationId?: string,
  ) {
    try {
      const whereClause: { id: string; organizationId?: string } = {
        id: threadId,
      };

      if (organizationId) {
        whereClause.organizationId = organizationId;
      }

      const threadRecord = await this.prisma.client.thread.findFirst({
        where: whereClause,
      });

      if (!threadRecord) {
        throw new Error(`Thread ${threadId} not found`);
      }

      if (!threadRecord.visitorId || threadRecord.visitorId === visitorId) {
        await this.prisma.client.thread.update({
          where: { id: threadRecord.id },
          data: { visitorId: visitorId },
        });
      } else {
        this.logger.warn(
          `Visitor ID mismatch — thread already bound to another visitor (threadId=${threadId}, visitorId=${visitorId}, existingVisitorId=${threadRecord.visitorId})`,
        );
        throw new Error('Thread belongs to another session');
      }

      return { threadRecord };
    } catch (error) {
      this.logger.error(`Failed to fetch thread ${threadId}`, error);
      throw new Error(`Cannot fetch thread ${threadId}`);
    }
  }

  /**
   * Ported from ragen-app's src/features/messages/services/commands/
   * send-message-command.ts — deferred from the `messages` slice since it
   * needs `findOrCreateThread`, ported above in this same slice.
   */
  async sendMessage(
    threadId: string,
    data: CreateMessageDto,
    visitorId: string,
  ) {
    const requestData = await createMessageSchema().safeParseAsync(data);

    if (!requestData.success) {
      return { error: 'Bad structure', status: 400 as const };
    }

    const prompt = requestData.data.prompt;

    try {
      const { threadRecord } = await this.findOrCreateThread(
        threadId,
        visitorId,
      );

      const messageResponse = await this.messages.createAndStoreMessage({
        prompt,
        threadId: threadRecord.id,
        visitorId,
        messageType: requestData.data.messageType,
        voiceDurationSeconds: requestData.data.voiceDurationSeconds,
      });

      return { message: messageResponse, status: 201 as const };
    } catch (error) {
      this.logger.error('processing error', error);
      return { error: 'Problem during processing', status: 400 as const };
    }
  }

  // ---- Queries ----

  async getAllThreads(
    visitorId: string,
    orgId: string,
    skip = 0,
    take = 20,
    query?: string,
    userTeamIds: string[] = [],
  ) {
    const where = {
      organizationId: orgId,
      chatbotId: null,
      ...(query
        ? { title: { contains: query, mode: 'insensitive' as const } }
        : {}),
      messages: { some: {} },
      OR: [
        { visitorId: visitorId },
        ...(userTeamIds.length > 0 ? [{ teamId: { in: userTeamIds } }] : []),
      ],
    };

    const [threads, total] = await Promise.all([
      this.prisma.client.thread.findMany({
        where,
        orderBy: [{ isStarred: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: take + 1,
        select: ALL_THREADS_SELECT,
      }),
      this.prisma.client.thread.count({ where }),
    ]);

    const hasMore = threads.length > take;
    const threadsSlice = hasMore ? threads.slice(0, take) : threads;

    return {
      threads: threadsSlice.map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
      })),
      hasMore,
      total,
    };
  }

  async getSharedThreads(userId: string, orgId: string) {
    const shares = await this.prisma.client.threadShare.findMany({
      where: {
        userId,
        thread: { organizationId: orgId, messages: { some: {} } },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        thread: { select: THREAD_SELECT },
        sharedBy: { select: { name: true, email: true } },
      },
    });

    return shares.map((s) => ({
      id: s.thread.id,
      createdAt: s.thread.createdAt.toISOString(),
      isStarred: s.thread.isStarred,
      title: s.thread.title,
      projectId: s.thread.projectId,
      teamId: s.thread.teamId,
      project: s.thread.project,
      team: s.thread.team,
      messages: [],
      sharedByUser: { name: s.sharedBy.name, email: s.sharedBy.email },
    }));
  }

  async getSidebarThreads(
    visitorId: string,
    orgId: string,
    recentLimit = 20,
    recentSkip = 0,
    userTeamIds: string[] = [],
  ) {
    const baseWhere = {
      organizationId: orgId,
      chatbotId: null,
      messages: { some: {} },
      OR: [
        { visitorId: visitorId },
        ...(userTeamIds.length > 0 ? [{ teamId: { in: userTeamIds } }] : []),
      ],
    };

    const [starred, recent] = await Promise.all([
      this.prisma.client.thread.findMany({
        where: { ...baseWhere, isStarred: true },
        orderBy: { createdAt: 'desc' },
        select: THREAD_SELECT,
      }),
      this.prisma.client.thread.findMany({
        where: { ...baseWhere, isStarred: false },
        orderBy: { createdAt: 'desc' },
        skip: recentSkip,
        take: recentLimit + 1,
        select: THREAD_SELECT,
      }),
    ]);

    const hasMore = recent.length > recentLimit;
    const recentSlice = hasMore ? recent.slice(0, recentLimit) : recent;

    const serialize = (threads: typeof starred) =>
      threads.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() }));

    return {
      starred: serialize(starred),
      recent: serialize(recentSlice),
      hasMore,
    };
  }

  async getUserThreads(
    visitorId: string,
    orgId: string,
    skip?: number,
    take?: number,
    query?: string,
  ) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const defaultProjectId = await this.projects.getDefaultProjectId(orgId);

    if (!defaultProjectId) {
      this.logger.error(`Default project ID does not exist! (orgId=${orgId})`);
      throw new Error('Default project ID does not exist!');
    }

    const threads = await this.prisma.client.thread.findMany({
      where: {
        visitorId: visitorId,
        projectId: defaultProjectId,
        messages: query
          ? {
              some: {
                createdAt: { gte: thirtyDaysAgo },
                content: { contains: query, mode: 'insensitive' },
              },
            }
          : { some: {} },
      },
      orderBy: { createdAt: 'desc' },
      skip: skip,
      take: take,
      select: {
        id: true,
        createdAt: true,
        visitorId: true,
        projectId: true,
        isStarred: true,
        encryptedDek: true,
        messages: {
          select: { content: true, createdAt: true, role: true },
        },
      },
    });

    const results = await Promise.all(
      threads.map(async (thread) => {
        let decryptedMessages: typeof thread.messages;
        try {
          decryptedMessages = await decryptMessageContents(
            thread.messages,
            thread.encryptedDek,
          );
        } catch (error) {
          this.logger.error(
            `Failed to decrypt thread messages (threadId=${thread.id})`,
            error,
          );
          decryptedMessages = thread.messages.map((msg) => ({
            ...msg,
            content: '',
          }));
        }
        const { encryptedDek: _encryptedDek, ...threadData } = thread;
        return {
          ...threadData,
          createdAt: thread.createdAt.toISOString(),
          messages: decryptedMessages.map((msg) => ({
            ...msg,
            createdAt: msg.createdAt.toISOString(),
          })),
        };
      }),
    );

    return results;
  }

  async searchAll(visitorId: string, orgId: string, query: string) {
    const trimmed = (query ?? '').trim();
    if (!visitorId || trimmed.length < 2) {
      return [];
    }

    const [threads, projects] = await Promise.all([
      this.prisma.client.thread.findMany({
        where: {
          organizationId: orgId,
          visitorId: visitorId,
          messages: { some: {} },
          title: { contains: trimmed, mode: 'insensitive' },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, title: true, createdAt: true },
      }),
      this.prisma.client.project.findMany({
        where: {
          organizationId: orgId,
          title: { contains: trimmed, mode: 'insensitive' },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, title: true, createdAt: true },
      }),
    ]);

    return [
      ...projects.map((p) => ({
        id: p.id,
        title: p.title,
        type: 'project' as const,
        createdAt: p.createdAt.toISOString(),
      })),
      ...threads.map((t) => ({
        id: t.id,
        title: t.title || 'Untitled',
        type: 'thread' as const,
        createdAt: t.createdAt.toISOString(),
      })),
    ];
  }

  async searchThreads(visitorId: string, orgId: string, query: string) {
    if (!visitorId || !query.trim() || query.trim().length < 3) {
      return [];
    }

    const threads = await this.prisma.client.thread.findMany({
      where: {
        organizationId: orgId,
        visitorId,
        messages: { some: {} },
        title: { contains: query.trim(), mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, title: true },
    });

    return threads.map((thread) => ({
      id: thread.id,
      title: thread.title || 'Untitled',
    }));
  }

  async getThreadDetails(
    publicThreadId: string,
    orgId: string,
    options?: { includeMessages?: boolean },
  ) {
    try {
      const thread = await this.prisma.client.thread.findFirstOrThrow({
        where: { id: publicThreadId, organizationId: orgId },
        select: {
          id: true,
          createdAt: true,
          visitorId: true,
          preferredCommunicationType: true,
          preferredModel: true,
          projectId: true,
          mentionedProjectId: true,
          teamId: true,
          encryptedDek: true,
          project: { select: { id: true, title: true } },
          team: { select: { id: true, name: true } },
          ...(options?.includeMessages
            ? {
                messages: {
                  select: { role: true, content: true },
                  orderBy: { createdAt: 'asc' as const },
                },
              }
            : {}),
        },
      });

      let messages: { role: string; content: string }[] | undefined;
      if ('messages' in thread && Array.isArray(thread.messages)) {
        try {
          messages = await decryptMessageContents(
            thread.messages as { role: string; content: string }[],
            thread.encryptedDek,
          );
        } catch (error) {
          this.logger.error(
            `Failed to decrypt thread messages (threadId=${thread.id})`,
            error,
          );
          messages = thread.messages;
        }
      }

      const { encryptedDek: _encryptedDek, ...threadData } = thread;

      return {
        ...threadData,
        ...(messages ? { messages } : {}),
        createdAt: threadData.createdAt.toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to fetch thread ${publicThreadId}`, error);
      throw error;
    }
  }

  async getThreadMessagesList(publicThreadId: string, orgId: string) {
    try {
      const thread = await this.prisma.client.thread.findFirst({
        where: { id: publicThreadId, organizationId: orgId },
        select: {
          encryptedDek: true,
          messages: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              createdAt: true,
              content: true,
              role: true,
              threadId: true,
              visitorId: true,
              rate: true,
              runId: true,
              messageType: true,
              voiceDurationSeconds: true,
              voicePlayed: true,
              attachments: true,
              metadata: true,
              source: true,
            },
          },
        },
      });

      if (thread?.messages) {
        const decryptedMessages = await decryptMessageContents(
          thread.messages,
          thread.encryptedDek,
        );

        const { encryptedDek: _encryptedDek, ...threadData } = thread;
        return {
          ...threadData,
          messages: decryptedMessages.map((message) => ({
            ...message,
            createdAt: message.createdAt.toISOString(),
          })),
        };
      }

      if (thread) {
        const { encryptedDek: _encryptedDek, ...threadData } = thread;
        return threadData;
      }

      return thread;
    } catch (error) {
      this.logger.error(`Failed to fetch thread ${publicThreadId}`, error);
      throw error;
    }
  }
}
