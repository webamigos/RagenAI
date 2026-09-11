import { beforeEach, describe, expect, it, vi } from 'vitest';

const settingsFindUnique = vi.fn();
const invitationFindFirst = vi.fn();
const userFindFirst = vi.fn();
const isInstallClaimed = vi.fn();

vi.mock('server-only', () => ({}));

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    settings: { findUnique: (...a: unknown[]) => settingsFindUnique(...a) },
    invitation: { findFirst: (...a: unknown[]) => invitationFindFirst(...a) },
    user: { findFirst: (...a: unknown[]) => userFindFirst(...a) },
  },
}));

// Mocked rather than driven through the shared `settings.findUnique` stub:
// the claim marker and the registration switch are two different rows in the
// same table, and one stub cannot answer both without every test having to
// know which key it is being asked about.
vi.mock('@/features/setup/services/install-claim', () => ({
  isInstallClaimed: () => isInstallClaimed(),
}));

async function load() {
  return import('../registration');
}

beforeEach(() => {
  vi.clearAllMocks();
  settingsFindUnique.mockResolvedValue(null);
  invitationFindFirst.mockResolvedValue(null);
  userFindFirst.mockResolvedValue(null);
  isInstallClaimed.mockResolvedValue(false);
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

describe('isUnclaimedEmptyInstall', () => {
  it('admits the first account on an install nobody has claimed', async () => {
    // The whole point: registration defaults to closed, so without this the
    // /initial-account screen can never create the admin that would open it.
    const { isUnclaimedEmptyInstall } = await load();

    await expect(isUnclaimedEmptyInstall()).resolves.toBe(true);
  });

  it('refuses once the install has been claimed', async () => {
    isInstallClaimed.mockResolvedValue(true);
    const { isUnclaimedEmptyInstall } = await load();

    await expect(isUnclaimedEmptyInstall()).resolves.toBe(false);
  });

  it('refuses as soon as any user row exists', async () => {
    // Belt and braces with the claim marker: deleting the last admin clears
    // neither this nor the marker, so a populated install can never reopen
    // the first-run door.
    userFindFirst.mockResolvedValue({ id: 'someone' });
    const { isUnclaimedEmptyInstall } = await load();

    await expect(isUnclaimedEmptyInstall()).resolves.toBe(false);
  });

  it('does not read the registration switch', async () => {
    // It is deliberately independent: the switch is closed on exactly the
    // install this exemption exists for.
    const { isUnclaimedEmptyInstall } = await load();
    await isUnclaimedEmptyInstall();

    expect(settingsFindUnique).not.toHaveBeenCalled();
  });
});
