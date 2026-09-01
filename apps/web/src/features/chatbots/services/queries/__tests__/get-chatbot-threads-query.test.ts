import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindMany, mockCount, mockDecrypt, mockLoggerError } = vi.hoisted(
  () => ({
    mockFindMany: vi.fn(),
    mockCount: vi.fn(),
    mockDecrypt: vi.fn(),
    mockLoggerError: vi.fn(),
  }),
);

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    thread: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
  },
}));

vi.mock('@/libs/crypto/decrypt-messages', () => ({
  decryptMessageContents: (...args: unknown[]) => mockDecrypt(...args),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: mockLoggerError,
    debug: vi.fn(),
  },
}));

import { getChatbotThreadsQuery } from '../get-chatbot-threads-query';

const makeThread = (
  overrides: Partial<{
    id: string;
    visitorId: string | null;
    createdAt: Date;
    title: string | null;
    encryptedDek: string | null;
    messages: { content: string; role: string }[];
    _count: { messages: number };
  }> = {},
) => ({
  id: 'thread-1',
  visitorId: 'visitor-1',
  createdAt: new Date('2026-05-01T10:00:00Z'),
  title: 'Test thread',
  encryptedDek: null as string | null,
  messages: [{ content: 'hello', role: 'USER' }],
  _count: { messages: 1 },
  ...overrides,
});

describe('getChatbotThreadsQuery', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockCount.mockReset();
    mockDecrypt.mockReset();
    mockLoggerError.mockReset();
    mockCount.mockResolvedValue(1);
  });

  it('returns decrypted preview message when encryptedDek is present', async () => {
    const thread = makeThread({
      encryptedDek: 'encrypted-key',
      messages: [{ content: 'Fctap7zKjl/xtEQI==', role: 'USER' }],
    });
    mockFindMany.mockResolvedValue([thread]);
    mockDecrypt.mockResolvedValue([{ content: 'hello world', role: 'USER' }]);

    const result = await getChatbotThreadsQuery('chatbot-1', 'org-1');

    expect(result.threads).toHaveLength(1);
    expect(result.threads[0].messages[0].content).toBe('hello world');
    expect(mockDecrypt).toHaveBeenCalledWith(
      [{ content: 'Fctap7zKjl/xtEQI==', role: 'USER' }],
      'encrypted-key',
    );
  });

  it('falls back to raw content and logs error when decryption throws', async () => {
    const thread = makeThread({
      id: 'thread-err',
      encryptedDek: 'bad-dek',
      messages: [{ content: 'Fctap7zKjl/xtEQI==', role: 'USER' }],
    });
    mockFindMany.mockResolvedValue([thread]);
    mockDecrypt.mockRejectedValue(new Error('KMS unavailable'));

    const result = await getChatbotThreadsQuery('chatbot-1', 'org-1');

    expect(result.threads[0].messages[0].content).toBe('Fctap7zKjl/xtEQI==');
    expect(mockLoggerError).toHaveBeenCalledOnce();
    const logArgs = mockLoggerError.mock.calls[0];
    expect(logArgs[0]).toMatchObject({ threadId: 'thread-err' });
    expect(logArgs[1]).toBe('Failed to decrypt chatbot thread preview message');
  });

  it('does not call decryptMessageContents when encryptedDek is null', async () => {
    const thread = makeThread({
      encryptedDek: null,
      messages: [{ content: 'plain text', role: 'USER' }],
    });
    mockFindMany.mockResolvedValue([thread]);

    const result = await getChatbotThreadsQuery('chatbot-1', 'org-1');

    expect(result.threads[0].messages[0].content).toBe('plain text');
    expect(mockDecrypt).not.toHaveBeenCalled();
  });

  it('does not call decryptMessageContents when messages array is empty', async () => {
    const thread = makeThread({
      encryptedDek: 'some-dek',
      messages: [],
    });
    mockFindMany.mockResolvedValue([thread]);

    const result = await getChatbotThreadsQuery('chatbot-1', 'org-1');

    expect(result.threads[0].messages).toHaveLength(0);
    expect(mockDecrypt).not.toHaveBeenCalled();
  });

  it('does not expose encryptedDek in the returned thread shape', async () => {
    const thread = makeThread({ encryptedDek: 'secret-dek' });
    mockFindMany.mockResolvedValue([thread]);
    mockDecrypt.mockResolvedValue([{ content: 'hi', role: 'USER' }]);

    const result = await getChatbotThreadsQuery('chatbot-1', 'org-1');

    expect(result.threads[0]).not.toHaveProperty('encryptedDek');
  });

  it('returns createdAt as ISO string', async () => {
    const thread = makeThread({ createdAt: new Date('2026-05-01T10:00:00Z') });
    mockFindMany.mockResolvedValue([thread]);

    const result = await getChatbotThreadsQuery('chatbot-1', 'org-1');

    expect(result.threads[0].createdAt).toBe('2026-05-01T10:00:00.000Z');
  });

  it('returns hasMore=true when DB returns more than take results', async () => {
    const threads = Array.from({ length: 21 }, (_, i) =>
      makeThread({ id: `thread-${i}`, visitorId: `visitor-${i}` }),
    );
    mockFindMany.mockResolvedValue(threads);
    mockCount.mockResolvedValue(21);

    const result = await getChatbotThreadsQuery('chatbot-1', 'org-1', 0, 20);

    expect(result.hasMore).toBe(true);
    expect(result.threads).toHaveLength(20);
  });

  it('returns hasMore=false when DB returns equal or fewer than take results', async () => {
    const threads = [makeThread()];
    mockFindMany.mockResolvedValue(threads);
    mockCount.mockResolvedValue(1);

    const result = await getChatbotThreadsQuery('chatbot-1', 'org-1', 0, 20);

    expect(result.hasMore).toBe(false);
    expect(result.threads).toHaveLength(1);
  });

  it('decrypts multiple threads in parallel', async () => {
    const thread1 = makeThread({
      id: 't1',
      encryptedDek: 'dek-1',
      messages: [{ content: 'enc-1', role: 'USER' }],
    });
    const thread2 = makeThread({
      id: 't2',
      encryptedDek: 'dek-2',
      messages: [{ content: 'enc-2', role: 'USER' }],
    });
    mockFindMany.mockResolvedValue([thread1, thread2]);
    mockCount.mockResolvedValue(2);
    mockDecrypt
      .mockResolvedValueOnce([{ content: 'decrypted-1', role: 'USER' }])
      .mockResolvedValueOnce([{ content: 'decrypted-2', role: 'USER' }]);

    const result = await getChatbotThreadsQuery('chatbot-1', 'org-1');

    expect(result.threads).toHaveLength(2);
    expect(mockDecrypt).toHaveBeenCalledTimes(2);
    expect(result.threads.find((t) => t.id === 't1')?.messages[0].content).toBe(
      'decrypted-1',
    );
    expect(result.threads.find((t) => t.id === 't2')?.messages[0].content).toBe(
      'decrypted-2',
    );
  });
});
