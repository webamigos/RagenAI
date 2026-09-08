import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockDecrypt = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    thread: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
  },
}));

vi.mock('@ragenai/crypto', async (importOriginal) => ({
  // Partial: the package exports the whole envelope, and replacing all of it
  // would stub functions this module never calls. Only what the test steers
  // is overridden.
  ...(await importOriginal<typeof import('@ragenai/crypto')>()),
  decryptMessageContents: (...args: unknown[]) => mockDecrypt(...args),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getChatbotThreadMessagesQuery } from '../get-chatbot-thread-messages-query';

const baseThread = {
  id: 'thread-1',
  visitorId: 'session-1',
  createdAt: new Date('2026-04-15T00:00:00Z'),
  encryptedDek: null as string | null,
  messages: [
    {
      id: 'msg-1',
      createdAt: new Date('2026-04-15T00:00:01Z'),
      content: 'hello',
      role: 'USER',
    },
  ],
};

describe('getChatbotThreadMessagesQuery', () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockDecrypt.mockReset();
  });

  it('returns null when the thread is not found', async () => {
    mockFindFirst.mockResolvedValue(null);
    expect(await getChatbotThreadMessagesQuery('none', 'org-1')).toBeNull();
  });

  it('returns messages with decryptionFailed=false when decryption succeeds', async () => {
    mockFindFirst.mockResolvedValue({
      ...baseThread,
      encryptedDek: 'encrypted-key',
    });
    mockDecrypt.mockResolvedValue(baseThread.messages);

    const result = await getChatbotThreadMessagesQuery('thread-1', 'org-1');

    expect(result).not.toBeNull();
    expect(result?.decryptionFailed).toBe(false);
    expect(result?.messages).toHaveLength(1);
    expect(result?.messages[0].content).toBe('hello');
  });

  it('returns decryptionFailed=true with empty messages when decryption throws', async () => {
    mockFindFirst.mockResolvedValue({
      ...baseThread,
      encryptedDek: 'encrypted-key',
    });
    mockDecrypt.mockRejectedValue(new Error('KMS unavailable'));

    const result = await getChatbotThreadMessagesQuery('thread-1', 'org-1');

    expect(result).not.toBeNull();
    expect(result?.decryptionFailed).toBe(true);
    expect(result?.messages).toEqual([]);
    expect(result?.thread.id).toBe('thread-1');
  });

  it('scopes the query to the provided organization', async () => {
    mockFindFirst.mockResolvedValue(null);
    await getChatbotThreadMessagesQuery('thread-1', 'org-1');

    const whereArg = mockFindFirst.mock.calls[0][0].where;
    expect(whereArg).toMatchObject({
      id: 'thread-1',
      organizationId: 'org-1',
      chatbotId: { not: null },
    });
  });

  it('converts Date fields to ISO strings in the response', async () => {
    mockFindFirst.mockResolvedValue(baseThread);
    mockDecrypt.mockResolvedValue(baseThread.messages);

    const result = await getChatbotThreadMessagesQuery('thread-1', 'org-1');

    expect(result?.thread.createdAt).toBe('2026-04-15T00:00:00.000Z');
    expect(result?.messages[0].createdAt).toBe('2026-04-15T00:00:01.000Z');
  });
});
