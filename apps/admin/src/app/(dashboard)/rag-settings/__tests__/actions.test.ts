import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const settingsFindUnique = vi.fn();
const settingsUpsert = vi.fn();
const orgSettingsUpsert = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

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

const {
  getDefaultRagSettingsAction,
  saveDefaultRagSettingsAction,
  saveOrgRagSettingsAction,
} = await import('../actions');

const ORG_ID = 'org-1';

const ALL_ON = {
  multiQueryEnabled: true,
  docSummariesEnabled: true,
  contentModerationEnabled: true,
  rerankingEnabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: 'u1', email: 'a@b.c', name: 'A' });
});

describe('getDefaultRagSettingsAction', () => {
  // Every stage of the pipeline ships on; a missing row must not read as "off".
  it('defaults every stage to enabled when no row exists', async () => {
    settingsFindUnique.mockResolvedValue(null);
    await expect(getDefaultRagSettingsAction()).resolves.toEqual(ALL_ON);
  });

  it('defaults every stage to enabled on malformed JSON', async () => {
    settingsFindUnique.mockResolvedValue({ value: 'nope' });
    await expect(getDefaultRagSettingsAction()).resolves.toEqual(ALL_ON);
  });

  it('reads the stored values', async () => {
    settingsFindUnique.mockResolvedValue({
      value: JSON.stringify({ ...ALL_ON, rerankingEnabled: false }),
    });

    await expect(getDefaultRagSettingsAction()).resolves.toEqual({
      ...ALL_ON,
      rerankingEnabled: false,
    });
  });

  it('fills a key missing from a partially written row with its default', async () => {
    settingsFindUnique.mockResolvedValue({
      value: JSON.stringify({ multiQueryEnabled: false }),
    });

    await expect(getDefaultRagSettingsAction()).resolves.toEqual({
      ...ALL_ON,
      multiQueryEnabled: false,
    });
  });
});

describe('saveDefaultRagSettingsAction', () => {
  it('stores all four flags under default_rag_pipeline_settings', async () => {
    await saveDefaultRagSettingsAction({ ...ALL_ON, multiQueryEnabled: false });

    expect(settingsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'default_rag_pipeline_settings' },
        update: {
          value: JSON.stringify({ ...ALL_ON, multiQueryEnabled: false }),
        },
      }),
    );
  });

  /**
   * The columns are non-null booleans. A missing or non-boolean flag would
   * either fail at the database or, worse, be coerced — silently changing
   * whether a retrieval stage runs.
   */
  it.each([
    ['a missing flag', { multiQueryEnabled: true }],
    ['a string instead of a boolean', { ...ALL_ON, rerankingEnabled: 'true' }],
    ['null', null],
    ['a non-object', 'all-on'],
  ])('rejects %s', async (_label, input) => {
    await expect(saveDefaultRagSettingsAction(input as never)).rejects.toThrow(
      /Invalid RAG settings/,
    );
    expect(settingsUpsert).not.toHaveBeenCalled();
  });

  it('stores only the four known flags, dropping anything extra', async () => {
    await saveDefaultRagSettingsAction({
      ...ALL_ON,
      somethingElse: true,
    } as never);

    expect(JSON.parse(settingsUpsert.mock.calls[0][0].update.value)).toEqual(
      ALL_ON,
    );
  });
});

describe('saveOrgRagSettingsAction', () => {
  it('rejects a blank organization ID', async () => {
    await expect(saveOrgRagSettingsAction('', ALL_ON)).rejects.toThrow(
      /Invalid organization/,
    );
    expect(orgSettingsUpsert).not.toHaveBeenCalled();
  });

  it('writes each flag to its own column', async () => {
    await saveOrgRagSettingsAction(ORG_ID, {
      ...ALL_ON,
      contentModerationEnabled: false,
    });

    expect(orgSettingsUpsert.mock.calls[0][0].update).toEqual({
      multiQueryEnabled: true,
      docSummariesEnabled: true,
      contentModerationEnabled: false,
      rerankingEnabled: true,
    });
  });

  it('creates the settings row when the organization has none', async () => {
    await saveOrgRagSettingsAction(ORG_ID, ALL_ON);

    expect(orgSettingsUpsert.mock.calls[0][0].create).toEqual({
      organizationId: ORG_ID,
      ...ALL_ON,
    });
  });

  it('validates before it writes', async () => {
    await expect(
      saveOrgRagSettingsAction(ORG_ID, { multiQueryEnabled: true } as never),
    ).rejects.toThrow(/Invalid RAG settings/);
    expect(orgSettingsUpsert).not.toHaveBeenCalled();
  });
});

describe('the platform-admin guard', () => {
  it.each([
    ['getDefaultRagSettingsAction', () => getDefaultRagSettingsAction()],
    [
      'saveDefaultRagSettingsAction',
      () => saveDefaultRagSettingsAction(ALL_ON),
    ],
    [
      'saveOrgRagSettingsAction',
      () => saveOrgRagSettingsAction(ORG_ID, ALL_ON),
    ],
  ])(
    '%s refuses a caller that is not a platform administrator',
    async (_name, call) => {
      requireAdmin.mockRejectedValue(new Error('Forbidden'));

      await expect(call()).rejects.toThrow(/Forbidden/);
      expect(settingsUpsert).not.toHaveBeenCalled();
      expect(orgSettingsUpsert).not.toHaveBeenCalled();
    },
  );
});
