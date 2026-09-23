import { beforeEach, describe, expect, it, vi } from 'vitest';

const deps = vi.hoisted(() => ({
  getOrgIdFromAuth: vi.fn(),
  getActiveMember: vi.fn(),
  isFeatureEnabledQuery: vi.fn(),
}));
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuth: deps.getOrgIdFromAuth,
}));
vi.mock('@/lib/auth-guards', () => ({ getActiveMember: deps.getActiveMember }));
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({ isFeatureEnabledQuery: deps.isFeatureEnabledQuery }),
);

const { getBrainAccessQuery } =
  await import('../services/queries/get-brain-access-query');

beforeEach(() => {
  vi.clearAllMocks();
  deps.getOrgIdFromAuth.mockResolvedValue('org-1');
  deps.getActiveMember.mockResolvedValue({ role: 'admin' });
  deps.isFeatureEnabledQuery.mockResolvedValue(true);
});

describe('getBrainAccessQuery', () => {
  it('lets an admin of an organization with Brain on in', async () => {
    await expect(getBrainAccessQuery()).resolves.toEqual({ orgId: 'org-1' });
    expect(deps.isFeatureEnabledQuery).toHaveBeenCalledWith('org-1', 'brain');
    expect(deps.getActiveMember).toHaveBeenCalledWith('org-1');
  });

  it('keeps a member out', async () => {
    deps.getActiveMember.mockResolvedValue({ role: 'member' });
    await expect(getBrainAccessQuery()).resolves.toBeNull();
  });

  it('keeps everyone out while the flag is off', async () => {
    deps.isFeatureEnabledQuery.mockResolvedValue(false);
    await expect(getBrainAccessQuery()).resolves.toBeNull();
  });

  it('keeps out a session with no organization, or no membership in it', async () => {
    deps.getActiveMember.mockResolvedValue(null);
    await expect(getBrainAccessQuery()).resolves.toBeNull();
    deps.getOrgIdFromAuth.mockResolvedValue(null);
    await expect(getBrainAccessQuery()).resolves.toBeNull();
  });
});
