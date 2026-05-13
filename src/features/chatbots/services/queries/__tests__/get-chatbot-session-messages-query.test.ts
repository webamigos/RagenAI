import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindFirst, mockFindMany, mockDecrypt, mockLoggerError } =
  vi.hoisted(() => ({
    mockFindFirst: vi.fn(),
    mockFindMany: vi.fn(),
    mockDecrypt: vi.fn(),
    mockLoggerError: vi.fn(),
  }));

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    thread: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
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

import {
  getChatbotSessionMessagesQuery,
  getChatbotSessionListQuery,
} from '../get-chatbot-session-messages-query';

// ---------------------------------------------------------------------------
// getChatbotSessionMessagesQuery
// ---------------------------------------------------------------------------

const baseMessages = [
  {
    id: 'msg-1',
    createdAt: new Date('2026-04-15T00:00:01Z'),
    role: 'USER',
    content: 'hello',
  },
  {
    id: 'msg-2',
    createdAt: new Date('2026-04-15T00:00:02Z'),
    role: 'ASSISTANT',
    content: 'hi there',
  },
];

const baseThread = {
  id: 'thread-1',
  encryptedDek: null as string | null,
  messages: [...baseMessages],
};

describe('getChatbotSessionMessagesQuery', () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockDecrypt.mockReset();
    mockLoggerError.mockReset();
  });

  it('returns empty array when thread is not found', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await getChatbotSessionMessagesQuery(
      'chatbot-1',
      'session-1',
    );

    expect(result).toEqual([]);
  });

  it('returns role+content only when decryption succeeds', async () => {
    mockFindFirst.mockResolvedValue({
      ...baseThread,
      encryptedDek: 'encrypted-key',
    });
    mockDecrypt.mockResolvedValue(baseMessages);

    const result = await getChatbotSessionMessagesQuery(
      'chatbot-1',
      'session-1',
    );

    expect(result).toEqual([
      { role: 'USER', content: 'hello' },
      { role: 'ASSISTANT', content: 'hi there' },
    ]);
  });

  it('returns messages in ascending order (oldest first)', async () => {
    // DB returns desc order; the query reverses before decrypting
    const descMessages = [
      {
        id: 'msg-2',
        createdAt: new Date('2026-04-15T00:00:02Z'),
        role: 'ASSISTANT',
        content: 'hi there',
      },
      {
        id: 'msg-1',
        createdAt: new Date('2026-04-15T00:00:01Z'),
        role: 'USER',
        content: 'hello',
      },
    ];
    const thread = { ...baseThread, messages: descMessages };
    mockFindFirst.mockResolvedValue(thread);
    mockDecrypt.mockImplementation((msgs: unknown[]) => Promise.resolve(msgs));

    const result = await getChatbotSessionMessagesQuery(
      'chatbot-1',
      'session-1',
    );

    expect(result[0].role).toBe('USER');
    expect(result[1].role).toBe('ASSISTANT');
  });

  it('returns raw messages as fallback and logs error when decryption throws', async () => {
    mockFindFirst.mockResolvedValue({
      ...baseThread,
      encryptedDek: 'encrypted-key',
    });
    mockDecrypt.mockRejectedValue(new Error('KMS unavailable'));

    const result = await getChatbotSessionMessagesQuery(
      'chatbot-1',
      'session-1',
    );

    expect(result).toHaveLength(baseMessages.length);
    expect(mockLoggerError).toHaveBeenCalledOnce();
    const logArgs = mockLoggerError.mock.calls[0];
    expect(logArgs[0]).toMatchObject({ threadId: 'thread-1' });
  });

  it('passes encryptedDek to decryptMessageContents', async () => {
    const dek = 'my-encrypted-dek';
    mockFindFirst.mockResolvedValue({ ...baseThread, encryptedDek: dek });
    mockDecrypt.mockResolvedValue(baseMessages);

    await getChatbotSessionMessagesQuery('chatbot-1', 'session-1');

    expect(mockDecrypt).toHaveBeenCalledWith(expect.any(Array), dek);
  });

  it('scopes the DB query to chatbotId and visitorId', async () => {
    mockFindFirst.mockResolvedValue(null);

    await getChatbotSessionMessagesQuery('chatbot-1', 'session-abc');

    const whereArg = mockFindFirst.mock.calls[0][0].where;
    expect(whereArg).toMatchObject({
      chatbotId: 'chatbot-1',
      visitorId: 'session-abc',
    });
  });
});

// ---------------------------------------------------------------------------
// getChatbotSessionListQuery
// ---------------------------------------------------------------------------

describe('getChatbotSessionListQuery', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockDecrypt.mockReset();
    mockLoggerError.mockReset();
  });

  it('returns empty array when no threads found', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getChatbotSessionListQuery('chatbot-1', ['s1', 's2']);

    expect(result).toEqual([]);
  });

  it('returns decrypted firstMessage when encryption is present', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'thread-1',
        visitorId: 'session-1',
        createdAt: new Date('2026-04-15T00:00:00Z'),
        encryptedDek: 'dek-key',
        messages: [{ content: 'Fctap7zKjl/xtEQI==' }],
      },
    ]);
    mockDecrypt.mockResolvedValue([{ content: 'hello world' }]);

    const result = await getChatbotSessionListQuery('chatbot-1', ['session-1']);

    expect(result).toHaveLength(1);
    expect(result[0].firstMessage).toBe('hello world');
    expect(result[0].sessionId).toBe('session-1');
    expect(result[0].createdAt).toBe('2026-04-15T00:00:00.000Z');
  });

  it('returns plaintext firstMessage when no encryptedDek', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'thread-2',
        visitorId: 'session-2',
        createdAt: new Date('2026-04-15T00:00:00Z'),
        encryptedDek: null,
        messages: [{ content: 'plain text message' }],
      },
    ]);

    const result = await getChatbotSessionListQuery('chatbot-1', ['session-2']);

    expect(result[0].firstMessage).toBe('plain text message');
    expect(mockDecrypt).not.toHaveBeenCalled();
  });

  it('returns null firstMessage when thread has no messages', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'thread-3',
        visitorId: 'session-3',
        createdAt: new Date('2026-04-15T00:00:00Z'),
        encryptedDek: null,
        messages: [],
      },
    ]);

    const result = await getChatbotSessionListQuery('chatbot-1', ['session-3']);

    expect(result[0].firstMessage).toBeNull();
    expect(mockDecrypt).not.toHaveBeenCalled();
  });

  it('falls back to raw content and logs error when decryption throws', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'thread-4',
        visitorId: 'session-4',
        createdAt: new Date('2026-04-15T00:00:00Z'),
        encryptedDek: 'bad-dek',
        messages: [{ content: 'Fctap7zKjl/xtEQI==' }],
      },
    ]);
    mockDecrypt.mockRejectedValue(new Error('KMS error'));

    const result = await getChatbotSessionListQuery('chatbot-1', ['session-4']);

    expect(result[0].firstMessage).toBe('Fctap7zKjl/xtEQI==');
    expect(mockLoggerError).toHaveBeenCalledOnce();
    const logArgs = mockLoggerError.mock.calls[0];
    expect(logArgs[0]).toMatchObject({ threadId: 'thread-4' });
  });

  it('handles multiple sessions in parallel', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'thread-a',
        visitorId: 'session-a',
        createdAt: new Date('2026-04-15T00:00:00Z'),
        encryptedDek: 'dek-a',
        messages: [{ content: 'enc-a' }],
      },
      {
        id: 'thread-b',
        visitorId: 'session-b',
        createdAt: new Date('2026-04-15T00:01:00Z'),
        encryptedDek: 'dek-b',
        messages: [{ content: 'enc-b' }],
      },
    ]);
    mockDecrypt
      .mockResolvedValueOnce([{ content: 'message-a' }])
      .mockResolvedValueOnce([{ content: 'message-b' }]);

    const result = await getChatbotSessionListQuery('chatbot-1', [
      'session-a',
      'session-b',
    ]);

    expect(result).toHaveLength(2);
    expect(result.find((r) => r.sessionId === 'session-a')?.firstMessage).toBe(
      'message-a',
    );
    expect(result.find((r) => r.sessionId === 'session-b')?.firstMessage).toBe(
      'message-b',
    );
  });
});
