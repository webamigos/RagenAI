import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const orgFindUnique = vi.fn();
const orgUpdate = vi.fn();
const userFindUnique = vi.fn();
const memberFindUnique = vi.fn();
const memberCreate = vi.fn();
const memberDelete = vi.fn();
const memberUpdate = vi.fn();
const memberCount = vi.fn();
const teamFindMany = vi.fn();
const teamMemberUpsert = vi.fn();
const teamMemberDeleteMany = vi.fn();
const syncOrgMemberToLiteLLM = vi.fn();

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

vi.mock('@/lib/litellm', () => ({
  syncOrgMemberToLiteLLM: (...a: unknown[]) => syncOrgMemberToLiteLLM(...a),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    organization: {
      findUnique: (...a: unknown[]) => orgFindUnique(...a),
      update: (...a: unknown[]) => orgUpdate(...a),
    },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    member: {
      findUnique: (...a: unknown[]) => memberFindUnique(...a),
      create: (...a: unknown[]) => memberCreate(...a),
      delete: (...a: unknown[]) => memberDelete(...a),
      update: (...a: unknown[]) => memberUpdate(...a),
      count: (...a: unknown[]) => memberCount(...a),
    },
    team: { findMany: (...a: unknown[]) => teamFindMany(...a) },
    teamMember: {
      upsert: (...a: unknown[]) => teamMemberUpsert(...a),
      deleteMany: (...a: unknown[]) => teamMemberDeleteMany(...a),
    },
    // The membership writes run in one transaction; the callback receives a
    // client with the same surface, so hand it the same mocks.
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        member: {
          create: (...a: unknown[]) => memberCreate(...a),
          delete: (...a: unknown[]) => memberDelete(...a),
        },
        team: { findMany: (...a: unknown[]) => teamFindMany(...a) },
        teamMember: {
          upsert: (...a: unknown[]) => teamMemberUpsert(...a),
          deleteMany: (...a: unknown[]) => teamMemberDeleteMany(...a),
        },
      }),
  },
}));

const {
  renameOrgAction,
  changeOrgSlugAction,
  addOrgMemberAction,
  removeOrgMemberAction,
  changeOrgMemberRoleAction,
} = await import('../actions');

const ORG_ID = 'org-1';

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: 'u1', email: 'a@b.c', name: 'A' });
  orgFindUnique.mockResolvedValue(null);
  userFindUnique.mockResolvedValue({
    id: 'u-target',
    email: 'new@example.com',
  });
  memberFindUnique.mockResolvedValue(null);
  memberCount.mockResolvedValue(1);
  teamFindMany.mockResolvedValue([{ id: `${ORG_ID}-general` }]);
  teamMemberDeleteMany.mockResolvedValue({ count: 1 });
  syncOrgMemberToLiteLLM.mockResolvedValue({ ok: true, teamsUpdated: 1 });
});

describe('renameOrgAction', () => {
  it('trims the new name', async () => {
    await renameOrgAction(ORG_ID, '  Acme  ');

    expect(orgUpdate).toHaveBeenCalledWith({
      where: { id: ORG_ID },
      data: { name: 'Acme' },
    });
  });

  it('rejects a blank name', async () => {
    await expect(renameOrgAction(ORG_ID, '   ')).rejects.toThrow(
      /Name cannot be empty/,
    );
    expect(orgUpdate).not.toHaveBeenCalled();
  });
});

describe('changeOrgSlugAction', () => {
  // The slug appears in URLs; a mixed-case duplicate would be a different row
  // but the same address.
  it('lower-cases and trims the slug', async () => {
    await changeOrgSlugAction(ORG_ID, '  ACME-Corp  ');

    expect(orgUpdate).toHaveBeenCalledWith({
      where: { id: ORG_ID },
      data: { slug: 'acme-corp' },
    });
  });

  it('checks uniqueness against the normalised slug, not the raw input', async () => {
    await changeOrgSlugAction(ORG_ID, ' ACME ');

    expect(orgFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'acme' } }),
    );
  });

  it('rejects a slug already held by another organization', async () => {
    orgFindUnique.mockResolvedValue({ id: 'other-org' });

    await expect(changeOrgSlugAction(ORG_ID, 'taken')).rejects.toThrow(
      /already taken/,
    );
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  // Re-saving the form without changing the slug must not fail on itself.
  it('allows an organization to keep its own slug', async () => {
    orgFindUnique.mockResolvedValue({ id: ORG_ID });

    await expect(changeOrgSlugAction(ORG_ID, 'mine')).resolves.toBeUndefined();
    expect(orgUpdate).toHaveBeenCalledWith({
      where: { id: ORG_ID },
      data: { slug: 'mine' },
    });
  });

  it('clears the slug to null when the field is emptied', async () => {
    await changeOrgSlugAction(ORG_ID, '   ');

    expect(orgUpdate).toHaveBeenCalledWith({
      where: { id: ORG_ID },
      data: { slug: null },
    });
  });

  // The action also snapshots the old slug by id for the audit entry, so this
  // asserts the absence of the *uniqueness* lookup specifically — the one keyed
  // by slug, which has nothing to check when the slug is being cleared.
  it('skips the uniqueness lookup when clearing the slug', async () => {
    await changeOrgSlugAction(ORG_ID, '');

    const uniquenessLookups = orgFindUnique.mock.calls.filter(
      ([args]) => args?.where && 'slug' in args.where,
    );
    expect(uniquenessLookups).toEqual([]);
  });
});

describe('the platform-admin guard', () => {
  it.each([
    ['renameOrgAction', () => renameOrgAction(ORG_ID, 'X')],
    ['changeOrgSlugAction', () => changeOrgSlugAction(ORG_ID, 'x')],
  ])(
    '%s refuses a caller that is not a platform administrator',
    async (_name, call) => {
      requireAdmin.mockRejectedValue(new Error('Forbidden'));

      await expect(call()).rejects.toThrow(/Forbidden/);
      expect(orgUpdate).not.toHaveBeenCalled();
    },
  );
});

describe('addOrgMemberAction', () => {
  beforeEach(() => {
    orgFindUnique.mockResolvedValue({ id: ORG_ID });
  });

  it('creates the membership with the given role', async () => {
    await addOrgMemberAction(ORG_ID, 'new@example.com', 'member');

    expect(memberCreate.mock.calls[0][0].data).toMatchObject({
      organizationId: ORG_ID,
      userId: 'u-target',
      role: 'member',
    });
  });

  it('lower-cases and trims the e-mail before looking the account up', async () => {
    await addOrgMemberAction(ORG_ID, '  New@Example.COM  ', 'member');

    expect(userFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'new@example.com' } }),
    );
  });

  /**
   * This panel does not create accounts. apps/web's invitation flow and
   * `createMemberAccount` are the paths that do, and both involve the person.
   */
  it('refuses when no account exists for that address', async () => {
    userFindUnique.mockResolvedValue(null);

    await expect(
      addOrgMemberAction(ORG_ID, 'nobody@example.com', 'member'),
    ).rejects.toThrow(/No account exists/);
    expect(memberCreate).not.toHaveBeenCalled();
  });

  it('refuses a duplicate membership rather than hitting the unique constraint', async () => {
    memberFindUnique.mockResolvedValue({ id: 'm-1' });

    await expect(
      addOrgMemberAction(ORG_ID, 'new@example.com', 'member'),
    ).rejects.toThrow(/already a member/);
    expect(memberCreate).not.toHaveBeenCalled();
  });

  it('rejects an organization that does not exist', async () => {
    orgFindUnique.mockResolvedValue(null);

    await expect(
      addOrgMemberAction(ORG_ID, 'new@example.com', 'member'),
    ).rejects.toThrow(/Organization not found/);
  });

  it.each([['viewer'], ['OWNER'], ['']])(
    'rejects the role %s',
    async (role) => {
      await expect(
        addOrgMemberAction(ORG_ID, 'new@example.com', role),
      ).rejects.toThrow(/Invalid organization role|E-mail is required/);
    },
  );

  it('rejects a blank e-mail', async () => {
    await expect(addOrgMemberAction(ORG_ID, '   ', 'member')).rejects.toThrow(
      /E-mail is required/,
    );
  });

  /**
   * Team membership is what LiteLLM routes on — `resolveLiteLLMKeyQuery` prefers
   * a team key, and a member in no team falls back to the organization key.
   */
  it('joins the member to every team in the organization', async () => {
    teamFindMany.mockResolvedValue([{ id: 't-1' }, { id: 't-2' }]);

    await addOrgMemberAction(ORG_ID, 'new@example.com', 'member');

    expect(teamMemberUpsert).toHaveBeenCalledTimes(2);
    expect(
      teamMemberUpsert.mock.calls.map(([c]) => c.where.teamId_userId.teamId),
    ).toEqual(['t-1', 't-2']);
  });

  // Upsert rather than create: a stale TeamMember row would otherwise make
  // adding a previously-removed member fail on the unique constraint.
  it('upserts team membership so a re-added member does not collide', async () => {
    await addOrgMemberAction(ORG_ID, 'new@example.com', 'member');

    expect(teamMemberUpsert.mock.calls[0][0].update).toEqual({});
  });

  it('syncs the member to LiteLLM and reports the outcome', async () => {
    const result = await addOrgMemberAction(
      ORG_ID,
      'new@example.com',
      'member',
    );

    expect(syncOrgMemberToLiteLLM).toHaveBeenCalledWith(
      ORG_ID,
      { userId: 'u-target', userEmail: 'new@example.com' },
      'add',
    );
    expect(result).toEqual({ ok: true, teamsUpdated: 1 });
  });

  it('still adds the member when the proxy is unreachable', async () => {
    syncOrgMemberToLiteLLM.mockResolvedValue({
      ok: false,
      reason: 'ECONNREFUSED',
      teamsUpdated: 0,
    });

    const result = await addOrgMemberAction(
      ORG_ID,
      'new@example.com',
      'member',
    );

    expect(memberCreate).toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });
});

describe('removeOrgMemberAction', () => {
  beforeEach(() => {
    memberFindUnique.mockResolvedValue({
      id: 'm-1',
      role: 'member',
      user: { email: 'leaving@example.com' },
    });
  });

  it('deletes the membership', async () => {
    await removeOrgMemberAction(ORG_ID, 'u-target');

    expect(memberDelete).toHaveBeenCalledWith({ where: { id: 'm-1' } });
  });

  // A team key keeps working for whoever holds it, so team membership must not
  // outlive organization membership.
  it("removes the account from the organization's teams too", async () => {
    await removeOrgMemberAction(ORG_ID, 'u-target');

    expect(teamMemberDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-target', team: { organizationId: ORG_ID } },
    });
  });

  it('syncs the removal to LiteLLM', async () => {
    await removeOrgMemberAction(ORG_ID, 'u-target');

    expect(syncOrgMemberToLiteLLM).toHaveBeenCalledWith(
      ORG_ID,
      { userId: 'u-target', userEmail: 'leaving@example.com' },
      'remove',
    );
  });

  it('refuses when the account is not a member', async () => {
    memberFindUnique.mockResolvedValue(null);

    await expect(removeOrgMemberAction(ORG_ID, 'u-target')).rejects.toThrow(
      /not a member/,
    );
    expect(memberDelete).not.toHaveBeenCalled();
  });

  /**
   * Only `owner` can transfer ownership or delete an organization, so an
   * organization with none cannot be administered by its own members — and this
   * panel is the only way back.
   */
  it('refuses to remove the last owner', async () => {
    memberFindUnique.mockResolvedValue({
      id: 'm-1',
      role: 'owner',
      user: { email: 'owner@example.com' },
    });
    memberCount.mockResolvedValue(0);

    await expect(removeOrgMemberAction(ORG_ID, 'u-target')).rejects.toThrow(
      /last owner/i,
    );
    expect(memberDelete).not.toHaveBeenCalled();
  });

  it('allows removing an owner when another one remains', async () => {
    memberFindUnique.mockResolvedValue({
      id: 'm-1',
      role: 'owner',
      user: { email: 'owner@example.com' },
    });
    memberCount.mockResolvedValue(1);

    await expect(
      removeOrgMemberAction(ORG_ID, 'u-target'),
    ).resolves.toBeTruthy();
  });

  it('does not count the member being removed as a remaining owner', async () => {
    memberFindUnique.mockResolvedValue({
      id: 'm-1',
      role: 'owner',
      user: { email: 'owner@example.com' },
    });

    await removeOrgMemberAction(ORG_ID, 'u-target');

    expect(memberCount).toHaveBeenCalledWith({
      where: {
        organizationId: ORG_ID,
        role: 'owner',
        userId: { not: 'u-target' },
      },
    });
  });

  it('does not check ownership when removing a plain member', async () => {
    await removeOrgMemberAction(ORG_ID, 'u-target');

    expect(memberCount).not.toHaveBeenCalled();
  });
});

describe('changeOrgMemberRoleAction', () => {
  beforeEach(() => {
    memberFindUnique.mockResolvedValue({
      id: 'm-1',
      role: 'member',
      user: { email: 'someone@example.com' },
    });
  });

  it('updates the role', async () => {
    await changeOrgMemberRoleAction(ORG_ID, 'u-target', 'admin');

    expect(memberUpdate).toHaveBeenCalledWith({
      where: { id: 'm-1' },
      data: { role: 'admin' },
    });
  });

  it('does nothing when the role already matches', async () => {
    await changeOrgMemberRoleAction(ORG_ID, 'u-target', 'member');

    expect(memberUpdate).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it('refuses to demote the last owner', async () => {
    memberFindUnique.mockResolvedValue({
      id: 'm-1',
      role: 'owner',
      user: { email: 'owner@example.com' },
    });
    memberCount.mockResolvedValue(0);

    await expect(
      changeOrgMemberRoleAction(ORG_ID, 'u-target', 'admin'),
    ).rejects.toThrow(/last owner/i);
    expect(memberUpdate).not.toHaveBeenCalled();
  });

  it('allows promoting somebody to owner without an ownership check', async () => {
    await changeOrgMemberRoleAction(ORG_ID, 'u-target', 'owner');

    expect(memberCount).not.toHaveBeenCalled();
    expect(memberUpdate.mock.calls[0][0].data).toEqual({ role: 'owner' });
  });

  it('rejects an unknown role', async () => {
    await expect(
      changeOrgMemberRoleAction(ORG_ID, 'u-target', 'superuser'),
    ).rejects.toThrow(/Invalid organization role/);
  });
});

describe('the platform-admin guard on membership', () => {
  it.each([
    ['addOrgMemberAction', () => addOrgMemberAction(ORG_ID, 'a@b.c', 'member')],
    ['removeOrgMemberAction', () => removeOrgMemberAction(ORG_ID, 'u-1')],
    [
      'changeOrgMemberRoleAction',
      () => changeOrgMemberRoleAction(ORG_ID, 'u-1', 'admin'),
    ],
  ])(
    '%s refuses a caller that is not a platform administrator',
    async (_name, call) => {
      requireAdmin.mockRejectedValue(new Error('Forbidden'));

      await expect(call()).rejects.toThrow(/Forbidden/);
      expect(memberCreate).not.toHaveBeenCalled();
      expect(memberDelete).not.toHaveBeenCalled();
      expect(memberUpdate).not.toHaveBeenCalled();
    },
  );
});

describe('membership writes are atomic', () => {
  beforeEach(() => {
    orgFindUnique.mockResolvedValue({ id: ORG_ID });
  });

  /**
   * A `Member` row with no `TeamMember` rows is the exact failure this action
   * exists to avoid: `resolveLiteLLMKeyQuery` prefers a team key, so such a
   * member silently falls back to the organization key and their usage lands
   * against the wrong budget.
   */
  it('adds the member and joins the teams in one transaction', async () => {
    await addOrgMemberAction(ORG_ID, 'new@example.com', 'member');

    expect(memberCreate).toHaveBeenCalled();
    expect(teamMemberUpsert).toHaveBeenCalled();
  });

  it('removes the member and their team rows in one transaction', async () => {
    memberFindUnique.mockResolvedValue({
      id: 'm-1',
      role: 'member',
      user: { email: 'leaving@example.com' },
    });

    await removeOrgMemberAction(ORG_ID, 'u-target');

    expect(memberDelete).toHaveBeenCalled();
    expect(teamMemberDeleteMany).toHaveBeenCalled();
  });
});
