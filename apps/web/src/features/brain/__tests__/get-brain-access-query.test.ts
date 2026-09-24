import { beforeEach, describe, expect, it, vi } from 'vitest';

const deps = vi.hoisted(() => ({
  getOrgIdFromAuth: vi.fn(),
  getActiveMember: vi.fn(),
  getEffectiveFeaturesQuery: vi.fn(),
}));
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuth: deps.getOrgIdFromAuth,
}));
vi.mock('@/lib/auth-guards', () => ({ getActiveMember: deps.getActiveMember }));
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({ getEffectiveFeaturesQuery: deps.getEffectiveFeaturesQuery }),
);

const { getBrainAccessQuery, getBrainWriteAccessQuery } =
  await import('../services/queries/get-brain-access-query');

const flags = (over: Record<string, boolean> = {}) => ({
  brain: true,
  manageBrain: true,
  brainForMembers: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  deps.getOrgIdFromAuth.mockResolvedValue('org-1');
  deps.getActiveMember.mockResolvedValue({ role: 'admin' });
  deps.getEffectiveFeaturesQuery.mockResolvedValue(flags());
});

describe('getBrainAccessQuery', () => {
  it('lets an admin of an organization with Brain on in, to curate', async () => {
    await expect(getBrainAccessQuery()).resolves.toEqual({
      orgId: 'org-1',
      access: 'write',
      canWrite: true,
      assistant: false,
    });
    expect(deps.getEffectiveFeaturesQuery).toHaveBeenCalledWith('org-1');
    expect(deps.getActiveMember).toHaveBeenCalledWith('org-1');
  });

  it('keeps a member out by default', async () => {
    deps.getActiveMember.mockResolvedValue({ role: 'member' });
    await expect(getBrainAccessQuery()).resolves.toBeNull();
  });

  it('lets a member browse when brainForMembers is on', async () => {
    deps.getActiveMember.mockResolvedValue({ role: 'member' });
    deps.getEffectiveFeaturesQuery.mockResolvedValue(
      flags({ brainForMembers: true }),
    );
    await expect(getBrainAccessQuery()).resolves.toEqual({
      orgId: 'org-1',
      access: 'read',
      canWrite: false,
      assistant: false,
    });
  });

  it('turns the assistant on only with its key, and never for someone kept out', async () => {
    deps.getEffectiveFeaturesQuery.mockResolvedValue(
      flags({ brainAssistant: true }),
    );
    await expect(getBrainAccessQuery()).resolves.toMatchObject({
      assistant: true,
    });
    deps.getActiveMember.mockResolvedValue({ role: 'member' });
    await expect(getBrainAccessQuery()).resolves.toBeNull();
  });

  it('keeps everyone out while the flag is off', async () => {
    deps.getEffectiveFeaturesQuery.mockResolvedValue(flags({ brain: false }));
    await expect(getBrainAccessQuery()).resolves.toBeNull();
  });

  it('keeps out a session with no organization, or no membership in it', async () => {
    deps.getActiveMember.mockResolvedValue(null);
    await expect(getBrainAccessQuery()).resolves.toBeNull();
    deps.getOrgIdFromAuth.mockResolvedValue(null);
    await expect(getBrainAccessQuery()).resolves.toBeNull();
  });
});

describe('getBrainWriteAccessQuery', () => {
  it('answers for a curator', async () => {
    await expect(getBrainWriteAccessQuery()).resolves.toEqual({
      orgId: 'org-1',
    });
  });

  // Every write path asks this; a hidden button is not what keeps a reader out.
  it('refuses a member let in to browse', async () => {
    deps.getActiveMember.mockResolvedValue({ role: 'member' });
    deps.getEffectiveFeaturesQuery.mockResolvedValue(
      flags({ brainForMembers: true }),
    );
    await expect(getBrainWriteAccessQuery()).resolves.toBeNull();
  });

  it('refuses even an owner while Brain is frozen', async () => {
    deps.getActiveMember.mockResolvedValue({ role: 'owner' });
    deps.getEffectiveFeaturesQuery.mockResolvedValue(
      flags({ manageBrain: false }),
    );
    await expect(getBrainWriteAccessQuery()).resolves.toBeNull();
  });
});
