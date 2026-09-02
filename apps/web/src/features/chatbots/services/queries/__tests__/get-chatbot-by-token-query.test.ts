import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockIsFeatureEnabled = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    chatbot: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
  },
}));
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({
    isFeatureEnabledQuery: (...args: unknown[]) =>
      mockIsFeatureEnabled(...args),
  }),
);

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
    mockIsFeatureEnabled.mockResolvedValue(true);
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
    // No point resolving flags for a token that resolves to nothing.
    expect(mockIsFeatureEnabled).not.toHaveBeenCalled();
  });

  it('returns null for a live token once publicChatbot is disabled', async () => {
    // Turning the feature off has to stop serving widgets already embedded on
    // customers' websites, not just stop new ones being enabled. This query is
    // the single choke point for all four /api/chatbot/[token]/* routes.
    mockFindFirst.mockResolvedValue(chatbotRecord);
    mockIsFeatureEnabled.mockResolvedValue(false);

    const result = await getChatbotByTokenQuery('token-abc');

    // Same shape as an unknown token: the caller is an anonymous embed on
    // someone else's site, and a distinct answer would confirm the token.
    expect(result).toBeNull();
    expect(mockIsFeatureEnabled).toHaveBeenCalledWith('org-1', 'publicChatbot');
  });
});
