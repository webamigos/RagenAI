import { beforeEach, describe, expect, it, vi } from 'vitest';

const findFirst = vi.fn();
const findMany = vi.fn();
const update = vi.fn();
const memberFindFirst = vi.fn();
const organizationUpdate = vi.fn();
const isInstallClaimed = vi.fn();
const markInstallClaimed = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    user: {
      findFirst: (...args: unknown[]) => findFirst(...args),
      findMany: (...args: unknown[]) => findMany(...args),
      update: (...args: unknown[]) => update(...args),
    },
    member: { findFirst: (...args: unknown[]) => memberFindFirst(...args) },
    organization: {
      update: (...args: unknown[]) => organizationUpdate(...args),
    },
  },
}));

vi.mock('@/features/setup/services/install-claim', () => ({
  isInstallClaimed: () => isInstallClaimed(),
  markInstallClaimed: () => markInstallClaimed(),
}));

const { updateInitialAdminAccountCommand } =
  await import('../initial-account-commands');

/**
 * This command used to read the session, which made `/initial-account` a dead
 * end on every production deployment: `requireEmailVerification` is on
 * whenever `NODE_ENV === 'production'`, Better Auth issues no session for a
 * sign-up awaiting verification, and the screen failed with "No active
 * session" — unrecoverably, since returning to it re-ran `signUp.email`
 * against an account that now existed.
 *
 * What replaced the session is the invariant that made it safe in the first
 * place: exactly one user, no admin. These tests cover that invariant rather
 * than the happy path alone, because the two refusals are the security
 * property.
 */
describe('updateInitialAdminAccountCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue(null);
    findMany.mockResolvedValue([{ id: 'user-1' }]);
    update.mockResolvedValue({});
    memberFindFirst.mockResolvedValue(null);
    organizationUpdate.mockResolvedValue({});
    isInstallClaimed.mockResolvedValue(false);
    markInstallClaimed.mockResolvedValue(undefined);
  });

  it('promotes the only account, without needing a session', () => {
    // The whole point: no session is consulted, so a sign-up awaiting email
    // verification can still complete the first-run screen.
    return expect(updateInitialAdminAccountCommand()).resolves.toMatchObject({
      success: true,
    });
  });

  it('marks the address verified as well as granting the role', async () => {
    await updateInitialAdminAccountCommand();

    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { role: 'admin', emailVerified: true },
    });
  });

  it('refuses when an admin already exists', async () => {
    findFirst.mockResolvedValue({ id: 'someone-else' });

    const result = await updateInitialAdminAccountCommand();

    expect(result).toMatchObject({ success: false });
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses rather than guessing when more than one account exists', async () => {
    // The replacement for the session check. Two people signing up at a fresh
    // install must not result in an arbitrary one becoming platform admin.
    findMany.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]);

    const result = await updateInitialAdminAccountCommand();

    expect(result).toMatchObject({ success: false });
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses when there is no account at all', async () => {
    findMany.mockResolvedValue([]);

    const result = await updateInitialAdminAccountCommand();

    expect(result).toMatchObject({ success: false });
    expect(update).not.toHaveBeenCalled();
  });

  it('renames the organization the promoted user owns', async () => {
    memberFindFirst.mockResolvedValue({ organizationId: 'org-1' });

    await updateInitialAdminAccountCommand('Acme');

    expect(organizationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'org-1' },
        data: expect.objectContaining({ name: 'Acme' }),
      }),
    );
  });

  it('refuses on an install that has already been claimed', async () => {
    // The reason the role check alone was not enough: `role` is a mutable
    // column, so demoting or deleting the last admin made "no admin yet" true
    // again, and a single-account install would then promote whoever ran this
    // next. The marker does not answer differently after the fact.
    isInstallClaimed.mockResolvedValue(true);

    const result = await updateInitialAdminAccountCommand();

    expect(result).toMatchObject({ success: false });
    expect(update).not.toHaveBeenCalled();
  });

  it('claims the install on success, so it cannot be run twice', async () => {
    await updateInitialAdminAccountCommand();

    expect(markInstallClaimed).toHaveBeenCalledTimes(1);
  });

  it('claims the install even when the organization rename is skipped', async () => {
    // The rename is cosmetic and its lookup can legitimately find nothing.
    // Losing the marker to that would leave the screen open.
    memberFindFirst.mockResolvedValue(null);

    await updateInitialAdminAccountCommand('Acme');

    expect(markInstallClaimed).toHaveBeenCalledTimes(1);
    expect(organizationUpdate).not.toHaveBeenCalled();
  });

  it('does not claim the install when it refuses', async () => {
    findMany.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]);

    await updateInitialAdminAccountCommand();

    expect(markInstallClaimed).not.toHaveBeenCalled();
  });
});
