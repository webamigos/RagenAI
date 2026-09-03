import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DEFAULT_FEATURES,
  FEATURE_KEYS,
  type FeatureFlags,
  type FeatureKey,
  type FeatureOverrides,
} from './types.js';

/**
 * Ported from apps/web's
 * src/features/subscriptions/services/queries/{get-effective-features-query,
 * pick-best-subscription}.ts — only the read path `toggle-chatbot-command`
 * needs. NOT a port of the full `subscriptions` feature (no billing, no
 * Stripe, no plan CRUD). See docs/adrs/21-monorepo-and-api-decoupling.md.
 */
type SubscriptionCandidate = {
  plan: string;
  status: string;
  periodStart: Date | null;
};

// Matches apps/web's src/app/config.ts TRIAL_PLAN_NAME.
const TRIAL_PLAN_NAME = 'Trial';

const SUBSCRIPTION_TIER_ORDER = {
  active_paid: 0,
  trialing_paid: 1,
  trialing_trial: 2,
  other: 3,
} as const;

function tierFor(candidate: SubscriptionCandidate): number {
  const isTrialPlan = candidate.plan === TRIAL_PLAN_NAME;
  if (candidate.status === 'active' && !isTrialPlan) {
    return SUBSCRIPTION_TIER_ORDER.active_paid;
  }
  if (candidate.status === 'trialing' && !isTrialPlan) {
    return SUBSCRIPTION_TIER_ORDER.trialing_paid;
  }
  if (candidate.status === 'trialing' && isTrialPlan) {
    return SUBSCRIPTION_TIER_ORDER.trialing_trial;
  }
  return SUBSCRIPTION_TIER_ORDER.other;
}

/**
 * Pick the "best" subscription for an org from possibly many rows.
 * Active paid > trialing paid > trialing Trial > anything else.
 * Ties broken by most recent periodStart.
 */
export function pickBestSubscription<T extends SubscriptionCandidate>(
  candidates: T[],
): T | null {
  if (candidates.length === 0) {
    return null;
  }
  return [...candidates].sort((a, b) => {
    const tierDiff = tierFor(a) - tierFor(b);
    if (tierDiff !== 0) {
      return tierDiff;
    }
    const aStart = a.periodStart ? a.periodStart.getTime() : 0;
    const bStart = b.periodStart ? b.periodStart.getTime() : 0;
    return bStart - aStart;
  })[0];
}

function coerceBoolean(v: unknown): boolean | null {
  if (v === true || v === false) {
    return v;
  }
  return null;
}

function parseFlagMap(
  source: unknown,
): Partial<Record<FeatureKey, boolean | null>> {
  if (!source || typeof source !== 'object') {
    return {};
  }
  const record = source as Record<string, unknown>;
  const out: Partial<Record<FeatureKey, boolean | null>> = {};
  for (const key of FEATURE_KEYS) {
    if (key in record) {
      out[key] = coerceBoolean(record[key]);
    }
  }
  return out;
}

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolution chain for each feature flag:
   *   org override (true/false) > plan.features (true/false) > code default
   *
   * `null` in either source means "inherit" (skip this layer).
   */
  async getEffectiveFeatures(organizationId: string): Promise<FeatureFlags> {
    const [settings, candidates] = await Promise.all([
      this.prisma.client.organizationSettings.findUnique({
        where: { organizationId },
        select: { featureOverrides: true },
      }),
      this.prisma.client.subscription.findMany({
        where: { referenceId: organizationId },
        select: { plan: true, status: true, periodStart: true },
      }),
    ]);

    const subscription = pickBestSubscription(candidates);

    // Trialing subscriptions get the same plan features as paid (Stripe trial).
    let planFeatures: Partial<Record<FeatureKey, boolean | null>> = {};
    if (
      subscription?.plan &&
      (subscription.status === 'active' || subscription.status === 'trialing')
    ) {
      const plan = await this.prisma.client.subscriptionPlan.findFirst({
        where: { name: subscription.plan },
        select: { features: true },
      });
      planFeatures = parseFlagMap(plan?.features);
    }

    const overrides: FeatureOverrides = parseFlagMap(
      settings?.featureOverrides,
    );

    const resolved: FeatureFlags = { ...DEFAULT_FEATURES };
    for (const key of FEATURE_KEYS) {
      const override = overrides[key];
      if (override === true || override === false) {
        resolved[key] = override;
        continue;
      }
      const planValue = planFeatures[key];
      if (planValue === true || planValue === false) {
        resolved[key] = planValue;
      }
    }

    return resolved;
  }

  async isFeatureEnabled(
    organizationId: string,
    feature: FeatureKey,
  ): Promise<boolean> {
    const flags = await this.getEffectiveFeatures(organizationId);
    return flags[feature];
  }
}
