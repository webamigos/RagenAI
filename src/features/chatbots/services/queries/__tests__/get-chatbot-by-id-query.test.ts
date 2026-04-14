import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    chatbot: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
  },
}));

import { getChatbotByIdQuery } from '../get-chatbot-by-id-query';

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

describe('getChatbotByIdQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns chatbot when found for given organization', async () => {
    mockFindFirst.mockResolvedValue(chatbotRecord);

    const result = await getChatbotByIdQuery('chatbot-1', 'org-1');

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: 'chatbot-1', organizationId: 'org-1' },
      select: expect.any(Object),
    });
    expect(result).toEqual(chatbotRecord);
  });

  it('returns null when chatbot not found or belongs to different org', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await getChatbotByIdQuery('chatbot-99', 'org-other');

    expect(result).toBeNull();
  });
});
