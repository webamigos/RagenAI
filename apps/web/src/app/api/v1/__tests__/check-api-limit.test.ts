import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCount = vi.fn();
const mockFindUnique = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    aiUsage: {
      count: (...args: unknown[]) => mockCount(...args),
    },
    organizationSettings: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

vi.mock('@/generated/prisma/client', () => ({
  AiUsageStep: {
    CHAT_COMPLETION: 'CHAT_COMPLETION',
    MODERATION: 'MODERATION',
    REPHRASING: 'REPHRASING',
    EMBEDDINGS: 'EMBEDDINGS',
  },
}));

vi.mock('@/app/lib/utils/hashApiKey', () => ({
  encryptApiKey: (v: string) => `enc:${v}`,
  decryptApiKey: (v: string) => v.replace('enc:', ''),
}));

vi.mock('@/features/organizations/services/queries/get-api-keys-query', () => ({
  getApiKeyFromPool: () => null,
}));

import { checkApiRequestLimit } from '../check-api-limit';

describe('checkApiRequestLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not exceeded when limit is null (unlimited)', async () => {
    mockFindUnique.mockResolvedValue({ monthlyApiRequestLimit: null });

    const result = await checkApiRequestLimit('org-1');

    expect(result).toEqual({
      exceeded: false,
      current: 0,
      limit: null,
    });
    expect(mockCount).not.toHaveBeenCalled();
  });

  it('returns not exceeded when count is below limit', async () => {
    mockFindUnique.mockResolvedValue({ monthlyApiRequestLimit: 100 });
    mockCount.mockResolvedValue(42);

    const result = await checkApiRequestLimit('org-1');

    expect(result).toEqual({
      exceeded: false,
      current: 42,
      limit: 100,
    });
  });

  it('returns exceeded when count meets limit', async () => {
    mockFindUnique.mockResolvedValue({ monthlyApiRequestLimit: 100 });
    mockCount.mockResolvedValue(100);

    const result = await checkApiRequestLimit('org-1');

    expect(result).toEqual({
      exceeded: true,
      current: 100,
      limit: 100,
    });
  });

  it('returns exceeded when count exceeds limit', async () => {
    mockFindUnique.mockResolvedValue({ monthlyApiRequestLimit: 50 });
    mockCount.mockResolvedValue(75);

    const result = await checkApiRequestLimit('org-1');

    expect(result).toEqual({
      exceeded: true,
      current: 75,
      limit: 50,
    });
  });

  it('filters by CHAT_COMPLETION step and API source metadata', async () => {
    mockFindUnique.mockResolvedValue({ monthlyApiRequestLimit: 100 });
    mockCount.mockResolvedValue(10);

    await checkApiRequestLimit('org-1');

    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          step: 'CHAT_COMPLETION',
          metadata: {
            path: ['source'],
            equals: 'API',
          },
        }),
      }),
    );
  });
});
