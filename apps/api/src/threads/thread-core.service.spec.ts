/* eslint-disable @typescript-eslint/unbound-method */
import type { Mock } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ThreadsCoreService } from './thread-core.service.js';
import type { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';
import { type AuditLogService } from '../audit-logs/audit-log.service.js';
import { type ProjectsService } from '../projects/projects.service.js';
import { type MessagesService } from '../messages/messages.service.js';

vi.mock('@ragenai/crypto', async () => ({
  // Partial, and merged: the two modules this file used to stub are one
  // package now, so separate vi.mock calls would silently overwrite each
  // other, and a full mock would stub the whole envelope to steer a few
  // functions.
  ...(await vi.importActual<typeof import('@ragenai/crypto')>(
    '@ragenai/crypto',
  )),
  decryptMessageContents: vi.fn((messages: unknown) =>
    Promise.resolve(messages),
  ),
}));

describe('ThreadsCoreService', () => {
  function makeService(
    overrides: {
      thread?: Partial<Record<string, Mock>>;
      userFile?: Partial<Record<string, Mock>>;
      threadDocument?: Partial<Record<string, Mock>>;
      threadShare?: Partial<Record<string, Mock>>;
      project?: Partial<Record<string, Mock>>;
    } = {},
  ) {
    const prisma = {
      client: {
        thread: {
          create: vi.fn(),
          findFirst: vi.fn(),
          findFirstOrThrow: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          count: vi.fn(),
          findMany: vi.fn(),
          ...overrides.thread,
        },
        userFile: {
          findMany: vi.fn().mockResolvedValue([]),
          ...overrides.userFile,
        },
        threadDocument: {
          createMany: vi.fn(),
          deleteMany: vi.fn(),
          ...overrides.threadDocument,
        },
        threadShare: {
          findMany: vi.fn().mockResolvedValue([]),
          ...overrides.threadShare,
        },
        message: { deleteMany: vi.fn() },
        project: { findFirst: vi.fn(), ...overrides.project },
      },
    } as unknown as PrismaService;

    const auditLog = { track: vi.fn() } as unknown as AuditLogService;
    const projects = {
      getDefaultProjectId: vi.fn(),
    } as unknown as ProjectsService;
    const messages = {
      createAndStoreMessage: vi.fn(),
    } as unknown as MessagesService;
    const subscriptions = {
      isFeatureEnabled: vi.fn().mockResolvedValue(true),
    } as unknown as SubscriptionsService;

    return {
      service: new ThreadsCoreService(
        prisma,
        auditLog,
        projects,
        messages,
        subscriptions,
      ),
      subscriptions,
      prisma,
      auditLog,
      projects,
      messages,
    };
  }

  describe('createThread', () => {
    it('throws when orgId is missing', async () => {
      const { service } = makeService();
      await expect(
        service.createThread({ visitorId: 'v1', orgId: '' }),
      ).rejects.toThrow('Organization ID is required');
    });

    it('creates a thread and tracks an audit event', async () => {
      const { service, prisma, auditLog } = makeService({
        thread: {
          create: vi.fn().mockResolvedValue({ id: 't1' }),
        } as never,
      });

      const result = await service.createThread({
        visitorId: 'visitor-1',
        orgId: 'org-1',
        projectId: 'proj-1',
      });

      expect(result).toEqual({ id: 't1', projectId: 'proj-1' });
      expect(prisma.client.thread.create).toHaveBeenCalled();
      expect(auditLog.track).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: 'org-1',
          action: 'thread.created',
          entityId: 't1',
        }),
      );
    });
  });

  describe('createThreadAction', () => {
    it('returns a failure result instead of throwing', async () => {
      const { service } = makeService();
      const result = await service.createThreadAction('', undefined);
      expect(result).toEqual({
        success: false,
        errorMessage: 'Cannot create thread',
      });
    });
  });

  describe('createThreadForUser', () => {
    it('throws NotFoundException when projectId does not belong to orgId (no access-control bypass)', async () => {
      const { service, prisma } = makeService({
        project: { findFirst: vi.fn().mockResolvedValue(null) },
      });

      await expect(
        service.createThreadForUser('org-1', 'user-1', {
          projectId: 'other-org-project',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.client.thread.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when mentionedProjectId does not belong to orgId', async () => {
      const { service } = makeService({
        project: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({ id: 'proj-1' }) // projectId check passes
            .mockResolvedValueOnce(null), // mentionedProjectId check fails
        },
      });

      await expect(
        service.createThreadForUser('org-1', 'user-1', {
          projectId: 'proj-1',
          mentionedProjectId: 'other-org-project',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates the thread when projectId belongs to orgId', async () => {
      const { service, prisma } = makeService({
        project: { findFirst: vi.fn().mockResolvedValue({ id: 'proj-1' }) },
        thread: { create: vi.fn().mockResolvedValue({ id: 't1' }) } as never,
      });

      const result = await service.createThreadForUser('org-1', 'user-1', {
        projectId: 'proj-1',
      });

      expect(result).toEqual({
        success: true,
        thread: { id: 't1', projectId: 'proj-1' },
      });
      expect(prisma.client.thread.create).toHaveBeenCalled();
    });

    it('skips the project check entirely when no projectId/mentionedProjectId given', async () => {
      const { service, prisma } = makeService({
        thread: { create: vi.fn().mockResolvedValue({ id: 't1' }) } as never,
      });

      await service.createThreadForUser('org-1', 'user-1', {});

      expect(prisma.client.project.findFirst).not.toHaveBeenCalled();
      expect(prisma.client.thread.create).toHaveBeenCalled();
    });
  });

  describe('sendMessageInOwnThread', () => {
    it('throws NotFoundException when the thread does not belong to orgId (no access-control bypass)', async () => {
      const { service, prisma, messages } = makeService({
        thread: { findFirst: vi.fn().mockResolvedValue(null) },
      });

      await expect(
        service.sendMessageInOwnThread('t1', 'org-1', 'user-1', {
          prompt: 'hello there',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.client.thread.findFirst).toHaveBeenCalledWith({
        // A Brain assistant conversation is not a chat thread to post into.
        where: { id: 't1', organizationId: 'org-1', kind: 'CHAT' },
        select: { id: true },
      });
      expect(messages.createAndStoreMessage).not.toHaveBeenCalled();
    });

    it('delegates to sendMessage when the thread belongs to orgId', async () => {
      const { service, messages } = makeService({
        thread: {
          findFirst: vi.fn().mockResolvedValue({ id: 't1' }),
        } as never,
      });
      (messages.createAndStoreMessage as Mock).mockResolvedValue({
        id: 'm1',
      });

      // findOrCreateThread() is called internally by sendMessage() and
      // needs its own thread.findFirst lookup — same mock handles both
      // calls since neither depends on call order here.
      const result = await service.sendMessageInOwnThread(
        't1',
        'org-1',
        'user-1',
        { prompt: 'hello there' },
      );

      expect(result).toEqual({ message: { id: 'm1' }, status: 201 });
    });
  });

  describe('deleteThread', () => {
    it('deletes nothing where the organization may not delete threads', async () => {
      // The demo: one shared account must not remove the example threads.
      const { service, prisma, subscriptions } = makeService({
        thread: {
          findFirst: vi.fn().mockResolvedValue({ id: 't1', title: 'Hi' }),
        } as never,
      });
      vi.mocked(subscriptions.isFeatureEnabled).mockResolvedValue(false);

      const result = await service.deleteThread('t1', 'org-1');

      expect(result).toEqual({
        success: false,
        errorMessage: 'This organization cannot delete threads',
      });
      expect(subscriptions.isFeatureEnabled).toHaveBeenCalledWith(
        'org-1',
        'deleteThreads',
      );
      expect(prisma.client.thread.delete).not.toHaveBeenCalled();
      expect(prisma.client.message.deleteMany).not.toHaveBeenCalled();
    });

    it('returns not found when the thread does not belong to the org', async () => {
      const { service } = makeService({
        thread: { findFirst: vi.fn().mockResolvedValue(null) } as never,
      });
      const result = await service.deleteThread('t1', 'org-1');
      expect(result).toEqual({
        success: false,
        errorMessage: 'Thread not found',
      });
    });

    it('deletes messages, thread documents, and the thread, then tracks audit', async () => {
      const { service, prisma, auditLog } = makeService({
        thread: {
          findFirst: vi.fn().mockResolvedValue({ id: 't1', title: 'Hi' }),
          delete: vi.fn().mockResolvedValue({}),
        } as never,
      });

      const result = await service.deleteThread('t1', 'org-1');

      expect(result).toEqual({ success: true });
      expect(prisma.client.message.deleteMany).toHaveBeenCalledWith({
        where: { threadId: 't1' },
      });
      expect(prisma.client.threadDocument.deleteMany).toHaveBeenCalledWith({
        where: { threadId: 't1' },
      });
      expect(auditLog.track).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'thread.deleted' }),
      );
    });
  });

  describe('toggleThreadStarred', () => {
    it('updates isStarred when the thread is found', async () => {
      const { service } = makeService({
        thread: {
          findFirst: vi.fn().mockResolvedValue({ id: 't1' }),
          update: vi.fn().mockResolvedValue({ id: 't1', isStarred: true }),
        } as never,
      });

      const result = await service.toggleThreadStarred('t1', true, 'org-1');
      expect(result).toEqual({ success: true, id: 't1', isStarred: true });
    });
  });

  describe('updateThreadContext', () => {
    it('rejects when the mentioned project does not belong to the org', async () => {
      const { service } = makeService({
        thread: {
          findFirst: vi.fn().mockResolvedValue({ id: 't1' }),
        } as never,
        project: { findFirst: vi.fn().mockResolvedValue(null) } as never,
      });

      const result = await service.updateThreadContext('t1', 'proj-x', 'org-1');
      expect(result).toEqual({
        success: false,
        errorMessage: 'Project not found or access denied',
      });
    });
  });

  describe('findOrCreateThread', () => {
    it('throws when the thread belongs to a different visitor', async () => {
      const { service } = makeService({
        thread: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: 't1', visitorId: 'other-visitor' }),
        } as never,
      });

      await expect(
        service.findOrCreateThread('t1', 'visitor-1'),
      ).rejects.toThrow('Cannot fetch thread t1');
    });

    it('binds the thread to the visitor when unowned', async () => {
      const { service, prisma } = makeService({
        thread: {
          findFirst: vi.fn().mockResolvedValue({ id: 't1', visitorId: null }),
          update: vi.fn().mockResolvedValue({}),
        } as never,
      });

      const { threadRecord } = await service.findOrCreateThread(
        't1',
        'visitor-1',
      );
      expect(threadRecord.id).toBe('t1');
      expect(prisma.client.thread.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { visitorId: 'visitor-1' },
      });
    });
  });

  describe('sendMessage', () => {
    it('rejects an invalid payload before touching the db', async () => {
      const { service, prisma } = makeService();
      const result = await service.sendMessage('t1', { prompt: 'a' }, 'v1');
      expect(result).toEqual({ error: 'Bad structure', status: 400 });
      expect(prisma.client.thread.findFirst).not.toHaveBeenCalled();
    });

    it('finds/creates the thread then stores the message', async () => {
      const { service, prisma, messages } = makeService({
        thread: {
          findFirst: vi.fn().mockResolvedValue({ id: 't1', visitorId: 'v1' }),
          update: vi.fn().mockResolvedValue({}),
        } as never,
      });
      (messages.createAndStoreMessage as Mock).mockResolvedValue({
        id: 'm1',
      });

      const result = await service.sendMessage(
        't1',
        { prompt: 'hello world' },
        'v1',
      );

      expect(prisma.client.thread.findFirst).toHaveBeenCalled();
      expect(messages.createAndStoreMessage).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'hello world', threadId: 't1' }),
      );
      expect(result).toEqual({ message: { id: 'm1' }, status: 201 });
    });
  });

  describe('getUserThreads', () => {
    it('throws when the org has no default project', async () => {
      const { service, projects } = makeService();
      (projects.getDefaultProjectId as Mock).mockResolvedValue(null);

      await expect(service.getUserThreads('v1', 'org-1')).rejects.toThrow(
        'Default project ID does not exist!',
      );
    });
  });

  /**
   * A Brain assistant conversation is a `Thread` of kind `BRAIN_OPERATOR`
   * (spec 2026-09-25-brain-operator-assistant). Every list the chat reads
   * filters it out, or the sidebar would show conversations the chat cannot
   * open.
   */
  describe('the chat lists read chat threads only', () => {
    it('getSidebarThreads, getAllThreads, searchAll, searchThreads and getUserThreads filter to CHAT', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const { service, prisma, projects } = makeService({
        thread: { findMany, count: vi.fn().mockResolvedValue(0) },
        project: { findMany: vi.fn().mockResolvedValue([]) },
      });
      (projects.getDefaultProjectId as Mock).mockResolvedValue('p-default');

      await service.getSidebarThreads('v1', 'org-1');
      await service.getAllThreads('v1', 'org-1');
      await service.searchAll('v1', 'org-1', 'leave');
      await service.searchThreads('v1', 'org-1', 'leave');
      await service.getUserThreads('v1', 'org-1');
      await service.getSharedThreads('v1', 'org-1');

      type Where = { kind?: string; thread?: { kind?: string } };
      const calls = findMany.mock.calls as [{ where: Where }][];
      const wheres = calls.map(([args]) => args.where);
      expect(wheres.length).toBeGreaterThanOrEqual(6);
      for (const where of wheres) {
        expect(where.kind).toBe('CHAT');
      }
      const sharedCalls = (prisma.client.threadShare.findMany as Mock).mock
        .calls as [{ where: Where }][];
      expect(sharedCalls[0][0].where.thread?.kind).toBe('CHAT');
    });
  });

  describe('searchAll', () => {
    it('returns an empty array for short queries', async () => {
      const { service, prisma } = makeService();
      const result = await service.searchAll('v1', 'org-1', 'a');
      expect(result).toEqual([]);
      expect(prisma.client.thread.findMany).not.toHaveBeenCalled();
    });
  });
});
