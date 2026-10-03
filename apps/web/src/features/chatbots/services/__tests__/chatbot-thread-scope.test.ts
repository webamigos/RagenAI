import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findFirstOrThrow: vi.fn(),
  create: vi.fn(),
  messages: vi.fn(),
}));

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    thread: {
      findFirst: (...a: unknown[]) => m.findFirst(...a),
      findFirstOrThrow: (...a: unknown[]) => m.findFirstOrThrow(...a),
      create: (...a: unknown[]) => m.create(...a),
    },
    message: { findMany: (...a: unknown[]) => m.messages(...a) },
  },
}));
vi.mock('@ragenai/crypto', () => ({
  decryptMessageContents: vi.fn(async (rows: unknown[]) => rows),
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { isTenantScopeSatisfied } from '@ragenai/platform-contracts';
import { getOrCreateChatbotThreadCommand } from '../commands/get-or-create-chatbot-thread-command';
import { getChatbotThreadHistoryQuery } from '../queries/get-chatbot-thread-history-query';

/**
 * The embed widget resolves its chatbot, and with it the organization, from
 * the token before any of these run. Each lookup repeats that organization so
 * the read is scoped in the query, not only by the chatbot id it happens to
 * carry — and so the tenant-scope guard sees it.
 */
beforeEach(() => {
  vi.clearAllMocks();
  m.messages.mockResolvedValue([]);
});

describe('getOrCreateChatbotThreadCommand', () => {
  it('looks the visitor’s thread up inside the chatbot’s organization', async () => {
    m.findFirst.mockResolvedValue({ id: 'thread-1' });

    await getOrCreateChatbotThreadCommand('bot-1', 'org-1', 'session-1');

    const args = m.findFirst.mock.calls[0][0];
    expect(args.where).toEqual({
      chatbotId: 'bot-1',
      organizationId: 'org-1',
      visitorId: 'session-1',
    });
    expect(isTenantScopeSatisfied('Thread', 'findFirst', args)).toBe(true);
    expect(m.create).not.toHaveBeenCalled();
  });
});

describe('getChatbotThreadHistoryQuery', () => {
  it('reads the thread’s key inside the organization', async () => {
    m.findFirst.mockResolvedValue({ encryptedDek: null });

    await getChatbotThreadHistoryQuery('thread-1', 'org-1', 10);

    const args = m.findFirst.mock.calls[0][0];
    expect(args.where).toEqual({ id: 'thread-1', organizationId: 'org-1' });
    expect(isTenantScopeSatisfied('Thread', 'findFirst', args)).toBe(true);
  });
});
