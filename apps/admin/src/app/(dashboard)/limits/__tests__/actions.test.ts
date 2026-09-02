import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const settingsFindUnique = vi.fn();
const settingsUpsert = vi.fn();
const orgSettingsUpsert = vi.fn();

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

// The sync helper is tested in src/lib/__tests__/litellm.test.ts; these tests
// only care that the action calls it with the right shape and surfaces what it
// returns.
const syncOrgToLiteLLM = vi.fn();
vi.mock('@/lib/litellm', () => ({
  syncOrgToLiteLLM: (...args: unknown[]) => syncOrgToLiteLLM(...args),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    settings: {
      findUnique: (...a: unknown[]) => settingsFindUnique(...a),
      upsert: (...a: unknown[]) => settingsUpsert(...a),
    },
    organizationSettings: {
      upsert: (...a: unknown[]) => orgSettingsUpsert(...a),
    },
  },
}));

const { getDefaultLimitsAction, saveDefaultLimitsAction, saveOrgLimitsAction } =
  await import('../actions');

const MB = 1024 * 1024;
const ORG_ID = 'org-1';

const FALLBACK = {
  storageLimitBytes: 50 * MB,
  projectStorageLimitBytes: 20 * MB,
  singleFileLimitBytes: 5 * MB,
  monthlyTokenLimit: null,
  monthlyCostLimitCents: null,
  monthlyMessageLimit: null,
  monthlyApiRequestLimit: 100,
  maxMembers: null,
};

const ORG_INPUT = {
  storageLimitMb: 100,
  projectStorageLimitMb: 50,
  singleFileLimitMb: 10,
  monthlyTokenLimit: 1_000_000,
  monthlyCostLimitCents: 5000,
  monthlyMessageLimit: 2000,
  monthlyApiRequestLimit: 500,
  maxMembers: 25,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: 'u1', email: 'a@b.c', name: 'A' });
  syncOrgToLiteLLM.mockResolvedValue({ ok: true, teamsUpdated: 2 });
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  process.env.LITELLM_PROXY_URL = 'http://litellm.test';
  process.env.LITELLM_MASTER_KEY = 'sk-master';
});

describe('getDefaultLimitsAction', () => {
  it('returns the built-in defaults when no row exists', async () => {
    settingsFindUnique.mockResolvedValue(null);
    await expect(getDefaultLimitsAction()).resolves.toEqual(FALLBACK);
  });

  it('returns the built-in defaults when the row is malformed JSON', async () => {
    settingsFindUnique.mockResolvedValue({ value: 'not-json' });
    await expect(getDefaultLimitsAction()).resolves.toEqual(FALLBACK);
  });

  it('returns the stored values', async () => {
    settingsFindUnique.mockResolvedValue({
      value: JSON.stringify({
        storageLimitBytes: 999,
        monthlyCostLimitCents: 1234,
      }),
    });

    await expect(getDefaultLimitsAction()).resolves.toMatchObject({
      storageLimitBytes: 999,
      monthlyCostLimitCents: 1234,
    });
  });

  /**
   * A partially written row must not silently drop the unset keys to
   * `undefined` — the form would then render blank fields and a save would
   * persist "unlimited" for limits the administrator never touched.
   */
  it('fills every missing key from the built-in defaults', async () => {
    settingsFindUnique.mockResolvedValue({
      value: JSON.stringify({ storageLimitBytes: 999 }),
    });

    const result = await getDefaultLimitsAction();

    expect(result.projectStorageLimitBytes).toBe(20 * MB);
    expect(result.monthlyApiRequestLimit).toBe(100);
    expect(Object.keys(result).sort()).toEqual(Object.keys(FALLBACK).sort());
  });
});

describe('saveDefaultLimitsAction', () => {
  it('stores the whole object under default_organization_limits', async () => {
    await saveDefaultLimitsAction(FALLBACK);

    expect(settingsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'default_organization_limits' },
        update: { value: JSON.stringify(FALLBACK) },
      }),
    );
  });
});

describe('saveOrgLimitsAction', () => {
  it('rejects a blank organization ID', async () => {
    await expect(saveOrgLimitsAction('   ', ORG_INPUT)).rejects.toThrow(
      /Invalid organization/,
    );
    expect(orgSettingsUpsert).not.toHaveBeenCalled();
  });

  // The form is in megabytes; the column is bytes.
  it('converts megabyte inputs to byte columns', async () => {
    await saveOrgLimitsAction(ORG_ID, ORG_INPUT);

    const { update } = orgSettingsUpsert.mock.calls[0][0];
    expect(update.storageLimitBytes).toBe(BigInt(100) * BigInt(MB));
    expect(update.projectStorageLimitBytes).toBe(BigInt(50) * BigInt(MB));
    expect(update.singleFileLimitBytes).toBe(BigInt(10) * BigInt(MB));
  });

  it('writes token limits as BigInt', async () => {
    await saveOrgLimitsAction(ORG_ID, ORG_INPUT);

    expect(orgSettingsUpsert.mock.calls[0][0].update.monthlyTokenLimit).toBe(
      BigInt(1_000_000),
    );
  });

  it('stores null for a cleared limit, which means unlimited', async () => {
    await saveOrgLimitsAction(ORG_ID, {
      ...ORG_INPUT,
      storageLimitMb: null,
      monthlyTokenLimit: null,
      maxMembers: null,
    });

    const { update } = orgSettingsUpsert.mock.calls[0][0];
    expect(update.storageLimitBytes).toBeNull();
    expect(update.monthlyTokenLimit).toBeNull();
    expect(update.maxMembers).toBeNull();
  });

  it('floors a fractional megabyte rather than writing a non-integer byte count', async () => {
    await saveOrgLimitsAction(ORG_ID, {
      ...ORG_INPUT,
      storageLimitMb: 1.7,
    });

    expect(orgSettingsUpsert.mock.calls[0][0].update.storageLimitBytes).toBe(
      BigInt(1) * BigInt(MB),
    );
  });

  it('creates the settings row when the organization has none', async () => {
    await saveOrgLimitsAction(ORG_ID, ORG_INPUT);

    const call = orgSettingsUpsert.mock.calls[0][0];
    expect(call.where).toEqual({ organizationId: ORG_ID });
    expect(call.create.organizationId).toBe(ORG_ID);
    expect(call.create.storageLimitBytes).toBe(BigInt(100) * BigInt(MB));
  });

  describe('LiteLLM budget sync', () => {
    it('sends the cost limit to the shared sync as dollars', async () => {
      await saveOrgLimitsAction(ORG_ID, {
        ...ORG_INPUT,
        monthlyCostLimitCents: 5000,
      });

      expect(syncOrgToLiteLLM).toHaveBeenCalledWith(ORG_ID, {
        maxBudget: 50,
      });
    });

    it('passes null when the limit is removed, which clears the budget', async () => {
      await saveOrgLimitsAction(ORG_ID, {
        ...ORG_INPUT,
        monthlyCostLimitCents: null,
      });

      expect(syncOrgToLiteLLM).toHaveBeenCalledWith(ORG_ID, {
        maxBudget: null,
      });
    });

    // Best-effort by design: the database is the source of truth and the app
    // enforces the cost limit itself. What changed is that the failure is now
    // returned instead of swallowed.
    it('still saves when the proxy is unreachable, and reports it', async () => {
      syncOrgToLiteLLM.mockResolvedValue({
        ok: false,
        reason: 'ECONNREFUSED',
        teamsUpdated: 0,
      });

      const result = await saveOrgLimitsAction(ORG_ID, ORG_INPUT);

      expect(orgSettingsUpsert).toHaveBeenCalled();
      expect(result).toEqual({
        ok: false,
        reason: 'ECONNREFUSED',
        teamsUpdated: 0,
      });
    });

    it('records the sync outcome in the audit entry', async () => {
      await saveOrgLimitsAction(ORG_ID, ORG_INPUT);

      expect(recordAdminAction.mock.calls[0][0].after.litellmSync).toEqual({
        ok: true,
        teamsUpdated: 2,
      });
    });
  });
});

describe('the platform-admin guard', () => {
  it.each([
    ['getDefaultLimitsAction', () => getDefaultLimitsAction()],
    ['saveDefaultLimitsAction', () => saveDefaultLimitsAction(FALLBACK)],
    ['saveOrgLimitsAction', () => saveOrgLimitsAction(ORG_ID, ORG_INPUT)],
  ])(
    '%s refuses a caller that is not a platform administrator',
    async (_name, call) => {
      requireAdmin.mockRejectedValue(new Error('Forbidden'));

      await expect(call()).rejects.toThrow(/Forbidden/);
      expect(settingsUpsert).not.toHaveBeenCalled();
      expect(orgSettingsUpsert).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
