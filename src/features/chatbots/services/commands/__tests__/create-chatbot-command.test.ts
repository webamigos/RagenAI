import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: { chatbot: { create: (...args: unknown[]) => mockCreate(...args) } },
}));

import { createChatbotCommand } from '../create-chatbot-command';

const chatbotRecord = {
  id: 'chatbot-1',
  name: 'Test Bot',
  widgetToken: 'token-1',
  allowedOrigins: [],
  themeConfig: {},
  selectedFileIds: [],
  isActive: true,
  organizationId: 'org-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('createChatbotCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a chatbot with minimal data', async () => {
    mockCreate.mockResolvedValue(chatbotRecord);

    const result = await createChatbotCommand('org-1', { name: 'Test Bot' });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        name: 'Test Bot',
        selectedFileIds: [],
        allowedOrigins: [],
        themeConfig: {},
      },
      select: expect.any(Object),
    });
    expect(result).toEqual(chatbotRecord);
  });

  it('creates a chatbot with all optional fields', async () => {
    mockCreate.mockResolvedValue({
      ...chatbotRecord,
      name: 'Full Bot',
      selectedFileIds: ['file-1'],
      allowedOrigins: ['https://example.com'],
    });

    const result = await createChatbotCommand('org-1', {
      name: 'Full Bot',
      selectedFileIds: ['file-1'],
      allowedOrigins: ['https://example.com'],
      themeConfig: { primaryColor: '#6366f1', position: 'right' },
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        name: 'Full Bot',
        selectedFileIds: ['file-1'],
        allowedOrigins: ['https://example.com'],
        themeConfig: { primaryColor: '#6366f1', position: 'right' },
      },
      select: expect.any(Object),
    });
    expect(result.name).toBe('Full Bot');
  });

  it('defaults selectedFileIds to [] when not provided', async () => {
    mockCreate.mockResolvedValue(chatbotRecord);

    await createChatbotCommand('org-1', { name: 'Bot' });

    const call = mockCreate.mock.calls[0][0];
    expect(call.data.selectedFileIds).toEqual([]);
    expect(call.data.allowedOrigins).toEqual([]);
    expect(call.data.themeConfig).toEqual({});
  });
});
