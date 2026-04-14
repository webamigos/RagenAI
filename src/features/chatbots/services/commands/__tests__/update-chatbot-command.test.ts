import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockUpdate = vi.fn();
const mockCount = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    chatbot: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    userFile: { count: (...args: unknown[]) => mockCount(...args) },
  },
}));

import { updateChatbotCommand } from '../update-chatbot-command';

const chatbotRecord = {
  id: 'chatbot-1',
  name: 'Updated Bot',
  widgetToken: 'token-1',
  allowedOrigins: [],
  themeConfig: {},
  selectedFileIds: [],
  isActive: true,
  organizationId: 'org-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('updateChatbotCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when chatbot does not belong to organization', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await updateChatbotCommand('chatbot-1', 'org-1', {
      name: 'New Name',
    });

    expect(result).toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('updates chatbot when it belongs to organization', async () => {
    mockFindFirst.mockResolvedValue({ id: 'chatbot-1' });
    mockUpdate.mockResolvedValue(chatbotRecord);

    const result = await updateChatbotCommand('chatbot-1', 'org-1', {
      name: 'Updated Bot',
    });

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'chatbot-1' },
      data: { name: 'Updated Bot' },
      select: expect.any(Object),
    });
    expect(result).toEqual(chatbotRecord);
  });

  it('omits undefined fields from update data', async () => {
    mockFindFirst.mockResolvedValue({ id: 'chatbot-1' });
    mockUpdate.mockResolvedValue(chatbotRecord);

    await updateChatbotCommand('chatbot-1', 'org-1', {
      allowedOrigins: ['https://example.com'],
    });

    const call = mockUpdate.mock.calls[0][0];
    expect(call.data).not.toHaveProperty('name');
    expect(call.data).toEqual({ allowedOrigins: ['https://example.com'] });
  });

  it('updates isActive field', async () => {
    mockFindFirst.mockResolvedValue({ id: 'chatbot-1' });
    mockUpdate.mockResolvedValue({ ...chatbotRecord, isActive: false });

    await updateChatbotCommand('chatbot-1', 'org-1', { isActive: false });

    const call = mockUpdate.mock.calls[0][0];
    expect(call.data).toEqual({ isActive: false });
  });

  it('verifies ownership using correct id and organizationId', async () => {
    mockFindFirst.mockResolvedValue(null);

    await updateChatbotCommand('chatbot-99', 'org-other', {});

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: 'chatbot-99', organizationId: 'org-other' },
      select: { id: true },
    });
  });

  it('validates that selectedFileIds belong to the organization', async () => {
    mockFindFirst.mockResolvedValue({ id: 'chatbot-1' });
    mockCount.mockResolvedValue(2);
    mockUpdate.mockResolvedValue(chatbotRecord);

    await updateChatbotCommand('chatbot-1', 'org-1', {
      selectedFileIds: ['file-1', 'file-2'],
    });

    expect(mockCount).toHaveBeenCalledWith({
      where: { id: { in: ['file-1', 'file-2'] }, organizationId: 'org-1' },
    });
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('throws and skips update when selectedFileIds include foreign IDs', async () => {
    mockFindFirst.mockResolvedValue({ id: 'chatbot-1' });
    // Caller asked for 2, only 1 belongs — cross-org attempt.
    mockCount.mockResolvedValue(1);

    await expect(
      updateChatbotCommand('chatbot-1', 'org-1', {
        selectedFileIds: ['file-1', 'file-from-other-org'],
      }),
    ).rejects.toThrow(/do not belong to this organization/);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not query userFile.count when selectedFileIds is omitted', async () => {
    mockFindFirst.mockResolvedValue({ id: 'chatbot-1' });
    mockUpdate.mockResolvedValue(chatbotRecord);

    await updateChatbotCommand('chatbot-1', 'org-1', { name: 'renamed' });

    expect(mockCount).not.toHaveBeenCalled();
  });
});
