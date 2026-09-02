import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUniqueOrThrow = vi.fn();
const mockFindFirst = vi.fn();
const mockIsFeatureEnabled = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    project: {
      findUniqueOrThrow: (...args: unknown[]) => mockFindUniqueOrThrow(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({
    isFeatureEnabledQuery: (...args: unknown[]) =>
      mockIsFeatureEnabled(...args),
  }),
);

import {
  getProjectByIdOrThrowQuery,
  getPublicProjectQuery,
} from '../get-project-query';

describe('getProjectByIdOrThrowQuery', () => {
  it('scopes the lookup by organizationId, closing the cross-org IDOR this once had', async () => {
    // Project.id is a uuid string, not an int — the previous numeric literal
    // was a shape the database can never return.
    const projectId = '11111111-1111-4111-8111-111111111111';
    mockFindUniqueOrThrow.mockResolvedValue({
      id: projectId,
      organizationId: 'org-1',
    });

    await getProjectByIdOrThrowQuery(projectId, 'org-1');

    expect(mockFindUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: projectId, organizationId: 'org-1' },
      }),
    );
  });
});

describe('getPublicProjectQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFeatureEnabled.mockResolvedValue(true);
  });

  it('intentionally has no org filter — resolves org from the public access token instead', async () => {
    mockFindFirst.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Public project',
      organizationId: 'org-1',
    });

    await getPublicProjectQuery('token-abc');

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accessToken: 'token-abc', isPublic: true },
      }),
    );
  });

  it('returns null for a published project once publicChatbot is disabled', async () => {
    // Turning the feature off has to stop serving pages already published,
    // not just stop new ones being published. `null` reads to the caller as
    // "no such published project" — an anonymous visitor holding a stale
    // access token learns nothing more.
    mockFindFirst.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Public project',
      organizationId: 'org-1',
    });
    mockIsFeatureEnabled.mockResolvedValue(false);

    const result = await getPublicProjectQuery('token-abc');

    expect(result).toBeNull();
    // The org comes from the project, not a session — the caller is anonymous.
    expect(mockIsFeatureEnabled).toHaveBeenCalledWith('org-1', 'publicChatbot');
  });
});
