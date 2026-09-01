'use server';

import db from '@ragenai/prisma-client';
import {
  DEFAULT_FEATURES,
  FEATURE_KEYS,
  type FeatureFlags,
  type FeatureKey,
  type FeatureOverrides,
} from '../../contracts/features.types';
import { pickBestSubscription } from './pick-best-subscription';

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

/**
 * Resolution chain for each feature flag:
 *   org override (true/false) > plan.features (true/false) > code default
 *
 * `null` in either source means "inherit" (skip this layer).
 */
export async function getEffectiveFeaturesQuery(
  organizationId: string,
): Promise<FeatureFlags> {
  const [settings, candidates] = await Promise.all([
    db.organizationSettings.findUnique({
      where: { organizationId },
      select: { featureOverrides: true },
    }),
    db.subscription.findMany({
      where: { referenceId: organizationId },
      select: { plan: true, status: true, periodStart: true },
    }),
  ]);

  // Pick the "best" subscription for this org. Many orgs end up with
  // multiple subscription rows over time (legacy trial + paid plan, or
  // stale trials left over from invite flows). The right plan to read
  // features from is:
  //   1. an `active` paid plan (real paid subscription),
  //   2. a `trialing` paid plan (Stripe trial of a real plan),
  //   3. a `trialing` generic Trial,
  //   4. anything else (canceled, past_due, etc.) — fall back to defaults.
  // Within each tier we prefer the most recently started period.
  const subscription = pickBestSubscription(candidates);

  // Trialing subscriptions get the same plan features as paid (Stripe trial).
  let planFeatures: Partial<Record<FeatureKey, boolean | null>> = {};
  if (
    subscription?.plan &&
    (subscription.status === 'active' || subscription.status === 'trialing')
  ) {
    const plan = await db.subscriptionPlan.findFirst({
      where: { name: subscription.plan },
      select: { features: true },
    });
    planFeatures = parseFlagMap(plan?.features);
  }

  const overrides: FeatureOverrides = parseFlagMap(settings?.featureOverrides);

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

export async function isFeatureEnabledQuery(
  organizationId: string,
  feature: FeatureKey,
): Promise<boolean> {
  const flags = await getEffectiveFeaturesQuery(organizationId);
  return flags[feature];
}
