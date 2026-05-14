import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSettingsFindUnique = vi.fn();
const mockSubscriptionFindFirst = vi.fn();
const mockPlanFindFirst = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    organizationSettings: {
      findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args),
    },
    subscription: {
      findFirst: (...args: unknown[]) => mockSubscriptionFindFirst(...args),
    },
    subscriptionPlan: {
      findFirst: (...args: unknown[]) => mockPlanFindFirst(...args),
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
    mockSubscriptionFindFirst.mockResolvedValue(null);
    mockPlanFindFirst.mockResolvedValue(null);
  });

  it('returns code defaults when no plan and no overrides', async () => {
    const result = await getEffectiveFeaturesQuery(ORG);
    expect(result).toEqual(DEFAULT_FEATURES);
  });

  it('applies plan features over defaults', async () => {
    mockSubscriptionFindFirst.mockResolvedValue({
      plan: 'Pro',
      status: 'active',
    });
    mockPlanFindFirst.mockResolvedValue({
      features: { inviteMembers: true, customAssistantTemplates: false },
    });

    const result = await getEffectiveFeaturesQuery(ORG);
    expect(result.inviteMembers).toBe(true);
    expect(result.customAssistantTemplates).toBe(false);
    expect(result.publicChatbot).toBe(DEFAULT_FEATURES.publicChatbot);
  });

  it('ignores plan features when subscription is canceled', async () => {
    mockSubscriptionFindFirst.mockResolvedValue({
      plan: 'Pro',
      status: 'canceled',
    });
    mockPlanFindFirst.mockResolvedValue({
      features: { inviteMembers: true },
    });

    const result = await getEffectiveFeaturesQuery(ORG);
    expect(result.inviteMembers).toBe(DEFAULT_FEATURES.inviteMembers);
  });

  it('honors trialing status as active for features', async () => {
    mockSubscriptionFindFirst.mockResolvedValue({
      plan: 'Trial',
      status: 'trialing',
    });
    mockPlanFindFirst.mockResolvedValue({
      features: { inviteMembers: true },
    });

    const result = await getEffectiveFeaturesQuery(ORG);
    expect(result.inviteMembers).toBe(true);
  });

  it('override wins over plan and default', async () => {
    mockSubscriptionFindFirst.mockResolvedValue({
      plan: 'Pro',
      status: 'active',
    });
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
    mockSubscriptionFindFirst.mockResolvedValue(null);
    mockSettingsFindUnique.mockResolvedValue({
      featureOverrides: { inviteMembers: null, publicChatbot: false },
    });

    const result = await getEffectiveFeaturesQuery(ORG);
    expect(result.inviteMembers).toBe(DEFAULT_FEATURES.inviteMembers);
    expect(result.publicChatbot).toBe(false);
  });

  it('isFeatureEnabledQuery delegates to the resolver and returns the boolean', async () => {
    mockSubscriptionFindFirst.mockResolvedValue({
      plan: 'Pro',
      status: 'active',
    });
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
    mockSubscriptionFindFirst.mockResolvedValue({
      plan: 'Weird',
      status: 'active',
    });
    mockPlanFindFirst.mockResolvedValue({
      features: { inviteMembers: 'yes', publicChatbot: 1 },
    });
    mockSettingsFindUnique.mockResolvedValue({
      featureOverrides: { apiAccess: 'no' },
    });

    const result = await getEffectiveFeaturesQuery(ORG);
    expect(result).toEqual(DEFAULT_FEATURES);
  });
});
