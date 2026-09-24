import type { Mock } from 'vitest';
import { SubscriptionsService } from './subscriptions.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';
import { DEFAULT_FEATURES } from './types.js';

describe('SubscriptionsService', () => {
  function makeService(overrides: {
    settingsFindUnique?: Mock;
    subscriptionFindMany?: Mock;
    planFindFirst?: Mock;
    platformSettingsFindUnique?: Mock;
  }) {
    const settingsFindUnique =
      overrides.settingsFindUnique ?? vi.fn().mockResolvedValue(null);
    const subscriptionFindMany =
      overrides.subscriptionFindMany ?? vi.fn().mockResolvedValue([]);
    const planFindFirst =
      overrides.planFindFirst ?? vi.fn().mockResolvedValue(null);
    const platformSettingsFindUnique =
      overrides.platformSettingsFindUnique ?? vi.fn().mockResolvedValue(null);
    const prisma = {
      client: {
        organizationSettings: { findUnique: settingsFindUnique },
        subscription: { findMany: subscriptionFindMany },
        subscriptionPlan: { findFirst: planFindFirst },
        settings: { findUnique: platformSettingsFindUnique },
      },
    } as unknown as PrismaService;
    return {
      service: new SubscriptionsService(prisma),
      settingsFindUnique,
      subscriptionFindMany,
      planFindFirst,
      platformSettingsFindUnique,
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

  // The layer this service did not read. A platform administrator sets it in
  // apps/admin, apps/web honoured it, and the public API gated on the code
  // default instead.
  describe('the platform default', () => {
    const platformDefault = (value: string) =>
      vi.fn().mockResolvedValue({ key: 'default_features', value });

    it('decides a key nothing above it sets', async () => {
      const { service, platformSettingsFindUnique } = makeService({
        platformSettingsFindUnique: platformDefault(
          '{"manageDocuments":false,"voiceInput":true}',
        ),
      });

      const result = await service.getEffectiveFeatures(ORG);

      expect(result.manageDocuments).toBe(false);
      expect(result.voiceInput).toBe(true);
      expect(result.apiAccess).toBe(DEFAULT_FEATURES.apiAccess);
      expect(platformSettingsFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { key: 'default_features' } }),
      );
    });

    it('loses to the plan', async () => {
      const { service } = makeService({
        platformSettingsFindUnique: platformDefault('{"inviteMembers":false}'),
        subscriptionFindMany: vi
          .fn()
          .mockResolvedValue([
            { plan: 'Pro', status: 'active', periodStart: new Date() },
          ]),
        planFindFirst: vi
          .fn()
          .mockResolvedValue({ features: { inviteMembers: true } }),
      });

      expect((await service.getEffectiveFeatures(ORG)).inviteMembers).toBe(
        true,
      );
    });

    it('loses to an organization override', async () => {
      const { service } = makeService({
        platformSettingsFindUnique: platformDefault('{"publicChatbot":true}'),
        settingsFindUnique: vi
          .fn()
          .mockResolvedValue({ featureOverrides: { publicChatbot: false } }),
      });

      expect((await service.getEffectiveFeatures(ORG)).publicChatbot).toBe(
        false,
      );
    });

    it('lets a null key inherit the code default', async () => {
      const { service } = makeService({
        platformSettingsFindUnique: platformDefault('{"manageDocuments":null}'),
      });

      expect((await service.getEffectiveFeatures(ORG)).manageDocuments).toBe(
        DEFAULT_FEATURES.manageDocuments,
      );
    });

    // A hand-edited row that will not parse must not decide a gate.
    it.each(['{not json', '["manageDocuments"]', '"false"', 'null'])(
      'is ignored when the row reads %j',
      async (value) => {
        const { service } = makeService({
          platformSettingsFindUnique: platformDefault(value),
        });

        expect(await service.getEffectiveFeatures(ORG)).toEqual(
          DEFAULT_FEATURES,
        );
      },
    );
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
