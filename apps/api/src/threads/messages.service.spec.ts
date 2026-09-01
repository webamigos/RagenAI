/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';
import { type ApiContext } from '../common/types/api-context.js';
import {
  type OrgId,
  type UserId,
  type ProjectId,
  type KeyId,
} from '../common/types/brand.js';

describe('MessagesService', () => {
  const context: ApiContext = {
    orgId: 'org-1' as OrgId,
    userId: 'user-1' as UserId,
    projectId: 'proj-1' as ProjectId,
    keyId: 'key-1' as KeyId,
    debugMode: false,
  };

  const message = {
    id: 'm-1',
    threadId: 't-1',
    role: 'USER',
    content: 'Hi',
    createdAt: new Date('2026-01-01Z'),
  };

  function makeService(
    opts: {
      threadFound?: boolean;
      isEncrypted?: boolean;
      messages?: Array<Record<string, unknown>>;
    } = {},
  ) {
    const threadRow =
      opts.threadFound === false
        ? null
        : { id: 't-1', encryptedDek: opts.isEncrypted ? 'abc' : null };

    const threadOps = {
      findFirst: jest.fn().mockResolvedValue(threadRow),
    };
    const messageOps = {
      findMany: jest.fn().mockResolvedValue(opts.messages ?? [message]),
      findFirst: jest.fn().mockResolvedValue(message),
      create: jest.fn().mockResolvedValue(message),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const prisma = {
      client: { thread: threadOps, message: messageOps },
    } as unknown as PrismaService;
    return { service: new MessagesService(prisma), threadOps, messageOps };
  }

  it('list: returns OpenAI envelope with msg- prefixed ids', async () => {
    const { service, messageOps } = makeService();
    const out = await service.list('thread-t-1', context, {});
    expect(out.object).toBe('list');
    expect(out.data[0].id).toBe('msg-m-1');
    expect(messageOps.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { threadId: 't-1' } }),
    );
  });

  it('list: returns placeholder content when thread is encrypted', async () => {
    const { service } = makeService({ isEncrypted: true });
    const out = await service.list('thread-t-1', context, {});
    expect(out.data[0].content[0].text.value).toContain('encrypted');
  });

  it('list: 404 when thread not found', async () => {
    const { service } = makeService({ threadFound: false });
    await expect(
      service.list('thread-missing', context, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('get: strips msg- prefix', async () => {
    const { service, messageOps } = makeService();
    await service.get('thread-t-1', 'msg-m-1', context);
    expect(messageOps.findFirst).toHaveBeenCalledWith({
      where: { id: 'm-1', threadId: 't-1' },
    });
  });

  it('get: 404 when message missing', async () => {
    const { service: svc } = makeService();
    (svc as any).prisma.client.message.findFirst = jest
      .fn()
      .mockResolvedValue(null);
    await expect(
      svc.get('thread-t-1', 'msg-missing', context),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create: persists with API source + upper-cased role', async () => {
    const { service, messageOps } = makeService();
    await service.create(
      'thread-t-1',
      { role: 'assistant', content: 'Reply' },
      context,
    );
    const call = messageOps.create.mock.calls[0][0];
    expect(call.data).toEqual({
      threadId: 't-1',
      role: 'ASSISTANT',
      content: 'Reply',
      source: 'API',
    });
  });

  it('remove: deleted envelope', async () => {
    const { service } = makeService();
    const out = await service.remove('thread-t-1', 'msg-m-1', context);
    expect(out).toEqual({
      id: 'msg-m-1',
      object: 'thread.message.deleted',
      deleted: true,
    });
  });

  it('remove: 404 when message missing', async () => {
    const { service: svc } = makeService();
    (svc as any).prisma.client.message.deleteMany = jest
      .fn()
      .mockResolvedValue({ count: 0 });
    await expect(
      svc.remove('thread-t-1', 'msg-ghost', context),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
