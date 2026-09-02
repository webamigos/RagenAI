import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const userUpdate = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/db', () => ({
  prisma: { user: { update: (...a: unknown[]) => userUpdate(...a) } },
}));

const { renameUserAction, banUserAction, unbanUserAction } =
  await import('../actions');

const USER_ID = 'u-target';

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: 'u1', email: 'a@b.c', name: 'A' });
});

describe('renameUserAction', () => {
  it('trims the new name', async () => {
    await renameUserAction(USER_ID, '  Ada Lovelace  ');

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { name: 'Ada Lovelace' },
    });
  });

  it.each([
    ['an empty string', ''],
    ['whitespace only', '   '],
  ])('rejects %s', async (_label, name) => {
    await expect(renameUserAction(USER_ID, name)).rejects.toThrow(
      /Name cannot be empty/,
    );
    expect(userUpdate).not.toHaveBeenCalled();
  });
});

describe('banUserAction', () => {
  it('sets the ban flag with the given reason', async () => {
    await banUserAction(USER_ID, 'Abuse');

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { banned: true, banReason: 'Abuse' },
    });
  });

  it('stores a null reason when none is given', async () => {
    await banUserAction(USER_ID);

    expect(userUpdate.mock.calls[0][0].data.banReason).toBeNull();
  });

  it('stores a null reason for an empty string rather than a blank note', async () => {
    await banUserAction(USER_ID, '');

    expect(userUpdate.mock.calls[0][0].data.banReason).toBeNull();
  });

  /**
   * Documents a real limitation, not a desired behaviour: Better Auth checks
   * `banned` only when a *session is created*, so banning does not end the
   * sessions the account already holds. Nothing here revokes them, and
   * apps/web's session is sliding (7 days, refreshed daily), so an active
   * banned user keeps working until they sign out. If session revocation is
   * added, this expectation is the thing to change.
   */
  it("does not revoke the banned account's existing sessions", async () => {
    await banUserAction(USER_ID, 'Abuse');

    expect(userUpdate).toHaveBeenCalledTimes(1);
    expect(userUpdate.mock.calls[0][0].data).not.toHaveProperty('sessions');
  });
});

describe('unbanUserAction', () => {
  it('clears the flag, the reason and the expiry together', async () => {
    await unbanUserAction(USER_ID);

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { banned: false, banReason: null, banExpires: null },
    });
  });
});

describe('the platform-admin guard', () => {
  it.each([
    ['renameUserAction', () => renameUserAction(USER_ID, 'X')],
    ['banUserAction', () => banUserAction(USER_ID)],
    ['unbanUserAction', () => unbanUserAction(USER_ID)],
  ])(
    '%s refuses a caller that is not a platform administrator',
    async (_name, call) => {
      requireAdmin.mockRejectedValue(new Error('Forbidden'));

      await expect(call()).rejects.toThrow(/Forbidden/);
      expect(userUpdate).not.toHaveBeenCalled();
    },
  );
});
