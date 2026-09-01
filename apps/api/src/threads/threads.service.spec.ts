/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ThreadsService } from './threads.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';
import { type ApiContext } from '../common/types/api-context.js';
import {
  type OrgId,
  type UserId,
  type ProjectId,
  type KeyId,
} from '../common/types/brand.js';

describe('ThreadsService', () => {
  const context: ApiContext = {
    orgId: 'org-1' as OrgId,
    userId: 'user-1' as UserId,
    projectId: 'proj-bound' as ProjectId,
    keyId: 'key-1' as KeyId,
    debugMode: false,
  };

  const thread = {
    id: 't-1',
    title: 'Hello',
    createdAt: new Date('2026-01-01Z'),
    projectId: 'proj-bound',
  };

  function makeService(overrides: Partial<Record<string, jest.Mock>> = {}) {
    const threadOps = {
      findMany: jest.fn().mockResolvedValue([thread]),
      findFirst: jest.fn().mockResolvedValue(thread),
      create: jest.fn().mockResolvedValue(thread),
      update: jest.fn().mockResolvedValue(thread),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      ...overrides,
    };
    const messageOps = {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const projectOps = {
      findFirst: jest.fn().mockResolvedValue({ id: 'proj-bound' }),
    };
    // $transaction passes through — it's used in remove() to wrap
    // message + thread deleteMany in one batch. The mock just awaits
    // the array so assertions on the underlying jest fns still work.
    const prisma = {
      client: {
        thread: threadOps,
        message: messageOps,
        project: projectOps,
        $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      },
    } as unknown as PrismaService;
    return {
      service: new ThreadsService(prisma),
      threadOps,
      messageOps,
      projectOps,
    };
  }

  it('list: scopes by org, paginates, orders', async () => {
    const { service, threadOps } = makeService();
    await service.list(context, {
      limit: 5,
      order: 'asc',
      after: 'thread-abc',
    });
    const call = threadOps.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ organizationId: 'org-1' });
    expect(call.take).toBe(5);
    expect(call.orderBy).toEqual({ createdAt: 'asc' });
    expect(call.cursor).toEqual({ id: 'abc' });
    expect(call.skip).toBe(1);
  });

  it('create: uses API-key project by default', async () => {
    const { service, threadOps } = makeService();
    await service.create({}, context);
    const call = threadOps.create.mock.calls[0][0];
    expect(call.data).toMatchObject({
      projectId: 'proj-bound',
      organizationId: 'org-1',
      userId: 'user-1',
      source: 'API',
    });
  });

  it('create: resolves assistant_id to project', async () => {
    const { service, threadOps, projectOps } = makeService();
    await service.create({ assistant_id: 'asst-proj-other' }, context);
    const call = threadOps.create.mock.calls[0][0];
    expect(projectOps.findFirst.mock.calls[0][0].where).toEqual({
      id: 'proj-other',
      organizationId: 'org-1',
    });
    expect(call.data.projectId).toBe('proj-bound'); // mock returns proj-bound
  });

  it('create: rejects assistant_id not in org', async () => {
    const { service: svc } = makeService();
    // Repoint the project lookup to null
    (svc as any).prisma = {
      client: {
        thread: { create: jest.fn() },
        project: { findFirst: jest.fn().mockResolvedValue(null) },
      },
    };
    await expect(
      svc.create({ assistant_id: 'asst-other-org' }, context),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create: nested-writes seed messages', async () => {
    const { service, threadOps } = makeService();
    await service.create(
      {
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
        ],
      },
      context,
    );
    const data = threadOps.create.mock.calls[0][0].data;
    expect(data.messages.create).toHaveLength(2);
    expect(data.messages.create[0]).toMatchObject({
      role: 'USER',
      content: 'hi',
    });
    expect(data.messages.create[1]).toMatchObject({
      role: 'ASSISTANT',
      content: 'hello',
    });
  });

  it('get: 404 when not found', async () => {
    const { service } = makeService({
      findFirst: jest.fn().mockResolvedValue(null),
    });
    await expect(service.get('thread-x', context)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('update: sets title only when provided', async () => {
    const { service, threadOps } = makeService();
    await service.update('thread-t-1', { title: 'Renamed' }, context);
    const call = threadOps.update.mock.calls[0][0];
    expect(call.data).toEqual({ title: 'Renamed' });
  });

  it('delete: wipes messages and thread in one transaction', async () => {
    const { service, threadOps, messageOps } = makeService();
    const result = await service.remove('thread-t-1', context);
    expect(messageOps.deleteMany).toHaveBeenCalledWith({
      where: { threadId: 't-1' },
    });
    expect(threadOps.deleteMany).toHaveBeenCalled();
    expect(result).toEqual({
      id: 'thread-t-1',
      object: 'thread.deleted',
      deleted: true,
    });
  });
});
