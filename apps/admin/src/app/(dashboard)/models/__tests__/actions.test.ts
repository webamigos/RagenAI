import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const settingsFindUnique = vi.fn();
const settingsUpsert = vi.fn();
const orgFindUnique = vi.fn();
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
    organization: { findUnique: (...a: unknown[]) => orgFindUnique(...a) },
    organizationSettings: {
      upsert: (...a: unknown[]) => orgSettingsUpsert(...a),
    },
  },
}));

const {
  getDefaultAllowedModelsAction,
  saveDefaultAllowedModelsAction,
  saveOrgAllowedModelsAction,
} = await import('../actions');
const { allModels } = await import('../models-config');

const VALID = allModels[0].value;
const ORG_ID = 'org-1';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  requireAdmin.mockResolvedValue({ id: 'u1', email: 'a@b.c', name: 'A' });
  orgFindUnique.mockResolvedValue({ id: ORG_ID });
  syncOrgToLiteLLM.mockResolvedValue({ ok: true, teamsUpdated: 2 });
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('LITELLM_PROXY_URL', 'http://litellm.test');
  vi.stubEnv('LITELLM_MASTER_KEY', 'sk-master');
});

describe('getDefaultAllowedModelsAction', () => {
  it('returns an empty list when the platform default was never set', async () => {
    settingsFindUnique.mockResolvedValue(null);
    await expect(getDefaultAllowedModelsAction()).resolves.toEqual([]);
  });

  it('parses the stored JSON array', async () => {
    settingsFindUnique.mockResolvedValue({ value: JSON.stringify([VALID]) });
    await expect(getDefaultAllowedModelsAction()).resolves.toEqual([VALID]);
  });

  // A hand-edited Settings row must not take the page down.
  it('falls back to an empty list on malformed JSON', async () => {
    settingsFindUnique.mockResolvedValue({ value: '{not json' });
    await expect(getDefaultAllowedModelsAction()).resolves.toEqual([]);
  });

  it('falls back to an empty list when the stored value is not an array', async () => {
    settingsFindUnique.mockResolvedValue({ value: '{"a":1}' });
    await expect(getDefaultAllowedModelsAction()).resolves.toEqual([]);
  });
});

describe('saveDefaultAllowedModelsAction', () => {
  it('stores a valid selection under default_allowed_models', async () => {
    await saveDefaultAllowedModelsAction([VALID]);

    expect(settingsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'default_allowed_models' },
        update: { value: JSON.stringify([VALID]) },
      }),
    );
  });

  it('accepts an empty selection, which means "no restriction"', async () => {
    await saveDefaultAllowedModelsAction([]);
    expect(settingsUpsert).toHaveBeenCalled();
  });

  /**
   * The regression this validation exists for: a value that is not a LiteLLM
   * model ID matches nothing in `getAvailableModelsForOrganization()`, so it
   * empties the model picker instead of restricting it.
   */
  it('rejects a provider-prefixed model ID', async () => {
    await expect(
      saveDefaultAllowedModelsAction(['openai/gpt-5.3-chat']),
    ).rejects.toThrow(/Invalid model/);
    expect(settingsUpsert).not.toHaveBeenCalled();
  });

  it('rejects an unknown model', async () => {
    await expect(
      saveDefaultAllowedModelsAction(['no-such-model']),
    ).rejects.toThrow(/Invalid model/);
  });

  it('rejects a non-string entry', async () => {
    await expect(
      saveDefaultAllowedModelsAction([42] as unknown as string[]),
    ).rejects.toThrow(/Invalid model/);
  });

  // Under the catalogue size, so the length check alone let it through.
  it('rejects an allowlist containing the same model twice', async () => {
    await expect(
      saveDefaultAllowedModelsAction([VALID, VALID]),
    ).rejects.toThrow(/Invalid model/);
    expect(settingsUpsert).not.toHaveBeenCalled();
  });

  it('rejects a list longer than the catalogue, so it cannot be used to bloat the row', async () => {
    const flood = Array.from({ length: allModels.length + 1 }, () => VALID);
    await expect(saveDefaultAllowedModelsAction(flood)).rejects.toThrow(
      /Invalid model/,
    );
  });
});

describe('saveOrgAllowedModelsAction', () => {
  it('upserts the organization allowlist', async () => {
    await saveOrgAllowedModelsAction(ORG_ID, [VALID]);

    expect(orgSettingsUpsert).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID },
      update: { allowedModels: [VALID] },
      create: { organizationId: ORG_ID, allowedModels: [VALID] },
    });
  });

  it('rejects a blank organization ID', async () => {
    await expect(saveOrgAllowedModelsAction('  ', [VALID])).rejects.toThrow(
      /Invalid organization/,
    );
    expect(orgSettingsUpsert).not.toHaveBeenCalled();
  });

  // Without this the upsert fails on a foreign key, which surfaces as an
  // opaque Prisma error rather than "Organization not found".
  it('rejects an organization that does not exist', async () => {
    orgFindUnique.mockResolvedValue(null);
    await expect(saveOrgAllowedModelsAction(ORG_ID, [VALID])).rejects.toThrow(
      /Organization not found/,
    );
    expect(orgSettingsUpsert).not.toHaveBeenCalled();
  });

  it('validates before it writes', async () => {
    await expect(
      saveOrgAllowedModelsAction(ORG_ID, ['anthropic/claude-sonnet-4.6']),
    ).rejects.toThrow(/Invalid model/);
    expect(orgSettingsUpsert).not.toHaveBeenCalled();
  });

  describe('LiteLLM sync', () => {
    it('hands the allowlist to the shared sync', async () => {
      await saveOrgAllowedModelsAction(ORG_ID, [VALID]);

      expect(syncOrgToLiteLLM).toHaveBeenCalledWith(ORG_ID, {
        models: [VALID],
      });
    });

    it('still saves when the proxy is unreachable, and reports it', async () => {
      syncOrgToLiteLLM.mockResolvedValue({
        ok: false,
        reason: 'ECONNREFUSED',
        teamsUpdated: 0,
      });

      const result = await saveOrgAllowedModelsAction(ORG_ID, [VALID]);

      expect(orgSettingsUpsert).toHaveBeenCalled();
      expect(result.ok).toBe(false);
    });

    it('records the sync outcome in the audit entry', async () => {
      await saveOrgAllowedModelsAction(ORG_ID, [VALID]);

      expect(recordAdminAction.mock.calls[0][0].after.litellmSync).toEqual({
        ok: true,
        teamsUpdated: 2,
      });
    });
  });
});

describe('the platform-admin guard', () => {
  it.each([
    ['getDefaultAllowedModelsAction', () => getDefaultAllowedModelsAction()],
    [
      'saveDefaultAllowedModelsAction',
      () => saveDefaultAllowedModelsAction([VALID]),
    ],
    [
      'saveOrgAllowedModelsAction',
      () => saveOrgAllowedModelsAction(ORG_ID, [VALID]),
    ],
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
