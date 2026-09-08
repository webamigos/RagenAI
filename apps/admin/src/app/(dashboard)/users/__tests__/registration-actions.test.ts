import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const settingsFindUnique = vi.fn();
const settingsUpsert = vi.fn();
const recordAdminAction = vi.fn();
const revalidatePath = vi.fn();

// Partial, so the real ADMIN_ACTIONS map is used: a typo in the action name
// would otherwise pass silently, and the Activity Log filters on that string.
vi.mock('@/lib/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audit')>()),
  recordAdminAction: (...args: unknown[]) => recordAdminAction(...args),
}));

vi.mock('@/lib/auth-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth-guard')>()),
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    settings: {
      findUnique: (...a: unknown[]) => settingsFindUnique(...a),
      upsert: (...a: unknown[]) => settingsUpsert(...a),
    },
  },
}));

const ADMIN = { id: 'admin-1', email: 'admin@example.com' };

async function loadActions() {
  return import('../registration-actions');
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(ADMIN);
  settingsFindUnique.mockResolvedValue(null);
  settingsUpsert.mockResolvedValue({});
});

describe('getRegistrationEnabledAction', () => {
  it('reports closed when the installation has no row', async () => {
    const { getRegistrationEnabledAction } = await loadActions();

    await expect(getRegistrationEnabledAction()).resolves.toBe(false);
  });

  it("reports closed for a stored 'false'", async () => {
    settingsFindUnique.mockResolvedValue({ value: 'false' });
    const { getRegistrationEnabledAction } = await loadActions();

    await expect(getRegistrationEnabledAction()).resolves.toBe(false);
  });

  it("reports open only for a stored 'true'", async () => {
    settingsFindUnique.mockResolvedValue({ value: 'true' });
    const { getRegistrationEnabledAction } = await loadActions();

    await expect(getRegistrationEnabledAction()).resolves.toBe(true);
  });

  it('requires a platform administrator', async () => {
    requireAdmin.mockRejectedValue(new Error('Forbidden'));
    const { getRegistrationEnabledAction } = await loadActions();

    await expect(getRegistrationEnabledAction()).rejects.toThrow('Forbidden');
    expect(settingsFindUnique).not.toHaveBeenCalled();
  });
});

describe('setRegistrationEnabledAction', () => {
  it('stores the string form, not a boolean', async () => {
    // The Settings table is string key/value, and `Boolean('false')` is true —
    // so what gets written matters as much as what gets read.
    const { setRegistrationEnabledAction } = await loadActions();

    await setRegistrationEnabledAction(true);

    expect(settingsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'registration_enabled' },
        create: { key: 'registration_enabled', value: 'true' },
        update: { value: 'true' },
      }),
    );
  });

  it('stores false as the string false', async () => {
    const { setRegistrationEnabledAction } = await loadActions();

    await setRegistrationEnabledAction(false);

    expect(settingsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: 'false' } }),
    );
  });

  it('audits the change with the state on both sides', async () => {
    settingsFindUnique.mockResolvedValue({ value: 'false' });
    const { setRegistrationEnabledAction } = await loadActions();

    await setRegistrationEnabledAction(true);

    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        admin: ADMIN,
        action: 'admin.registration.toggled',
        entityType: 'settings',
        entityId: 'registration_enabled',
        before: { enabled: false },
        after: { enabled: true },
      }),
    );
  });

  it('records the previous state read before the write, not after', async () => {
    // Opening registration is the interesting transition, so `before` has to
    // be the value that was actually replaced.
    settingsFindUnique.mockResolvedValue({ value: 'true' });
    const { setRegistrationEnabledAction } = await loadActions();

    await setRegistrationEnabledAction(false);

    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        before: { enabled: true },
        after: { enabled: false },
      }),
    );
  });

  it('requires a platform administrator before writing anything', async () => {
    requireAdmin.mockRejectedValue(new Error('Forbidden'));
    const { setRegistrationEnabledAction } = await loadActions();

    await expect(setRegistrationEnabledAction(true)).rejects.toThrow(
      'Forbidden',
    );
    expect(settingsUpsert).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it('revalidates the page it is rendered on', async () => {
    const { setRegistrationEnabledAction } = await loadActions();

    await setRegistrationEnabledAction(true);

    expect(revalidatePath).toHaveBeenCalledWith('/users');
  });
});
