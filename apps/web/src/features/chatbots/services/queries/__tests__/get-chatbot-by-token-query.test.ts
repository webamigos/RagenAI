import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    chatbot: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
  },
}));

import { getChatbotByTokenQuery } from '../get-chatbot-by-token-query';

const chatbotRecord = {
  organizationId: 'org-1',
  name: 'Test Bot',
  selectedFileIds: ['file-1'],
  themeConfig: { primaryColor: '#6366f1' },
};

describe('getChatbotByTokenQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns chatbot config for active token', async () => {
    mockFindFirst.mockResolvedValue(chatbotRecord);

    const result = await getChatbotByTokenQuery('token-abc');

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { widgetToken: 'token-abc', isActive: true },
      select: expect.any(Object),
    });
    expect(result).toEqual(chatbotRecord);
  });

  it('returns null for unknown or inactive token', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await getChatbotByTokenQuery('invalid-token');

    expect(result).toBeNull();
  });
});
