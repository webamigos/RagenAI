import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSettingsFindUnique = vi.fn();
const mockSubscriptionFindMany = vi.fn();
const mockPlanFindFirst = vi.fn();
/** `Settings.default_features` — the platform-default layer from ADR-35. */
const mockPlatformSettingsFindUnique = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    organizationSettings: {
      findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args),
    },
    subscription: {
      findMany: (...args: unknown[]) => mockSubscriptionFindMany(...args),
    },
    subscriptionPlan: {
      findFirst: (...args: unknown[]) => mockPlanFindFirst(...args),
    },
    settings: {
      findUnique: (...args: unknown[]) =>
        mockPlatformSettingsFindUnique(...args),
    },
  },
}));

import {
  getEffectiveFeaturesQuery,
  isFeatureEnabledQuery,
} from '../get-effective-features-query';
import { DEFAULT_FEATURES } from '../../../contracts/features.types';

const ORG = 'org-1';

describe('getEffectiveFeaturesQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsFindUnique.mockResolvedValue(null);
    mockSubscriptionFindMany.mockResolvedValue([]);
    mockPlanFindFirst.mockResolvedValue(null);
    mockPlatformSettingsFindUnique.mockResolvedValue(null);
  });

  it('returns code defaults when no plan and no overrides', async () => {
    const result = await getEffectiveFeaturesQuery(ORG);
    expect(result).toEqual(DEFAULT_FEATURES);
  });

  it('applies plan features over defaults', async () => {
    mockSubscriptionFindMany.mockResolvedValue([
      { plan: 'Pro', status: 'active', periodStart: new Date() },
    ]);
    mockPlanFindFirst.mockResolvedValue({
      features: { inviteMembers: true, customAssistantTemplates: false },
    });

    const result = await getEffectiveFeaturesQuery(ORG);
    expect(result.inviteMembers).toBe(true);
    expect(result.customAssistantTemplates).toBe(false);
    expect(result.publicChatbot).toBe(DEFAULT_FEATURES.publicChatbot);
  });

  it('ignores plan features when subscription is canceled', async () => {
    mockSubscriptionFindMany.mockResolvedValue([
      { plan: 'Pro', status: 'canceled', periodStart: new Date() },
    ]);
    mockPlanFindFirst.mockResolvedValue({
      features: { inviteMembers: true },
    });

    const result = await getEffectiveFeaturesQuery(ORG);
    expect(result.inviteMembers).toBe(DEFAULT_FEATURES.inviteMembers);
  });

  it('honors trialing status as active for features', async () => {
    mockSubscriptionFindMany.mockResolvedValue([
      { plan: 'Trial', status: 'trialing', periodStart: new Date() },
    ]);
    mockPlanFindFirst.mockResolvedValue({
      features: { inviteMembers: true },
    });

    const result = await getEffectiveFeaturesQuery(ORG);
    expect(result.inviteMembers).toBe(true);
  });

  it('override wins over plan and default', async () => {
    mockSubscriptionFindMany.mockResolvedValue([
      { plan: 'Pro', status: 'active', periodStart: new Date() },
    ]);
    mockPlanFindFirst.mockResolvedValue({
      features: { apiAccess: false },
    });
    mockSettingsFindUnique.mockResolvedValue({
      featureOverrides: { apiAccess: true, inviteMembers: true },
    });

    const result = await getEffectiveFeaturesQuery(ORG);
    expect(result.apiAccess).toBe(true);
    expect(result.inviteMembers).toBe(true);
  });

  it('override null falls through to plan/default', async () => {
    mockPlanFindFirst.mockResolvedValue(null);
    mockSubscriptionFindMany.mockResolvedValue([]);
    mockSettingsFindUnique.mockResolvedValue({
      featureOverrides: { inviteMembers: null, publicChatbot: false },
    });

    const result = await getEffectiveFeaturesQuery(ORG);
    expect(result.inviteMembers).toBe(DEFAULT_FEATURES.inviteMembers);
    expect(result.publicChatbot).toBe(false);
  });

  it('isFeatureEnabledQuery delegates to the resolver and returns the boolean', async () => {
    mockSubscriptionFindMany.mockResolvedValue([
      { plan: 'Pro', status: 'active', periodStart: new Date() },
    ]);
    mockPlanFindFirst.mockResolvedValue({
      features: { inviteMembers: true, apiAccess: false },
    });

    await expect(isFeatureEnabledQuery('org-x', 'inviteMembers')).resolves.toBe(
      true,
    );
    await expect(isFeatureEnabledQuery('org-x', 'apiAccess')).resolves.toBe(
      false,
    );
    await expect(
      isFeatureEnabledQuery('org-x', 'customAssistantTemplates'),
    ).resolves.toBe(DEFAULT_FEATURES.customAssistantTemplates);
  });

  it('non-boolean values in plan or override are ignored', async () => {
    mockSubscriptionFindMany.mockResolvedValue([
      { plan: 'Weird', status: 'active', periodStart: new Date() },
    ]);
    mockPlanFindFirst.mockResolvedValue({
      features: { inviteMembers: 'yes', publicChatbot: 1 },
    });
    mockSettingsFindUnique.mockResolvedValue({
      featureOverrides: { apiAccess: 'no' },
    });

    const result = await getEffectiveFeaturesQuery(ORG);
    expect(result).toEqual(DEFAULT_FEATURES);
  });

  it('picks active paid plan over a newer trialing Trial row', async () => {
    mockSubscriptionFindMany.mockResolvedValue([
      {
        plan: 'Ragen Business',
        status: 'active',
        periodStart: new Date('2026-05-15'),
      },
      {
        plan: 'Trial',
        status: 'trialing',
        periodStart: new Date('2026-05-20'),
      },
    ]);
    mockPlanFindFirst.mockResolvedValue({
      features: { inviteMembers: true },
    });
    const result = await getEffectiveFeaturesQuery(ORG);
    expect(result.inviteMembers).toBe(true);
    // The plan looked up must be the active one, not the newer Trial.
    expect(mockPlanFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'Ragen Business' } }),
    );
  });
});

describe('the platform-default layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsFindUnique.mockResolvedValue(null);
    mockSubscriptionFindMany.mockResolvedValue([]);
    mockPlanFindFirst.mockResolvedValue(null);
    mockPlatformSettingsFindUnique.mockResolvedValue(null);
  });

  /**
   * The reason ADR-35 added this layer: an installation that manages no plans
   * could previously answer "is API access on" only by setting an override on
   * every organization, one at a time.
   */
  it('applies to an organization with no plan and no override', async () => {
    mockPlatformSettingsFindUnique.mockResolvedValue({
      key: 'default_features',
      value: '{"inviteMembers":true}',
    });

    const result = await getEffectiveFeaturesQuery(ORG);

    expect(result.inviteMembers).toBe(true);
  });

  it('loses to the plan', async () => {
    mockPlatformSettingsFindUnique.mockResolvedValue({
      key: 'default_features',
      value: '{"apiAccess":true}',
    });
    mockSubscriptionFindMany.mockResolvedValue([
      { plan: 'Pro', status: 'active', periodStart: new Date() },
    ]);
    mockPlanFindFirst.mockResolvedValue({ features: { apiAccess: false } });

    const result = await getEffectiveFeaturesQuery(ORG);

    expect(result.apiAccess).toBe(false);
  });

  it('loses to an organization override', async () => {
    mockPlatformSettingsFindUnique.mockResolvedValue({
      key: 'default_features',
      value: '{"voiceInput":true}',
    });
    mockSettingsFindUnique.mockResolvedValue({
      featureOverrides: { voiceInput: false },
    });

    const result = await getEffectiveFeaturesQuery(ORG);

    expect(result.voiceInput).toBe(false);
  });

  // A hand-edited row that will not parse must not decide a gate.
  it('inherits when the stored row is not valid JSON', async () => {
    mockPlatformSettingsFindUnique.mockResolvedValue({
      key: 'default_features',
      value: '{{{',
    });

    const result = await getEffectiveFeaturesQuery(ORG);

    expect(result).toEqual(DEFAULT_FEATURES);
  });

  // One extra indexed lookup per request, inside the same `Promise.all` as
  // the other two, and `cache()` keeps it to once per request.
  it('is read alongside the other two rather than after them', async () => {
    await getEffectiveFeaturesQuery(ORG);

    expect(mockPlatformSettingsFindUnique).toHaveBeenCalledWith({
      where: { key: 'default_features' },
    });
  });
});
