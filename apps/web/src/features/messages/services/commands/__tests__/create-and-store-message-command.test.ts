import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  messageCreate: vi.fn(),
  threadUpdateMany: vi.fn(),
}));

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    message: { create: (...a: unknown[]) => m.messageCreate(...a) },
    thread: { updateMany: (...a: unknown[]) => m.threadUpdateMany(...a) },
  },
}));
vi.mock('../../thread-content-encryption', () => ({
  maybeEncryptContent: async (_threadId: string, content: string) => content,
}));
vi.mock('@/app/lib/services/visitor', () => ({ createVisitorEntry: vi.fn() }));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { isTenantScopeSatisfied } from '@ragenai/platform-contracts';
import { createAndStoreMessageCommand } from '../create-message-command';

beforeEach(() => {
  vi.clearAllMocks();
  m.messageCreate.mockResolvedValue({
    id: 'm-1',
    role: 'USER',
    createdAt: new Date('2026-10-03T10:00:00Z'),
    content: 'What is the notice period?',
    attachments: null,
  });
  m.threadUpdateMany.mockResolvedValue({ count: 1 });
});

describe('createAndStoreMessageCommand — the thread title', () => {
  it('sets an untitled thread’s title inside the caller’s organization', async () => {
    await createAndStoreMessageCommand({
      prompt: '  What is the notice period?  ',
      threadId: 'thread-1',
      organizationId: 'org-1',
    });

    const args = m.threadUpdateMany.mock.calls[0][0];
    expect(args.where).toEqual({
      id: 'thread-1',
      organizationId: 'org-1',
      title: null,
    });
    expect(args.data).toEqual({ title: 'What is the notice period?' });
    expect(isTenantScopeSatisfied('Thread', 'updateMany', args)).toBe(true);
  });
});
