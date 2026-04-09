import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    chatbot: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
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
    mockFindUnique.mockResolvedValue(chatbotRecord);

    const result = await getChatbotByTokenQuery('token-abc');

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { widgetToken: 'token-abc', isActive: true },
      select: expect.any(Object),
    });
    expect(result).toEqual(chatbotRecord);
  });

  it('returns null for unknown or inactive token', async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await getChatbotByTokenQuery('invalid-token');

    expect(result).toBeNull();
  });
});
