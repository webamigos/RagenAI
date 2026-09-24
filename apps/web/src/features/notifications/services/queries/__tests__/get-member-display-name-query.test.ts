import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockMemberFindFirst = vi.fn();

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    member: { findFirst: (...args: unknown[]) => mockMemberFindFirst(...args) },
  },
}));

import { getMemberDisplayNameQuery } from '../get-member-display-name-query';

describe('getMemberDisplayNameQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the name through the membership of that organization', async () => {
    mockMemberFindFirst.mockResolvedValue({ user: { name: ' Ann Owner ' } });

    await expect(getMemberDisplayNameQuery('u1', 'org-1')).resolves.toBe(
      'Ann Owner',
    );
    expect(mockMemberFindFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', organizationId: 'org-1' },
      select: { user: { select: { name: true } } },
    });
  });

  it('returns undefined for a non-member', async () => {
    mockMemberFindFirst.mockResolvedValue(null);
    await expect(
      getMemberDisplayNameQuery('u1', 'org-1'),
    ).resolves.toBeUndefined();
  });

  it('returns undefined for a blank name', async () => {
    mockMemberFindFirst.mockResolvedValue({ user: { name: '   ' } });
    await expect(
      getMemberDisplayNameQuery('u1', 'org-1'),
    ).resolves.toBeUndefined();
  });

  it('returns undefined rather than throwing when the read fails', async () => {
    mockMemberFindFirst.mockRejectedValue(new Error('db down'));
    await expect(
      getMemberDisplayNameQuery('u1', 'org-1'),
    ).resolves.toBeUndefined();
  });
});
