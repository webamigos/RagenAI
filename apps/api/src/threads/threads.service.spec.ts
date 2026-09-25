/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import type { Mock } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ThreadsService } from './threads.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';
import { type ApiContext } from '../common/types/api-context.js';
import { AssistantScopeService } from '../common/services/assistant-scope.service.js';
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

  function makeService(
    overrides: Partial<Record<string, Mock>> = {},
    project: unknown = { id: 'proj-bound' },
  ) {
    const threadOps = {
      findMany: vi.fn().mockResolvedValue([thread]),
      findFirst: vi.fn().mockResolvedValue(thread),
      create: vi.fn().mockResolvedValue(thread),
      update: vi.fn().mockResolvedValue(thread),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...overrides,
    };
    const messageOps = {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    const projectOps = {
      findFirst: vi.fn().mockResolvedValue(project),
    };
    // $transaction passes through — it's used in remove() to wrap
    // message + thread deleteMany in one batch. The mock just awaits
    // the array so assertions on the underlying jest fns still work.
    const prisma = {
      client: {
        thread: threadOps,
        message: messageOps,
        project: projectOps,
        $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      },
    } as unknown as PrismaService;
    return {
      service: new ThreadsService(prisma, new AssistantScopeService(prisma)),
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
    // A Brain assistant conversation is a thread too, and never the API's.
    expect(call.where).toEqual({ organizationId: 'org-1', kind: 'CHAT' });
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
    const { service: svc, threadOps } = makeService({}, null);
    // 403, not the 400 this endpoint used to answer: under a key scope the
    // question is "may you ask this", and a 404/400 split would say whether
    // the id exists.
    await expect(
      svc.create({ assistant_id: 'asst-other-org' }, context),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(threadOps.create).not.toHaveBeenCalled();
  });

  // With a scoped key the precedence inverts: the key decides, and
  // `assistant_id` is a field that has to agree with it.
  it('create: a key bound to an assistant refuses a thread for another', async () => {
    const { service, threadOps } = makeService();
    const scopedKey: ApiContext = {
      ...context,
      knowledgeScope: 'ASSISTANT',
      projectId: 'proj-bound' as ProjectId,
    };

    await expect(
      service.create({ assistant_id: 'asst-proj-other' }, scopedKey),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(threadOps.create).not.toHaveBeenCalled();
  });

  it('create: a knowledge-base key opens a thread with no project', async () => {
    const { service, threadOps } = makeService();
    const kbKey: ApiContext = {
      orgId: context.orgId,
      userId: context.userId,
      keyId: context.keyId,
      debugMode: false,
      knowledgeScope: 'KNOWLEDGE_BASE',
    };

    await service.create({}, kbKey);

    expect(threadOps.create.mock.calls[0][0].data.projectId).toBe(null);
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
      findFirst: vi.fn().mockResolvedValue(null),
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
