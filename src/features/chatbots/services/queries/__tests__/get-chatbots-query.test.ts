import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    chatbot: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  },
}));

import { getChatbotsQuery } from '../get-chatbots-query';

const chatbotRecord = {
  id: 'chatbot-1',
  name: 'Test Bot',
  widgetToken: 'token-1',
  isActive: true,
  createdAt: new Date(),
};

describe('getChatbotsQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns chatbots for an organization', async () => {
    mockFindMany.mockResolvedValue([chatbotRecord]);

    const result = await getChatbotsQuery('org-1');

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      select: expect.any(Object),
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual([chatbotRecord]);
  });

  it('returns empty array when organization has no chatbots', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getChatbotsQuery('org-empty');

    expect(result).toEqual([]);
  });
});
