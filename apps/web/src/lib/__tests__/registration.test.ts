import { beforeEach, describe, expect, it, vi } from 'vitest';

const settingsFindUnique = vi.fn();
const invitationFindFirst = vi.fn();

vi.mock('server-only', () => ({}));

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    settings: { findUnique: (...a: unknown[]) => settingsFindUnique(...a) },
    invitation: { findFirst: (...a: unknown[]) => invitationFindFirst(...a) },
  },
}));

async function load() {
  return import('../registration');
}

beforeEach(() => {
  vi.clearAllMocks();
  settingsFindUnique.mockResolvedValue(null);
  invitationFindFirst.mockResolvedValue(null);
});

describe('isRegistrationOpen', () => {
  it('is closed on an installation that has never decided', async () => {
    const { isRegistrationOpen } = await load();

    await expect(isRegistrationOpen()).resolves.toBe(false);
  });

  it("is closed for a stored 'false'", async () => {
    settingsFindUnique.mockResolvedValue({ value: 'false' });
    const { isRegistrationOpen } = await load();

    await expect(isRegistrationOpen()).resolves.toBe(false);
  });

  it("is open for a stored 'true'", async () => {
    settingsFindUnique.mockResolvedValue({ value: 'true' });
    const { isRegistrationOpen } = await load();

    await expect(isRegistrationOpen()).resolves.toBe(true);
  });

  it('reads the key the admin panel writes', async () => {
    const { isRegistrationOpen } = await load();
    await isRegistrationOpen();

    expect(settingsFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'registration_enabled' } }),
    );
  });
});

describe('hasPendingInvitation', () => {
  it('matches on the lowercased address', async () => {
    // The invitation row stores a lowercase email, and sign-up forms do not.
    // The `create.after` hook already compares this way; both have to agree,
    // or a sign-up allowed here would be unrecognised there and the user
    // would land in an organization of their own.
    const { hasPendingInvitation } = await load();

    await hasPendingInvitation('Someone@Example.COM');

    expect(invitationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ email: 'someone@example.com' }),
      }),
    );
  });

  it('only counts a pending, unexpired invitation', async () => {
    const { hasPendingInvitation } = await load();

    await hasPendingInvitation('a@b.com');

    const where = invitationFindFirst.mock.calls[0][0].where;
    expect(where.status).toBe('pending');
    expect(where.expiresAt).toEqual({ gt: expect.any(Date) });
  });

  it('is false when nothing matches', async () => {
    const { hasPendingInvitation } = await load();

    await expect(hasPendingInvitation('a@b.com')).resolves.toBe(false);
  });

  it('is true when a row comes back', async () => {
    invitationFindFirst.mockResolvedValue({ id: 'inv-1' });
    const { hasPendingInvitation } = await load();

    await expect(hasPendingInvitation('a@b.com')).resolves.toBe(true);
  });
});

describe('mayRegister', () => {
  it('admits anyone while registration is open', async () => {
    settingsFindUnique.mockResolvedValue({ value: 'true' });
    const { mayRegister } = await load();

    await expect(mayRegister('stranger@example.com')).resolves.toBe(true);
    await expect(mayRegister(undefined)).resolves.toBe(true);
    // No need to look for an invitation once the door is open.
    expect(invitationFindFirst).not.toHaveBeenCalled();
  });

  it('admits an invited address while registration is closed', async () => {
    // The decision behind the whole feature: closing registration stops
    // strangers, not a colleague accepting an invitation deliberately sent.
    invitationFindFirst.mockResolvedValue({ id: 'inv-1' });
    const { mayRegister } = await load();

    await expect(mayRegister('invited@example.com')).resolves.toBe(true);
  });

  it('refuses an uninvited address while registration is closed', async () => {
    const { mayRegister } = await load();

    await expect(mayRegister('stranger@example.com')).resolves.toBe(false);
  });

  it('refuses when there is no address to check at all', async () => {
    const { mayRegister } = await load();

    await expect(mayRegister(undefined)).resolves.toBe(false);
    await expect(mayRegister(null)).resolves.toBe(false);
    await expect(mayRegister('')).resolves.toBe(false);
  });
});
