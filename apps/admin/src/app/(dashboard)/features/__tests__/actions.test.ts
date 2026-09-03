import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const orgSettingsFindUnique = vi.fn();
const orgSettingsUpsert = vi.fn();
const planFindUnique = vi.fn();
const planUpdate = vi.fn();

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

const settingsFindUnique = vi.fn();
const settingsUpsert = vi.fn();
const subscriptionFindMany = vi.fn();
const planFindFirst = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    organizationSettings: {
      findUnique: (...a: unknown[]) => orgSettingsFindUnique(...a),
      upsert: (...a: unknown[]) => orgSettingsUpsert(...a),
    },
    subscriptionPlan: {
      findUnique: (...a: unknown[]) => planFindUnique(...a),
      findFirst: (...a: unknown[]) => planFindFirst(...a),
      update: (...a: unknown[]) => planUpdate(...a),
    },
    settings: {
      findUnique: (...a: unknown[]) => settingsFindUnique(...a),
      upsert: (...a: unknown[]) => settingsUpsert(...a),
    },
    subscription: {
      findMany: (...a: unknown[]) => subscriptionFindMany(...a),
    },
  },
}));

const {
  getOrgFeatureOverridesAction,
  saveOrgFeatureOverridesAction,
  getPlanFeaturesAction,
  savePlanFeaturesAction,
  getPlatformFeatureDefaultsAction,
  savePlatformFeatureDefaultsAction,
  getOrgFeatureResolutionAction,
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

describe('platform feature defaults', () => {
  beforeEach(() => {
    settingsFindUnique.mockResolvedValue(null);
    settingsUpsert.mockResolvedValue({});
    subscriptionFindMany.mockResolvedValue([]);
    planFindFirst.mockResolvedValue(null);
    orgSettingsFindUnique.mockResolvedValue(null);
  });

  it('reads an empty map when nothing has been saved', async () => {
    await expect(getPlatformFeatureDefaultsAction()).resolves.toEqual({});
  });

  it('parses a saved row', async () => {
    settingsFindUnique.mockResolvedValue({
      key: 'default_features',
      value: '{"apiAccess":false,"voiceInput":true}',
    });

    await expect(getPlatformFeatureDefaultsAction()).resolves.toEqual({
      apiAccess: false,
      voiceInput: true,
    });
  });

  /**
   * A hand-edited row that will not parse must not decide a gate. Inheriting
   * is the safe reading — it lands on the built-in defaults.
   */
  it('inherits rather than throwing on unparseable JSON', async () => {
    settingsFindUnique.mockResolvedValue({
      key: 'default_features',
      value: 'not json at all',
    });

    await expect(getPlatformFeatureDefaultsAction()).resolves.toEqual({});
  });

  it('stores only explicit booleans, expressing inherit as absence', async () => {
    await savePlatformFeatureDefaultsAction({
      apiAccess: true,
      voiceInput: false,
      publicChatbot: null,
    });

    const [args] = settingsUpsert.mock.calls[0]!;
    expect(JSON.parse(args.update.value)).toEqual({
      apiAccess: true,
      voiceInput: false,
    });
  });

  it('drops keys that are not features', async () => {
    await savePlatformFeatureDefaultsAction({
      apiAccess: true,
      legacyFlag: true,
    } as never);

    const [args] = settingsUpsert.mock.calls[0]!;
    expect(JSON.parse(args.update.value)).toEqual({ apiAccess: true });
  });

  it('records the change as a platform settings event', async () => {
    await savePlatformFeatureDefaultsAction({ apiAccess: false });

    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.defaults.features_changed',
        entityType: 'settings',
        entityId: 'default_features',
        securityEvent: {
          eventType: 'ADMIN_SETTINGS_CHANGED',
          severity: 'warn',
        },
      }),
    );
  });
});

describe('getOrgFeatureResolutionAction', () => {
  beforeEach(() => {
    settingsFindUnique.mockResolvedValue(null);
    subscriptionFindMany.mockResolvedValue([]);
    planFindFirst.mockResolvedValue(null);
    orgSettingsFindUnique.mockResolvedValue(null);
  });

  it('reports the built-in default when nothing is configured', async () => {
    const resolved = await getOrgFeatureResolutionAction(ORG_ID);

    expect(resolved.apiAccess).toEqual({
      value: true,
      source: 'code-default',
    });
  });

  it('reports the platform default when only that is set', async () => {
    settingsFindUnique.mockResolvedValue({
      key: 'default_features',
      value: '{"inviteMembers":true}',
    });

    const resolved = await getOrgFeatureResolutionAction(ORG_ID);

    expect(resolved.inviteMembers).toEqual({
      value: true,
      source: 'platform-default',
    });
  });

  /**
   * The case the panel could not previously show. Here the organization
   * override says on and the plan says off; the override wins, so the plan's
   * value is being shadowed. Before this view, those two settings looked
   * identical from the panel — an operator could not tell which one was
   * actually deciding.
   */
  it('reports the organization override as the decider when it is set', async () => {
    orgSettingsFindUnique.mockResolvedValue({
      featureOverrides: { publicChatbot: true },
    });
    subscriptionFindMany.mockResolvedValue([{ plan: 'Pro', status: 'active' }]);
    planFindFirst.mockResolvedValue({ features: { publicChatbot: false } });

    const resolved = await getOrgFeatureResolutionAction(ORG_ID);

    expect(resolved.publicChatbot).toEqual({
      value: true,
      source: 'org-override',
    });
  });

  it('reports the plan when there is no override', async () => {
    subscriptionFindMany.mockResolvedValue([
      { plan: 'Pro', status: 'trialing' },
    ]);
    planFindFirst.mockResolvedValue({ features: { apiAccess: false } });

    const resolved = await getOrgFeatureResolutionAction(ORG_ID);

    expect(resolved.apiAccess).toEqual({ value: false, source: 'plan' });
  });

  it('ignores a cancelled subscription', async () => {
    subscriptionFindMany.mockResolvedValue([
      { plan: 'Pro', status: 'canceled' },
    ]);

    const resolved = await getOrgFeatureResolutionAction(ORG_ID);

    expect(planFindFirst).not.toHaveBeenCalled();
    expect(resolved.apiAccess.source).toBe('code-default');
  });
});
