import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionApi = vi.fn();
const memberFindFirst = vi.fn();
const recordSecurityEvent = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSessionApi(...args) } },
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    member: { findFirst: (...a: unknown[]) => memberFindFirst(...a) },
  },
}));
vi.mock(
  '@/features/security/services/commands/record-security-event-command',
  () => ({
    recordSecurityEvent: (...args: unknown[]) => recordSecurityEvent(...args),
  }),
);

// `cache()` memoises for the lifetime of a request. Here it would carry one
// case's session into the next, so it becomes a pass-through.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: (fn: unknown) => fn,
}));

const { requireOrgAdminOrAppAdmin } = await import('../auth-guards');

/**
 * The guard that keeps the `/organization/*` actions agreeing with the layout
 * that admits a platform administrator without a membership.
 *
 * Getting this wrong is worse than a broken page: `requireOrgAdmin` files a
 * `CROSS_ORG_ACCESS_ATTEMPTED` security event for a missing membership, so an
 * operator merely opening those pages filled the panel's own Incidents view
 * with alerts about themselves.
 */
describe('requireOrgAdminOrAppAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admits a platform administrator with no membership', async () => {
    getSessionApi.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    memberFindFirst.mockResolvedValue(null);

    await expect(requireOrgAdminOrAppAdmin('org-1')).resolves.toBeNull();
  });

  it('files no security event for them', async () => {
    getSessionApi.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    memberFindFirst.mockResolvedValue(null);

    await requireOrgAdminOrAppAdmin('org-1');

    expect(recordSecurityEvent).not.toHaveBeenCalled();
  });

  it('does not even look the membership up for them', async () => {
    getSessionApi.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });

    await requireOrgAdminOrAppAdmin('org-1');

    expect(memberFindFirst).not.toHaveBeenCalled();
  });

  it('still refuses an ordinary user with no membership', async () => {
    getSessionApi.mockResolvedValue({ user: { id: 'u2', role: 'user' } });
    memberFindFirst.mockResolvedValue(null);

    await expect(requireOrgAdminOrAppAdmin('org-1')).rejects.toThrow(
      /org admin or owner/i,
    );

    // The event that matters: a real cross-organization attempt is still
    // recorded. Widening the guard must not have quieted it.
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'CROSS_ORG_ACCESS_ATTEMPTED' }),
    );
  });

  it('refuses a member who is not an organization admin', async () => {
    getSessionApi.mockResolvedValue({ user: { id: 'u3', role: 'user' } });
    memberFindFirst.mockResolvedValue({ role: 'member' });

    await expect(requireOrgAdminOrAppAdmin('org-1')).rejects.toThrow();
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'UNAUTHORIZED_ACCESS_ATTEMPTED' }),
    );
  });

  it('returns the membership for an organization admin', async () => {
    getSessionApi.mockResolvedValue({ user: { id: 'u4', role: 'user' } });
    memberFindFirst.mockResolvedValue({ role: 'admin' });

    await expect(requireOrgAdminOrAppAdmin('org-1')).resolves.toEqual({
      role: 'admin',
    });
  });

  it('refuses when there is no session at all', async () => {
    getSessionApi.mockResolvedValue(null);

    await expect(requireOrgAdminOrAppAdmin('org-1')).rejects.toThrow(
      /no active session/i,
    );
  });
});
