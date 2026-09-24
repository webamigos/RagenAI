import { Injectable } from '@nestjs/common';
import {
  pickBestSubscription,
  subscriptionGrantsPlanFeatures,
} from '@ragenai/platform-contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  PLATFORM_FEATURE_DEFAULTS_KEY,
  flattenFeatures,
  resolveFeatures,
  sanitizeFeatureOverrides,
  type FeatureFlags,
  type FeatureKey,
  type FeatureOverrides,
} from './types.js';

/**
 * Ported from apps/web's get-effective-features-query.ts — only the read path
 * the public API's feature gates need. NOT a port of the full `subscriptions`
 * feature (no billing, no Stripe, no plan CRUD). See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Which subscription row decides the plan is `pickBestSubscription`, and the
 * precedence is `resolveFeatures`, both from `@ragenai/platform-contracts`
 * (ADR-33) — so this answers exactly what apps/web and apps/worker answer.
 */
@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * org override > plan.features > platform default > code default, with
   * `null` or a missing key at any layer meaning "inherit".
   *
   * The platform-default layer is what a platform administrator edits in
   * apps/admin (ADR-35). This used to stop at the plan, so a default set
   * there reached apps/web and not the public API: an operator who froze
   * uploads platform-wide with `manageDocuments: false` still had them
   * accepted through `/v1`.
   */
  async getEffectiveFeatures(organizationId: string): Promise<FeatureFlags> {
    const [settings, candidates, platformDefaults] = await Promise.all([
      this.prisma.client.organizationSettings.findUnique({
        where: { organizationId },
        select: { featureOverrides: true },
      }),
      this.prisma.client.subscription.findMany({
        where: { referenceId: organizationId },
        select: { plan: true, status: true, periodStart: true },
      }),
      this.readPlatformDefaults(),
    ]);

    const subscription = pickBestSubscription(candidates);

    // Trialing subscriptions get the same plan features as paid (Stripe trial).
    let planFeatures: unknown = null;
    if (subscriptionGrantsPlanFeatures(subscription)) {
      const plan = await this.prisma.client.subscriptionPlan.findFirst({
        where: { name: subscription.plan },
        select: { features: true },
      });
      planFeatures = plan?.features ?? null;
    }

    return flattenFeatures(
      resolveFeatures({
        orgOverrides: asOverrides(settings?.featureOverrides),
        planFeatures: asOverrides(planFeatures),
        platformDefaults,
      }),
    );
  }

  /**
   * `Settings.default_features`, a tri-state map stored as a JSON string. A
   * missing row means every key inherits. A row that will not parse must not
   * decide a gate either way, so it also inherits — landing on the code
   * defaults, as apps/web's `readPlatformDefaults` does.
   */
  private async readPlatformDefaults(): Promise<FeatureOverrides> {
    const row = await this.prisma.client.settings.findUnique({
      where: { key: PLATFORM_FEATURE_DEFAULTS_KEY },
      select: { value: true },
    });
    if (!row) {
      return {};
    }
    try {
      return asOverrides(JSON.parse(row.value));
    } catch {
      return {};
    }
  }

  async isFeatureEnabled(
    organizationId: string,
    feature: FeatureKey,
  ): Promise<boolean> {
    const flags = await this.getEffectiveFeatures(organizationId);
    return flags[feature];
  }
}

/** An untyped JSON column, reduced to recognised keys with boolean or null. */
function asOverrides(value: unknown): FeatureOverrides {
  return sanitizeFeatureOverrides(
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null,
  );
}
