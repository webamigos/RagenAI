import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.hoisted(() => vi.fn());
const listOrganizations = vi.hoisted(() => vi.fn());
const finalizeOnboardingCommand = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers()),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession,
      listOrganizations,
    },
  },
}));

vi.mock(
  '@/features/onboarding/services/commands/finalize-onboarding-command',
  () => ({ finalizeOnboardingCommand }),
);

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Re-export pure tag to bypass Better Auth's heavy imports if anything else
// pulls them in via the module graph.
vi.mock('@/lib/auth-guards', () => ({
  isAppAdmin: () => false,
  isOrgAdmin: () => false,
  getActiveMember: vi.fn(),
  requireAppAdmin: vi.fn(),
  requireOrgAdmin: vi.fn(),
  requireOrgOwner: vi.fn(),
}));

const importHelpers = async () => {
  // React `cache()` memoizes per module instance; reset before each call so
  // tests don't bleed into one another.
  vi.resetModules();
  return import('../auth-helpers');
};

describe('getOrgIdFromAuth', () => {
  beforeEach(() => {
    getSession.mockReset();
    listOrganizations.mockReset();
    finalizeOnboardingCommand.mockReset();
  });

  it('returns activeOrganizationId from the session when present', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1' },
      session: { activeOrganizationId: 'org-1' },
    });

    const { getOrgIdFromAuth } = await importHelpers();
    await expect(getOrgIdFromAuth()).resolves.toBe('org-1');
    expect(finalizeOnboardingCommand).not.toHaveBeenCalled();
  });

  it('returns null when there is no user session', async () => {
    getSession.mockResolvedValue(null);

    const { getOrgIdFromAuth } = await importHelpers();
    await expect(getOrgIdFromAuth()).resolves.toBeNull();
    expect(finalizeOnboardingCommand).not.toHaveBeenCalled();
  });

  it('self-heals by finalizing onboarding when session has user but no activeOrganizationId', async () => {
    getSession
      .mockResolvedValueOnce({
        user: { id: 'user-1' },
        session: { activeOrganizationId: null },
      })
      .mockResolvedValueOnce({
        user: { id: 'user-1' },
        session: { activeOrganizationId: 'org-after-finalize' },
      });

    const { getOrgIdFromAuth } = await importHelpers();
    await expect(getOrgIdFromAuth()).resolves.toBe('org-after-finalize');
    expect(finalizeOnboardingCommand).toHaveBeenCalledTimes(1);
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it('falls back to listOrganizations when self-heal still leaves no activeOrganizationId', async () => {
    getSession
      .mockResolvedValueOnce({
        user: { id: 'user-1' },
        session: { activeOrganizationId: null },
      })
      .mockResolvedValueOnce({
        user: { id: 'user-1' },
        session: { activeOrganizationId: null },
      });
    listOrganizations.mockResolvedValue([{ id: 'org-from-list' }]);

    const { getOrgIdFromAuth } = await importHelpers();
    await expect(getOrgIdFromAuth()).resolves.toBe('org-from-list');
    expect(finalizeOnboardingCommand).toHaveBeenCalledTimes(1);
    expect(listOrganizations).toHaveBeenCalledTimes(1);
  });

  it('returns null when user has no organizations at all', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1' },
      session: { activeOrganizationId: null },
    });
    listOrganizations.mockResolvedValue([]);

    const { getOrgIdFromAuth } = await importHelpers();
    await expect(getOrgIdFromAuth()).resolves.toBeNull();
  });

  it('returns null and swallows errors thrown by getSession', async () => {
    getSession.mockRejectedValue(new Error('boom'));

    const { getOrgIdFromAuth } = await importHelpers();
    await expect(getOrgIdFromAuth()).resolves.toBeNull();
  });
});

describe('getOrgIdFromAuthOrThrow', () => {
  beforeEach(() => {
    getSession.mockReset();
    listOrganizations.mockReset();
    finalizeOnboardingCommand.mockReset();
  });

  it('returns the orgId when getOrgIdFromAuth resolves with one', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1' },
      session: { activeOrganizationId: 'org-1' },
    });

    const { getOrgIdFromAuthOrThrow } = await importHelpers();
    await expect(getOrgIdFromAuthOrThrow()).resolves.toBe('org-1');
  });

  it('throws "Organization ID is required" when no org can be resolved', async () => {
    getSession.mockResolvedValue(null);

    const { getOrgIdFromAuthOrThrow } = await importHelpers();
    await expect(getOrgIdFromAuthOrThrow()).rejects.toThrow(
      'Organization ID is required',
    );
  });
});
