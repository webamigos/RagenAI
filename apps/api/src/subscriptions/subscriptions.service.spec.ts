import type { Mock } from 'vitest';
import {
  pickBestSubscription,
  SubscriptionsService,
} from './subscriptions.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';
import { DEFAULT_FEATURES } from './types.js';

const date = (iso: string) => new Date(iso);

describe('pickBestSubscription', () => {
  it('returns null when no candidates', () => {
    expect(pickBestSubscription([])).toBeNull();
  });

  it('prefers active paid plan over newer trialing trial', () => {
    const best = pickBestSubscription([
      {
        plan: 'Ragen Business',
        status: 'active',
        periodStart: date('2026-05-15'),
      },
      { plan: 'Trial', status: 'trialing', periodStart: date('2026-05-20') },
    ]);
    expect(best?.plan).toBe('Ragen Business');
  });

  it('prefers trialing paid plan over generic trialing Trial', () => {
    const best = pickBestSubscription([
      {
        plan: 'Ragen Business',
        status: 'trialing',
        periodStart: date('2026-05-10'),
      },
      { plan: 'Trial', status: 'trialing', periodStart: date('2026-05-20') },
    ]);
    expect(best?.plan).toBe('Ragen Business');
  });

  it('breaks ties within tier by latest periodStart', () => {
    const best = pickBestSubscription([
      { plan: 'Trial', status: 'trialing', periodStart: date('2026-05-15') },
      { plan: 'Trial', status: 'trialing', periodStart: date('2026-05-20') },
    ]);
    expect(best?.periodStart).toEqual(date('2026-05-20'));
  });

  it('returns canceled subscription only when nothing else exists', () => {
    expect(
      pickBestSubscription([
        {
          plan: 'Ragen Business',
          status: 'canceled',
          periodStart: date('2026-04-01'),
        },
      ])?.status,
    ).toBe('canceled');
  });

  it('handles null periodStart safely', () => {
    const best = pickBestSubscription([
      { plan: 'Trial', status: 'trialing', periodStart: null },
      { plan: 'Trial', status: 'trialing', periodStart: date('2026-05-20') },
    ]);
    expect(best?.periodStart).toEqual(date('2026-05-20'));
  });
});

describe('SubscriptionsService', () => {
  function makeService(overrides: {
    settingsFindUnique?: Mock;
    subscriptionFindMany?: Mock;
    planFindFirst?: Mock;
  }) {
    const settingsFindUnique =
      overrides.settingsFindUnique ?? vi.fn().mockResolvedValue(null);
    const subscriptionFindMany =
      overrides.subscriptionFindMany ?? vi.fn().mockResolvedValue([]);
    const planFindFirst =
      overrides.planFindFirst ?? vi.fn().mockResolvedValue(null);
    const prisma = {
      client: {
        organizationSettings: { findUnique: settingsFindUnique },
        subscription: { findMany: subscriptionFindMany },
        subscriptionPlan: { findFirst: planFindFirst },
      },
    } as unknown as PrismaService;
    return {
      service: new SubscriptionsService(prisma),
      settingsFindUnique,
      subscriptionFindMany,
      planFindFirst,
    };
  }

  const ORG = 'org-1';

  describe('getEffectiveFeatures', () => {
    it('returns code defaults when no plan and no overrides', async () => {
      const { service } = makeService({});
      const result = await service.getEffectiveFeatures(ORG);
      expect(result).toEqual(DEFAULT_FEATURES);
    });

    it('applies plan features over defaults', async () => {
      const { service } = makeService({
        subscriptionFindMany: vi
          .fn()
          .mockResolvedValue([
            { plan: 'Pro', status: 'active', periodStart: new Date() },
          ]),
        planFindFirst: vi.fn().mockResolvedValue({
          features: { inviteMembers: true, customAssistantTemplates: false },
        }),
      });

      const result = await service.getEffectiveFeatures(ORG);
      expect(result.inviteMembers).toBe(true);
      expect(result.customAssistantTemplates).toBe(false);
      expect(result.publicChatbot).toBe(DEFAULT_FEATURES.publicChatbot);
    });

    it('ignores plan features when subscription is canceled', async () => {
      const { service } = makeService({
        subscriptionFindMany: vi
          .fn()
          .mockResolvedValue([
            { plan: 'Pro', status: 'canceled', periodStart: new Date() },
          ]),
        planFindFirst: vi
          .fn()
          .mockResolvedValue({ features: { inviteMembers: true } }),
      });

      const result = await service.getEffectiveFeatures(ORG);
      expect(result.inviteMembers).toBe(DEFAULT_FEATURES.inviteMembers);
    });

    it('honors trialing status as active for features', async () => {
      const { service } = makeService({
        subscriptionFindMany: vi
          .fn()
          .mockResolvedValue([
            { plan: 'Trial', status: 'trialing', periodStart: new Date() },
          ]),
        planFindFirst: vi
          .fn()
          .mockResolvedValue({ features: { inviteMembers: true } }),
      });

      const result = await service.getEffectiveFeatures(ORG);
      expect(result.inviteMembers).toBe(true);
    });

    it('override wins over plan and default', async () => {
      const { service } = makeService({
        subscriptionFindMany: vi
          .fn()
          .mockResolvedValue([
            { plan: 'Pro', status: 'active', periodStart: new Date() },
          ]),
        planFindFirst: vi
          .fn()
          .mockResolvedValue({ features: { apiAccess: false } }),
        settingsFindUnique: vi.fn().mockResolvedValue({
          featureOverrides: { apiAccess: true, inviteMembers: true },
        }),
      });

      const result = await service.getEffectiveFeatures(ORG);
      expect(result.apiAccess).toBe(true);
      expect(result.inviteMembers).toBe(true);
    });

    it('override null falls through to plan/default', async () => {
      const { service } = makeService({
        settingsFindUnique: vi.fn().mockResolvedValue({
          featureOverrides: { inviteMembers: null, publicChatbot: false },
        }),
      });

      const result = await service.getEffectiveFeatures(ORG);
      expect(result.inviteMembers).toBe(DEFAULT_FEATURES.inviteMembers);
      expect(result.publicChatbot).toBe(false);
    });

    it('non-boolean values in plan or override are ignored', async () => {
      const { service } = makeService({
        subscriptionFindMany: vi
          .fn()
          .mockResolvedValue([
            { plan: 'Weird', status: 'active', periodStart: new Date() },
          ]),
        planFindFirst: vi.fn().mockResolvedValue({
          features: { inviteMembers: 'yes', publicChatbot: 1 },
        }),
        settingsFindUnique: vi
          .fn()
          .mockResolvedValue({ featureOverrides: { apiAccess: 'no' } }),
      });

      const result = await service.getEffectiveFeatures(ORG);
      expect(result).toEqual(DEFAULT_FEATURES);
    });

    it('picks active paid plan over a newer trialing Trial row', async () => {
      const planFindFirst = vi
        .fn()
        .mockResolvedValue({ features: { inviteMembers: true } });
      const { service } = makeService({
        subscriptionFindMany: vi.fn().mockResolvedValue([
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
        ]),
        planFindFirst,
      });

      const result = await service.getEffectiveFeatures(ORG);
      expect(result.inviteMembers).toBe(true);
      expect(planFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { name: 'Ragen Business' } }),
      );
    });
  });

  describe('isFeatureEnabled', () => {
    it('delegates to getEffectiveFeatures and returns the boolean', async () => {
      const { service } = makeService({
        subscriptionFindMany: vi
          .fn()
          .mockResolvedValue([
            { plan: 'Pro', status: 'active', periodStart: new Date() },
          ]),
        planFindFirst: vi.fn().mockResolvedValue({
          features: { inviteMembers: true, apiAccess: false },
        }),
      });

      await expect(
        service.isFeatureEnabled('org-x', 'inviteMembers'),
      ).resolves.toBe(true);
      await expect(
        service.isFeatureEnabled('org-x', 'apiAccess'),
      ).resolves.toBe(false);
      await expect(
        service.isFeatureEnabled('org-x', 'customAssistantTemplates'),
      ).resolves.toBe(DEFAULT_FEATURES.customAssistantTemplates);
    });
  });
});
