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
});
