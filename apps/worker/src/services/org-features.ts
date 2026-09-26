import {
  pickBestSubscription,
  resolveFeatures,
  sanitizeFeatureOverrides,
  subscriptionGrantsPlanFeatures,
  type FeatureResolution,
} from '@ragenai/platform-contracts';

import { getFeatureLayers, getPlanFeatures } from './db/brain.js';

/**
 * Every feature key for one organization, resolved as apps/web resolves it.
 *
 * The precedence is `resolveFeatures` from `@ragenai/platform-contracts`, fed
 * the same three layers the panel reads — organization override, plan,
 * platform default — so the worker and the panel cannot disagree about
 * whether an organization has a feature. Call it from an activity: on Temporal
 * a handler is workflow code and cannot touch the database.
 */
export async function resolveOrgFeatures(
  orgId: string,
): Promise<FeatureResolution> {
  const layers = await getFeatureLayers(orgId);

  const subscription = pickBestSubscription(layers.subscriptions);
  const planFeatures = subscriptionGrantsPlanFeatures(subscription)
    ? await getPlanFeatures(subscription.plan)
    : null;

  let platformDefaults: Record<string, unknown> | null = null;
  if (layers.platformDefaultsJson) {
    try {
      platformDefaults = JSON.parse(layers.platformDefaultsJson) as Record<
        string,
        unknown
      >;
    } catch {
      // A hand-edited row that will not parse must not decide a gate;
      // inheriting lands on each key's code default.
      platformDefaults = null;
    }
  }

  return resolveFeatures({
    orgOverrides: sanitizeFeatureOverrides(
      layers.orgOverrides as Record<string, unknown> | null,
    ),
    planFeatures: sanitizeFeatureOverrides(
      planFeatures as Record<string, unknown> | null,
    ),
    platformDefaults: sanitizeFeatureOverrides(platformDefaults),
  });
}
