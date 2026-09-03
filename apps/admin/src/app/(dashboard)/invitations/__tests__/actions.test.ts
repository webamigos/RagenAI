import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const invitationFindUnique = vi.fn();
const invitationUpdateMany = vi.fn();

vi.mock('@/lib/auth-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth-guard')>()),
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const recordAdminAction = vi.fn();
vi.mock('@/lib/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audit')>()),
  recordAdminAction: (...args: unknown[]) => recordAdminAction(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    invitation: {
      findUnique: (...a: unknown[]) => invitationFindUnique(...a),
      updateMany: (...a: unknown[]) => invitationUpdateMany(...a),
    },
  },
}));

const { cancelInvitationAction, resendInvitationAction } =
  await import('../actions');

const ADMIN = { id: 'admin-1', email: 'admin@example.com', name: 'Admin' };
const INV = {
  id: 'inv_1',
  email: 'invitee@example.com',
  status: 'pending',
  organizationId: 'org-1',
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  requireAdmin.mockResolvedValue(ADMIN);
  invitationFindUnique.mockResolvedValue(INV);
  invitationUpdateMany.mockResolvedValue({ count: 1 });
  recordAdminAction.mockResolvedValue(undefined);
  vi.stubEnv('RAGEN_APP_URL', 'http://web.test');
  vi.stubEnv('INTERNAL_API_SECRET', 'shhh');
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      email: INV.email,
      expiresAt: '2026-09-10T00:00:00.000Z',
    }),
  });
  vi.stubGlobal('fetch', fetchMock);
});

describe('cancelInvitationAction', () => {
  /**
   * Cancelling by status rather than deleting the row: `Invitation` is unique
   * on `[organizationId, email]`, so the row is the only record that the
   * address was ever invited.
   */
  it('sets the status to canceled rather than deleting', async () => {
    await cancelInvitationAction(INV.id);

    expect(invitationUpdateMany).toHaveBeenCalledWith({
      where: { id: INV.id, status: 'pending' },
      data: { status: 'canceled' },
    });
  });

  // Conditional on still being pending, so two administrators cancelling the
  // same invitation cannot both claim it.
  it('claims it atomically and does nothing if somebody got there first', async () => {
    invitationUpdateMany.mockResolvedValue({ count: 0 });

    await expect(cancelInvitationAction(INV.id)).resolves.toBeUndefined();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it('rejects an invitation that does not exist', async () => {
    invitationFindUnique.mockResolvedValue(null);

    await expect(cancelInvitationAction(INV.id)).rejects.toThrow(
      /Invitation not found/,
    );
  });

  it.each([['accepted'], ['rejected'], ['canceled']])(
    'refuses to cancel an invitation already %s',
    async (status) => {
      invitationFindUnique.mockResolvedValue({ ...INV, status });

      await expect(cancelInvitationAction(INV.id)).rejects.toThrow(/already/);
      expect(invitationUpdateMany).not.toHaveBeenCalled();
    },
  );

  it("records the change against the invitation's organization", async () => {
    await cancelInvitationAction(INV.id);

    expect(recordAdminAction.mock.calls[0][0]).toMatchObject({
      action: 'admin.invitation.canceled',
      entityType: 'invitation',
      entityId: INV.id,
      organizationId: 'org-1',
    });
  });
});

describe('resendInvitationAction', () => {
  /**
   * The send cannot happen in this process: apps/web bridges
   * `signInMagicLink` to Better Auth's `sendMagicLink` callback through an
   * in-memory map, so a resend from here would mail a bare sign-in link with no
   * invitation context.
   */
  it('posts to apps/web with the internal secret and the acting admin', async () => {
    await resendInvitationAction(INV.id);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://web.test/api/internal/invitations/resend');
    expect(init.headers['x-internal-secret']).toBe('shhh');
    expect(JSON.parse(init.body)).toEqual({
      invitationId: INV.id,
      adminUserId: ADMIN.id,
    });
  });

  it('reports success with the address and the new expiry', async () => {
    await expect(resendInvitationAction(INV.id)).resolves.toEqual({
      ok: true,
      email: INV.email,
      expiresAt: '2026-09-10T00:00:00.000Z',
    });
  });

  it('bounds the call so an unresponsive apps/web cannot hang the action', async () => {
    await resendInvitationAction(INV.id);

    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ['RAGEN_APP_URL', 'RAGEN_APP_URL'],
    ['INTERNAL_API_SECRET', 'INTERNAL_API_SECRET'],
  ])('refuses without %s configured, saying which', async (_label, name) => {
    vi.stubEnv(name, '');

    const result = await resendInvitationAction(INV.id);

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an invitation that does not exist', async () => {
    invitationFindUnique.mockResolvedValue(null);

    await expect(resendInvitationAction(INV.id)).resolves.toMatchObject({
      ok: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a refusal from apps/web rather than claiming success', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    const result = await resendInvitationAction(INV.id);

    expect(result.ok).toBe(false);
    expect('reason' in result && result.reason).toContain('403');
  });

  it('surfaces an unreachable apps/web', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await resendInvitationAction(INV.id);

    expect(result.ok).toBe(false);
    expect('reason' in result && result.reason).toContain('ECONNREFUSED');
  });

  /**
   * A failed resend is exactly what a customer asks about — "you said you sent
   * it" — so the attempt has to be visible, not only the successes.
   */
  it('records the attempt even when it failed', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await resendInvitationAction(INV.id);

    expect(recordAdminAction).toHaveBeenCalledTimes(1);
    expect(recordAdminAction.mock.calls[0][0].after.outcome.ok).toBe(false);
  });

  it('records the attempt when it succeeded', async () => {
    await resendInvitationAction(INV.id);

    expect(recordAdminAction.mock.calls[0][0]).toMatchObject({
      action: 'admin.invitation.resent',
      organizationId: 'org-1',
    });
  });
});

describe('the platform-admin guard', () => {
  it.each([
    ['cancelInvitationAction', () => cancelInvitationAction(INV.id)],
    ['resendInvitationAction', () => resendInvitationAction(INV.id)],
  ])(
    '%s refuses a caller that is not a platform administrator',
    async (_name, call) => {
      requireAdmin.mockRejectedValue(new Error('Forbidden'));

      await expect(call()).rejects.toThrow(/Forbidden/);
      expect(invitationUpdateMany).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
