import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const userUpdate = vi.fn();
const userFindUnique = vi.fn();
const sessionDeleteMany = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

// The helper has its own tests in src/lib/__tests__/audit.test.ts; here we only
// care that the action calls it, and with what.
const recordAdminAction = vi.fn();
vi.mock('@/lib/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audit')>()),
  recordAdminAction: (...args: unknown[]) => recordAdminAction(...args),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      update: (...a: unknown[]) => userUpdate(...a),
      findUnique: (...a: unknown[]) => userFindUnique(...a),
    },
    session: { deleteMany: (...a: unknown[]) => sessionDeleteMany(...a) },
  },
}));

const { renameUserAction, banUserAction, unbanUserAction } =
  await import('../actions');

const USER_ID = 'u-target';

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: 'u1', email: 'a@b.c', name: 'A' });
  userFindUnique.mockResolvedValue({ name: 'Previous Name' });
  sessionDeleteMany.mockResolvedValue({ count: 2 });
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
   * Setting the flag is not the ban. Better Auth checks `banned` in its
   * `session.create` hook — at sign-in and nowhere else — and apps/web never
   * checks it, so without this a banned account keeps working for as long as
   * the person keeps using it: the session is seven days and slides on use.
   */
  it("revokes the account's existing sessions", async () => {
    await banUserAction(USER_ID, 'Abuse');

    expect(sessionDeleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
  });

  it('records how many sessions were revoked', async () => {
    await banUserAction(USER_ID, 'Abuse');

    expect(recordAdminAction.mock.calls[0][0].after.sessionsRevoked).toBe(2);
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
