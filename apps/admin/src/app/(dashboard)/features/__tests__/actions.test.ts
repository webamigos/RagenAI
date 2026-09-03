import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const orgSettingsFindUnique = vi.fn();
const orgSettingsUpsert = vi.fn();
const planFindUnique = vi.fn();
const planUpdate = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/db', () => ({
  prisma: {
    organizationSettings: {
      findUnique: (...a: unknown[]) => orgSettingsFindUnique(...a),
      upsert: (...a: unknown[]) => orgSettingsUpsert(...a),
    },
    subscriptionPlan: {
      findUnique: (...a: unknown[]) => planFindUnique(...a),
      update: (...a: unknown[]) => planUpdate(...a),
    },
  },
}));

const {
  getOrgFeatureOverridesAction,
  saveOrgFeatureOverridesAction,
  getPlanFeaturesAction,
  savePlanFeaturesAction,
} = await import('../actions');

const ORG_ID = 'org-1';
const PLAN_ID = 'plan-1';

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: 'u1', email: 'a@b.c', name: 'A' });
});

describe('getOrgFeatureOverridesAction', () => {
  it('returns an empty object when the organization has no settings row', async () => {
    orgSettingsFindUnique.mockResolvedValue(null);
    await expect(getOrgFeatureOverridesAction(ORG_ID)).resolves.toEqual({});
  });

  it('returns an empty object when featureOverrides is null', async () => {
    orgSettingsFindUnique.mockResolvedValue({ featureOverrides: null });
    await expect(getOrgFeatureOverridesAction(ORG_ID)).resolves.toEqual({});
  });

  it('reads the stored booleans', async () => {
    orgSettingsFindUnique.mockResolvedValue({
      featureOverrides: { voiceInput: true, apiAccess: false },
    });

    await expect(getOrgFeatureOverridesAction(ORG_ID)).resolves.toEqual({
      voiceInput: true,
      apiAccess: false,
    });
  });

  /**
   * The column is untyped JSON, so a stale key left by an older release — or a
   * hand-written row — must not reach the form as a toggle nothing reads.
   */
  it('drops a key that is no longer a feature', async () => {
    orgSettingsFindUnique.mockResolvedValue({
      featureOverrides: { voiceInput: true, someRetiredFlag: true },
    });

    await expect(getOrgFeatureOverridesAction(ORG_ID)).resolves.toEqual({
      voiceInput: true,
    });
  });

  it('drops a value that is neither boolean nor null', async () => {
    orgSettingsFindUnique.mockResolvedValue({
      featureOverrides: { voiceInput: 'yes', apiAccess: true },
    });

    await expect(getOrgFeatureOverridesAction(ORG_ID)).resolves.toEqual({
      apiAccess: true,
    });
  });
});

describe('saveOrgFeatureOverridesAction', () => {
  it('rejects a blank organization ID', async () => {
    await expect(
      saveOrgFeatureOverridesAction('  ', { voiceInput: true }),
    ).rejects.toThrow(/Invalid organization/);
    expect(orgSettingsUpsert).not.toHaveBeenCalled();
  });

  it('stores explicit true and false', async () => {
    await saveOrgFeatureOverridesAction(ORG_ID, {
      voiceInput: true,
      apiAccess: false,
    });

    expect(orgSettingsUpsert.mock.calls[0][0].update).toEqual({
      featureOverrides: { voiceInput: true, apiAccess: false },
    });
  });

  // `null` is the tri-state "inherit from plan / code default". Persisting it
  // would make inherit indistinguishable from an explicit choice.
  it('strips an inherit (null) entry rather than storing it', async () => {
    await saveOrgFeatureOverridesAction(ORG_ID, {
      voiceInput: true,
      apiAccess: null,
    });

    expect(orgSettingsUpsert.mock.calls[0][0].update).toEqual({
      featureOverrides: { voiceInput: true },
    });
  });

  it('stores an empty object when every flag is set to inherit', async () => {
    await saveOrgFeatureOverridesAction(ORG_ID, {
      voiceInput: null,
      apiAccess: null,
    });

    expect(orgSettingsUpsert.mock.calls[0][0].update).toEqual({
      featureOverrides: {},
    });
  });

  it('ignores an unknown flag instead of writing it', async () => {
    await saveOrgFeatureOverridesAction(ORG_ID, {
      notAFeature: true,
    } as never);

    expect(orgSettingsUpsert.mock.calls[0][0].update).toEqual({
      featureOverrides: {},
    });
  });

  it('creates the settings row when the organization has none', async () => {
    await saveOrgFeatureOverridesAction(ORG_ID, { voiceInput: true });

    expect(orgSettingsUpsert.mock.calls[0][0].create).toEqual({
      organizationId: ORG_ID,
      featureOverrides: { voiceInput: true },
    });
  });
});

describe('getPlanFeaturesAction', () => {
  it('returns an empty object for a plan with no features', async () => {
    planFindUnique.mockResolvedValue({ features: null });
    await expect(getPlanFeaturesAction(PLAN_ID)).resolves.toEqual({});
  });

  it('returns an empty object for a plan that does not exist', async () => {
    planFindUnique.mockResolvedValue(null);
    await expect(getPlanFeaturesAction(PLAN_ID)).resolves.toEqual({});
  });

  it('keeps only known feature keys', async () => {
    planFindUnique.mockResolvedValue({
      features: { apiAccess: true, legacyFlag: false },
    });

    await expect(getPlanFeaturesAction(PLAN_ID)).resolves.toEqual({
      apiAccess: true,
    });
  });
});

describe('savePlanFeaturesAction', () => {
  it('stores explicit booleans on the plan', async () => {
    await savePlanFeaturesAction(PLAN_ID, {
      apiAccess: true,
      voiceInput: false,
    } as never);

    expect(planUpdate).toHaveBeenCalledWith({
      where: { id: PLAN_ID },
      data: { features: { apiAccess: true, voiceInput: false } },
    });
  });

  it('strips unset entries so the plan keeps no opinion on them', async () => {
    await savePlanFeaturesAction(PLAN_ID, {
      apiAccess: true,
      voiceInput: null,
    } as never);

    expect(planUpdate.mock.calls[0][0].data.features).toEqual({
      apiAccess: true,
    });
  });
});

describe('the platform-admin guard', () => {
  it.each([
    [
      'getOrgFeatureOverridesAction',
      () => getOrgFeatureOverridesAction(ORG_ID),
    ],
    [
      'saveOrgFeatureOverridesAction',
      () => saveOrgFeatureOverridesAction(ORG_ID, { voiceInput: true }),
    ],
    ['getPlanFeaturesAction', () => getPlanFeaturesAction(PLAN_ID)],
    [
      'savePlanFeaturesAction',
      () => savePlanFeaturesAction(PLAN_ID, { apiAccess: true } as never),
    ],
  ])(
    '%s refuses a caller that is not a platform administrator',
    async (_name, call) => {
      requireAdmin.mockRejectedValue(new Error('Forbidden'));

      await expect(call()).rejects.toThrow(/Forbidden/);
      expect(orgSettingsUpsert).not.toHaveBeenCalled();
      expect(planUpdate).not.toHaveBeenCalled();
    },
  );
});
