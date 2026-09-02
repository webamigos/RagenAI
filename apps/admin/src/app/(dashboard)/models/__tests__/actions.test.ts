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
  requireAdmin.mockResolvedValue({ id: 'u1', email: 'a@b.c', name: 'A' });
  orgFindUnique.mockResolvedValue({ id: ORG_ID });
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  process.env.LITELLM_PROXY_URL = 'http://litellm.test';
  process.env.LITELLM_MASTER_KEY = 'sk-master';
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
    it('posts the allowlist to /team/update with the master key', async () => {
      await saveOrgAllowedModelsAction(ORG_ID, [VALID]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://litellm.test/team/update');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer sk-master');
      expect(JSON.parse(init.body)).toEqual({
        team_id: ORG_ID,
        models: [VALID],
      });
    });

    it('omits the Authorization header when no master key is configured', async () => {
      delete process.env.LITELLM_MASTER_KEY;
      await saveOrgAllowedModelsAction(ORG_ID, [VALID]);

      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
    });

    it('skips the call entirely when LITELLM_PROXY_URL is unset', async () => {
      delete process.env.LITELLM_PROXY_URL;
      await saveOrgAllowedModelsAction(ORG_ID, [VALID]);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(orgSettingsUpsert).toHaveBeenCalled();
    });

    // Best-effort by design: the database is the source of truth and
    // apps/web filters the picker itself, so a proxy outage must not lose the
    // administrator's edit.
    it('still saves when LiteLLM is unreachable', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        saveOrgAllowedModelsAction(ORG_ID, [VALID]),
      ).resolves.toBeUndefined();
      expect(orgSettingsUpsert).toHaveBeenCalled();
    });

    it('bounds the call with a timeout so a hung proxy cannot hang the action', async () => {
      await saveOrgAllowedModelsAction(ORG_ID, [VALID]);
      expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
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
