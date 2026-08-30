import { describe, it, expect, vi } from 'vitest';

const mockFindUniqueOrThrow = vi.fn();
const mockFindFirst = vi.fn();

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

import {
  getProjectByIdOrThrowQuery,
  getPublicProjectQuery,
} from '../get-project-query';

describe('getProjectByIdOrThrowQuery', () => {
  it('scopes the lookup by organizationId, closing the cross-org IDOR this once had', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ id: 1, organizationId: 'org-1' });

    await getProjectByIdOrThrowQuery(1, 'org-1');

    expect(mockFindUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, organizationId: 'org-1' },
      }),
    );
  });
});

describe('getPublicProjectQuery', () => {
  it('intentionally has no org filter — resolves org from the public access token instead', async () => {
    mockFindFirst.mockResolvedValue({
      id: 1,
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
});
