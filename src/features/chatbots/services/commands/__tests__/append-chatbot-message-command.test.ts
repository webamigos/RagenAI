import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    chatbotMessage: { create: (...args: unknown[]) => mockCreate(...args) },
  },
}));

import { appendChatbotMessageCommand } from '../append-chatbot-message-command';

describe('appendChatbotMessageCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a user message without sources', async () => {
    mockCreate.mockResolvedValue({ id: 'msg-1' });

    const result = await appendChatbotMessageCommand('conv-1', 'USER', 'Hello');

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        conversationId: 'conv-1',
        role: 'USER',
        content: 'Hello',
        sources: undefined,
      },
      select: { id: true },
    });
    expect(result).toEqual({ id: 'msg-1' });
  });

  it('creates an assistant message with sources', async () => {
    mockCreate.mockResolvedValue({ id: 'msg-2' });
    const sources = [{ title: 'Doc 1', url: '/doc/1' }];

    await appendChatbotMessageCommand('conv-1', 'ASSISTANT', 'Answer', sources);

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        conversationId: 'conv-1',
        role: 'ASSISTANT',
        content: 'Answer',
        sources,
      },
      select: { id: true },
    });
  });

  it('uses undefined for sources when not provided', async () => {
    mockCreate.mockResolvedValue({ id: 'msg-3' });

    await appendChatbotMessageCommand('conv-1', 'USER', 'Hi');

    const call = mockCreate.mock.calls[0][0];
    expect(call.data.sources).toBeUndefined();
  });
});
