import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConversationFindFirst = vi.fn();
const mockConversationCreate = vi.fn();
const mockMessageFindMany = vi.fn();
const mockConversationFindMany = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    chatbotConversation: {
      findFirst: (...args: unknown[]) => mockConversationFindFirst(...args),
      create: (...args: unknown[]) => mockConversationCreate(...args),
      findMany: (...args: unknown[]) => mockConversationFindMany(...args),
    },
    chatbotMessage: {
      findMany: (...args: unknown[]) => mockMessageFindMany(...args),
    },
  },
}));

import {
  getOrCreateConversationQuery,
  getConversationMessagesQuery,
  getConversationsBySessionIdsQuery,
} from '../get-conversation-query';

describe('getOrCreateConversationQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns existing conversation when found', async () => {
    mockConversationFindFirst.mockResolvedValue({ id: 'conv-1' });

    const result = await getOrCreateConversationQuery('chatbot-1', 'session-1');

    expect(result).toEqual({ id: 'conv-1' });
    expect(mockConversationCreate).not.toHaveBeenCalled();
  });

  it('creates conversation when none exists', async () => {
    mockConversationFindFirst.mockResolvedValue(null);
    mockConversationCreate.mockResolvedValue({ id: 'conv-new' });

    const result = await getOrCreateConversationQuery('chatbot-1', 'session-1');

    expect(mockConversationCreate).toHaveBeenCalledWith({
      data: { chatbotId: 'chatbot-1', sessionId: 'session-1' },
      select: { id: true },
    });
    expect(result).toEqual({ id: 'conv-new' });
  });

  it('looks up by chatbotId and sessionId', async () => {
    mockConversationFindFirst.mockResolvedValue({ id: 'conv-1' });

    await getOrCreateConversationQuery('chatbot-42', 'session-xyz');

    expect(mockConversationFindFirst).toHaveBeenCalledWith({
      where: { chatbotId: 'chatbot-42', sessionId: 'session-xyz' },
      select: { id: true },
    });
  });
});

describe('getConversationMessagesQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns messages ordered by createdAt desc with default limit', async () => {
    const messages = [
      { role: 'USER', content: 'Hello' },
      { role: 'ASSISTANT', content: 'Hi' },
    ];
    mockMessageFindMany.mockResolvedValue(messages);

    const result = await getConversationMessagesQuery('conv-1');

    expect(mockMessageFindMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1' },
      select: { role: true, content: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    expect(result).toEqual(messages);
  });

  it('respects custom limit', async () => {
    mockMessageFindMany.mockResolvedValue([]);

    await getConversationMessagesQuery('conv-1', 5);

    const call = mockMessageFindMany.mock.calls[0][0];
    expect(call.take).toBe(5);
  });
});

describe('getConversationsBySessionIdsQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns conversations with first message for given session ids', async () => {
    const conversations = [
      {
        sessionId: 'session-1',
        createdAt: new Date(),
        messages: [{ content: 'Hi', role: 'USER' }],
      },
    ];
    mockConversationFindMany.mockResolvedValue(conversations);

    const result = await getConversationsBySessionIdsQuery('chatbot-1', [
      'session-1',
      'session-2',
    ]);

    expect(mockConversationFindMany).toHaveBeenCalledWith({
      where: {
        chatbotId: 'chatbot-1',
        sessionId: { in: ['session-1', 'session-2'] },
      },
      select: {
        sessionId: true,
        createdAt: true,
        messages: {
          select: { content: true, role: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual(conversations);
  });

  it('returns empty array when no matching sessions', async () => {
    mockConversationFindMany.mockResolvedValue([]);

    const result = await getConversationsBySessionIdsQuery('chatbot-1', []);

    expect(result).toEqual([]);
  });
});
