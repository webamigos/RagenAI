import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
const mockCount = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    chatbot: { create: (...args: unknown[]) => mockCreate(...args) },
    userFile: { count: (...args: unknown[]) => mockCount(...args) },
  },
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
    // No file validation query when the list is empty.
    expect(mockCount).not.toHaveBeenCalled();
  });

  it('creates a chatbot with all optional fields', async () => {
    mockCount.mockResolvedValue(1);
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

    expect(mockCount).toHaveBeenCalledWith({
      where: { id: { in: ['file-1'] }, organizationId: 'org-1' },
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

  it('throws when selected file IDs do not all belong to the organization', async () => {
    // Caller asks for two files but only one belongs to the org.
    mockCount.mockResolvedValue(1);

    await expect(
      createChatbotCommand('org-1', {
        name: 'Bot',
        selectedFileIds: ['file-1', 'file-from-other-org'],
      }),
    ).rejects.toThrow(/do not belong to this organization/);

    // And the chatbot must NOT have been persisted.
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
