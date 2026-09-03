import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const userUpdate = vi.fn();
const userFindUnique = vi.fn();
const sessionDeleteMany = vi.fn();
const userCount = vi.fn();

// Partial: the action also reads `APP_ADMIN_ROLE`, and the real constant is
// what the guard compares against — faking it would let a typo pass.
vi.mock('@/lib/auth-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth-guard')>()),
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
      count: (...a: unknown[]) => userCount(...a),
    },
    session: { deleteMany: (...a: unknown[]) => sessionDeleteMany(...a) },
  },
}));

const {
  renameUserAction,
  banUserAction,
  unbanUserAction,
  setPlatformRoleAction,
} = await import('../actions');

const USER_ID = 'u-target';

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: 'u1', email: 'a@b.c', name: 'A' });
  userFindUnique.mockResolvedValue({ name: 'Previous Name' });
  sessionDeleteMany.mockResolvedValue({ count: 2 });
  userCount.mockResolvedValue(2);
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

describe('setPlatformRoleAction', () => {
  const ADMIN_ID = 'u1';

  beforeEach(() => {
    userFindUnique.mockResolvedValue({
      id: USER_ID,
      email: 'target@example.com',
      role: 'user',
    });
  });

  it('promotes a user to platform administrator', async () => {
    await setPlatformRoleAction(USER_ID, true);

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { role: 'admin' },
    });
  });

  it('demotes an administrator back to user', async () => {
    userFindUnique.mockResolvedValue({
      id: USER_ID,
      email: 'target@example.com',
      role: 'admin',
    });

    await setPlatformRoleAction(USER_ID, false);

    expect(userUpdate.mock.calls[0][0].data).toEqual({ role: 'user' });
  });

  it('raises a security event, since this changes who can reach every organization', async () => {
    await setPlatformRoleAction(USER_ID, true);

    expect(recordAdminAction.mock.calls[0][0]).toMatchObject({
      action: 'admin.user.platform_role_granted',
      entityType: 'user',
      entityId: USER_ID,
      securityEvent: { eventType: 'AUTH_ADMIN_ROLE_GRANTED', severity: 'warn' },
    });
  });

  it('records the role it came from and the one it went to', async () => {
    await setPlatformRoleAction(USER_ID, true);

    const call = recordAdminAction.mock.calls[0][0];
    expect(call.before).toEqual({ role: 'user' });
    expect(call.after).toMatchObject({ role: 'admin' });
  });

  it('does nothing when the role is already what was asked for', async () => {
    userFindUnique.mockResolvedValue({
      id: USER_ID,
      email: 'target@example.com',
      role: 'admin',
    });

    await setPlatformRoleAction(USER_ID, true);

    expect(userUpdate).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it('rejects a user that does not exist', async () => {
    userFindUnique.mockResolvedValue(null);

    await expect(setPlatformRoleAction(USER_ID, true)).rejects.toThrow(
      /User not found/,
    );
  });

  /**
   * Both refusals below lock somebody out of the only surface that could undo
   * the mistake — the guard re-reads the role from the database on every
   * request, so a demotion takes effect on the next page load.
   */
  it('refuses to let an administrator demote themselves', async () => {
    await expect(setPlatformRoleAction(ADMIN_ID, false)).rejects.toThrow(
      /cannot remove your own/i,
    );
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('allows demoting somebody else', async () => {
    userFindUnique.mockResolvedValue({
      id: USER_ID,
      email: 'target@example.com',
      role: 'admin',
    });

    await expect(
      setPlatformRoleAction(USER_ID, false),
    ).resolves.toBeUndefined();
  });

  it('refuses to remove the last platform administrator', async () => {
    userFindUnique.mockResolvedValue({
      id: USER_ID,
      email: 'target@example.com',
      role: 'admin',
    });
    userCount.mockResolvedValue(0);

    await expect(setPlatformRoleAction(USER_ID, false)).rejects.toThrow(
      /last platform administrator/i,
    );
    expect(userUpdate).not.toHaveBeenCalled();
  });

  // A banned administrator cannot sign in, so counting one as a survivor would
  // leave the panel unreachable.
  it('does not count banned administrators as remaining', async () => {
    userFindUnique.mockResolvedValue({
      id: USER_ID,
      email: 'target@example.com',
      role: 'admin',
    });

    await setPlatformRoleAction(USER_ID, false);

    expect(userCount).toHaveBeenCalledWith({
      where: {
        role: 'admin',
        banned: { not: true },
        id: { not: USER_ID },
      },
    });
  });

  it('does not count the person being demoted as remaining', async () => {
    userFindUnique.mockResolvedValue({
      id: USER_ID,
      email: 'target@example.com',
      role: 'admin',
    });

    await setPlatformRoleAction(USER_ID, false);

    expect(userCount.mock.calls[0][0].where.id).toEqual({ not: USER_ID });
  });

  it('does not count when promoting, which cannot lock anyone out', async () => {
    await setPlatformRoleAction(USER_ID, true);

    expect(userCount).not.toHaveBeenCalled();
  });

  it('refuses a caller that is not a platform administrator', async () => {
    requireAdmin.mockRejectedValue(new Error('Forbidden'));

    await expect(setPlatformRoleAction(USER_ID, true)).rejects.toThrow(
      /Forbidden/,
    );
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
