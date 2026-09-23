import {
  pickBestSubscription,
  resolveFeatures,
  sanitizeFeatureOverrides,
  subscriptionGrantsPlanFeatures,
} from '@ragenai/platform-contracts';

import {
  BRAIN_EXTRACT_MAX_DOCUMENTS,
  BRAIN_EXTRACT_MAX_TOKENS,
} from '../../consts.js';
import { getFeatureLayers, getPlanFeatures } from '../../services/db/brain.js';

/**
 * Whether this organization may run Brain now, and the run's ceilings.
 *
 * One activity for both because a handler must not read either itself: on
 * Temporal a handler is workflow code, which cannot touch the environment or
 * the database, and a flag or limit read at enqueue time would be a decision
 * made by whoever queued the job rather than by the organization's settings
 * when it runs. Spec: "every Brain route and job checks it".
 *
 * The precedence is `resolveFeatures`, the function apps/web gates on, fed the
 * same three layers — so the worker and the panel cannot disagree about
 * whether an organization has Brain.
 */
export async function startBrainExtractRun({
  orgId,
}: {
  orgId: string;
}): Promise<{ enabled: boolean; maxDocuments: number; maxTokens: number }> {
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
      // inheriting lands on the code default, which for `brain` is off.
      platformDefaults = null;
    }
  }

  const resolved = resolveFeatures({
    orgOverrides: sanitizeFeatureOverrides(
      layers.orgOverrides as Record<string, unknown> | null,
    ),
    planFeatures: sanitizeFeatureOverrides(
      planFeatures as Record<string, unknown> | null,
    ),
    platformDefaults: sanitizeFeatureOverrides(platformDefaults),
  });

  return {
    enabled: resolved.brain.value,
    maxDocuments: BRAIN_EXTRACT_MAX_DOCUMENTS,
    maxTokens: BRAIN_EXTRACT_MAX_TOKENS,
  };
}
