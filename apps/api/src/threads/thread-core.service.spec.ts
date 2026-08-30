/* eslint-disable @typescript-eslint/unbound-method */
import { ThreadsCoreService } from './thread-core.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { MessagesService } from '../messages/messages.service.js';

jest.mock('../crypto/decrypt-messages.js', () => ({
  decryptMessageContents: jest.fn((messages: unknown) =>
    Promise.resolve(messages),
  ),
}));

describe('ThreadsCoreService', () => {
  function makeService(
    overrides: {
      thread?: Partial<Record<string, jest.Mock>>;
      userFile?: Partial<Record<string, jest.Mock>>;
      threadDocument?: Partial<Record<string, jest.Mock>>;
      threadShare?: Partial<Record<string, jest.Mock>>;
      project?: Partial<Record<string, jest.Mock>>;
    } = {},
  ) {
    const prisma = {
      client: {
        thread: {
          create: jest.fn(),
          findFirst: jest.fn(),
          findFirstOrThrow: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
          count: jest.fn(),
          findMany: jest.fn(),
          ...overrides.thread,
        },
        userFile: {
          findMany: jest.fn().mockResolvedValue([]),
          ...overrides.userFile,
        },
        threadDocument: {
          createMany: jest.fn(),
          deleteMany: jest.fn(),
          ...overrides.threadDocument,
        },
        threadShare: {
          findMany: jest.fn().mockResolvedValue([]),
          ...overrides.threadShare,
        },
        message: { deleteMany: jest.fn() },
        project: { findFirst: jest.fn(), ...overrides.project },
      },
    } as unknown as PrismaService;

    const auditLog = { track: jest.fn() } as unknown as AuditLogService;
    const projects = {
      getDefaultProjectId: jest.fn(),
    } as unknown as ProjectsService;
    const messages = {
      createAndStoreMessage: jest.fn(),
    } as unknown as MessagesService;

    return {
      service: new ThreadsCoreService(prisma, auditLog, projects, messages),
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
          create: jest.fn().mockResolvedValue({ id: 't1' }),
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

  describe('deleteThread', () => {
    it('returns not found when the thread does not belong to the org', async () => {
      const { service } = makeService({
        thread: { findFirst: jest.fn().mockResolvedValue(null) } as never,
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
          findFirst: jest.fn().mockResolvedValue({ id: 't1', title: 'Hi' }),
          delete: jest.fn().mockResolvedValue({}),
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
          findFirst: jest.fn().mockResolvedValue({ id: 't1' }),
          update: jest.fn().mockResolvedValue({ id: 't1', isStarred: true }),
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
          findFirst: jest.fn().mockResolvedValue({ id: 't1' }),
        } as never,
        project: { findFirst: jest.fn().mockResolvedValue(null) } as never,
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
          findFirst: jest
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
          findFirst: jest.fn().mockResolvedValue({ id: 't1', visitorId: null }),
          update: jest.fn().mockResolvedValue({}),
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
          findFirst: jest.fn().mockResolvedValue({ id: 't1', visitorId: 'v1' }),
          update: jest.fn().mockResolvedValue({}),
        } as never,
      });
      (messages.createAndStoreMessage as jest.Mock).mockResolvedValue({
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
      (projects.getDefaultProjectId as jest.Mock).mockResolvedValue(null);

      await expect(service.getUserThreads('v1', 'org-1')).rejects.toThrow(
        'Default project ID does not exist!',
      );
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
