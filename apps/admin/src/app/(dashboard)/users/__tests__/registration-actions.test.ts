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

// Complete, unlike the audit mock above, and that difference is load-bearing.
// `importOriginal` *executes* the real module, and `auth-guard` imports
// `./auth`, which builds the whole Better Auth instance — several hundred
// milliseconds of module graph, inside whichever test happens to import first.
// Idle that is ~540ms; under the parallel load `npm run verify` creates it
// reached 5.7s and blew the 5s default timeout, so this file failed roughly
// one run in ten with a timeout that named an assertion-free test.
//
// Nothing here needs the real module: the action imports `requireAdmin` and
// nothing else, and `audit.ts` takes only a `type` from it, which is erased.
// So the fix is to stop loading it rather than to wait longer for it.
vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

const auditLogCreate = vi.fn();
const securityEventCreate = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    settings: {
      findUnique: (...a: unknown[]) => settingsFindUnique(...a),
      upsert: (...a: unknown[]) => settingsUpsert(...a),
    },
    // The real audit helper writes to one of these two, and refuses a payload
    // that fits neither. The last test in this file exercises that.
    auditLog: { create: (...a: unknown[]) => auditLogCreate(...a) },
    securityEvent: { create: (...a: unknown[]) => securityEventCreate(...a) },
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

  it('gives the audit helper a destination it can actually write to', async () => {
    // This is the assertion whose absence let a live bug through.
    //
    // recordAdminAction throws when there is neither an organizationId nor a
    // securityEvent, on purpose — "silence is the bug". Registration belongs
    // to the installation, so it has no organization, and the first version
    // of this action passed neither. Every toggle wrote the setting and then
    // threw on the audit, so the panel reported "Nothing was modified" while
    // the value had in fact changed, and the Activity Log stayed empty.
    //
    // Mocking recordAdminAction is what hid it: the mock accepted a payload
    // the real helper refuses. The test below runs the real one.
    const { setRegistrationEnabledAction } = await loadActions();

    await setRegistrationEnabledAction(true);

    const call = recordAdminAction.mock.calls[0][0];
    expect(call.organizationId ?? call.securityEvent).toBeDefined();
    expect(call.securityEvent.eventType).toBe('ADMIN_SETTINGS_CHANGED');
  });

  it('files opening registration louder than closing it', async () => {
    // The incidents view filters on severity, and only one direction of this
    // switch is worth finding there.
    const { setRegistrationEnabledAction } = await loadActions();

    await setRegistrationEnabledAction(true);
    expect(recordAdminAction.mock.calls[0][0].securityEvent.severity).toBe(
      'warn',
    );

    recordAdminAction.mockClear();
    await setRegistrationEnabledAction(false);
    expect(recordAdminAction.mock.calls[0][0].securityEvent.severity).toBe(
      'info',
    );
  });

  it('revalidates the page it is rendered on', async () => {
    const { setRegistrationEnabledAction } = await loadActions();

    await setRegistrationEnabledAction(true);

    expect(revalidatePath).toHaveBeenCalledWith('/users');
  });
});

describe('the payload the action builds', () => {
  it('is one the real audit helper accepts', async () => {
    // The test that would have caught the live bug. Everything above mocks
    // recordAdminAction, so it accepts whatever it is handed; the real helper
    // throws when a payload has neither an organizationId nor a securityEvent,
    // and that is exactly what shipped.
    const audit =
      await vi.importActual<typeof import('@/lib/audit')>('@/lib/audit');

    const { setRegistrationEnabledAction } = await loadActions();
    await setRegistrationEnabledAction(true);
    const payload = recordAdminAction.mock.calls[0][0];

    await expect(audit.recordAdminAction(payload)).resolves.toBeUndefined();
    expect(securityEventCreate).toHaveBeenCalledTimes(1);
  });

  it('and the helper really does refuse one without a destination', async () => {
    // Guard on the guard: proves the assertion above is not vacuous.
    const audit =
      await vi.importActual<typeof import('@/lib/audit')>('@/lib/audit');

    const { setRegistrationEnabledAction } = await loadActions();
    await setRegistrationEnabledAction(true);
    const { securityEvent: _dropped, ...withoutDestination } =
      recordAdminAction.mock.calls[0][0];

    await expect(audit.recordAdminAction(withoutDestination)).rejects.toThrow(
      /no organizationId and no securityEvent/,
    );
  });
});
