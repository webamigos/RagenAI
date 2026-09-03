import { cache } from 'react';

import db from '@ragenai/prisma-client';
import {
  PLATFORM_FEATURE_DEFAULTS_KEY,
  flattenFeatures,
  resolveFeatures,
  sanitizeFeatureOverrides,
  type FeatureFlags,
  type FeatureKey,
  type FeatureResolution,
} from '../../contracts/features.types';
import { pickBestSubscription } from './pick-best-subscription';

/**
 * `Settings.default_features` holds a tri-state map, same shape as an
 * organization override. A missing row means every key inherits, which is the
 * state of an installation whose operator has never opened the panel.
 */
async function readPlatformDefaults() {
  const row = await db.settings.findUnique({
    where: { key: PLATFORM_FEATURE_DEFAULTS_KEY },
  });
  if (!row) {
    return {};
  }
  try {
    return sanitizeFeatureOverrides(
      JSON.parse(row.value) as Record<string, unknown>,
    );
  } catch {
    // A hand-edited row that will not parse must not decide a gate. Inheriting
    // is the safe reading: it lands on the code defaults.
    return {};
  }
}

/**
 * Resolution chain for each feature flag:
 *   org override > plan.features > platform default > code default
 *
 * `null` at any layer means "inherit" (skip this layer). The precedence lives
 * in `resolveFeatures` in `@ragenai/platform-contracts`, not here, so the
 * admin panel explains exactly what this gates on — see ADR-35.
 *
 * The platform-default layer is what makes a self-hosted installation
 * configurable: without it the only layer above the code constant was the
 * plan, so an operator who manages no plans could answer "is API access on"
 * only by setting an override on each organization one at a time.
 *
 * Deliberately **not** a Server Action. This file used to carry `'use server'`,
 * which made both exports POST-able endpoints taking a caller-supplied
 * `organizationId` — anyone with a session could read another organization's
 * flags. Nothing imports either function from a client component (the panel
 * layout hands the resolved flags down through `OrgFeaturesContext` instead),
 * so the directive bought nothing and cost that. These are now the resolution
 * point for the voice-dictation, public-thread-link and public-chatbot gates,
 * which is reason enough not to leave them reachable from the browser.
 *
 * `cache()` scopes the result to one request, matching how `auth-guards.ts`
 * treats `getSession` / `getActiveMember` / `getUserTeamIds`. The panel layout
 * resolves the flags on every navigation and child RSCs call
 * `isFeatureEnabledQuery` independently; without this each caller repeats two
 * or three queries.
 */
export const resolveFeaturesForOrgQuery = cache(
  async function resolveFeaturesForOrgQuery(
    organizationId: string,
  ): Promise<FeatureResolution> {
    const [settings, candidates, platformDefaults] = await Promise.all([
      db.organizationSettings.findUnique({
        where: { organizationId },
        select: { featureOverrides: true },
      }),
      db.subscription.findMany({
        where: { referenceId: organizationId },
        select: { plan: true, status: true, periodStart: true },
      }),
      readPlatformDefaults(),
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
    let planFeatures: Record<string, unknown> | null = null;
    if (
      subscription?.plan &&
      (subscription.status === 'active' || subscription.status === 'trialing')
    ) {
      const plan = await db.subscriptionPlan.findFirst({
        where: { name: subscription.plan },
        select: { features: true },
      });
      planFeatures = (plan?.features ?? null) as Record<string, unknown> | null;
    }

    return resolveFeatures({
      orgOverrides: sanitizeFeatureOverrides(
        settings?.featureOverrides as Record<string, unknown> | null,
      ),
      planFeatures: sanitizeFeatureOverrides(planFeatures),
      platformDefaults,
    });
  },
);

/**
 * The flags alone. Kept as the name every gate already calls, so adding the
 * source information did not touch a single call site.
 */
export async function getEffectiveFeaturesQuery(
  organizationId: string,
): Promise<FeatureFlags> {
  return flattenFeatures(await resolveFeaturesForOrgQuery(organizationId));
}

export async function isFeatureEnabledQuery(
  organizationId: string,
  feature: FeatureKey,
): Promise<boolean> {
  const flags = await getEffectiveFeaturesQuery(organizationId);
  return flags[feature];
}
