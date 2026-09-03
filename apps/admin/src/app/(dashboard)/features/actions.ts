'use server';

import { requireAdmin } from '@/lib/auth-guard';
import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import {
  FEATURE_KEYS,
  PLATFORM_FEATURE_DEFAULTS_KEY,
  resolveFeatures,
  type FeatureKey,
  type FeatureOverrides,
  type FeatureResolution,
  type PlatformFeatureDefaults,
} from './feature-keys';

function sanitizeOverrides(input: Record<string, unknown>): FeatureOverrides {
  const out: FeatureOverrides = {};
  for (const key of FEATURE_KEYS) {
    const v = input[key];
    if (v === true || v === false || v === null) {
      out[key] = v;
    }
  }
  return out;
}

export async function getOrgFeatureOverridesAction(
  orgId: string,
): Promise<FeatureOverrides> {
  await requireAdmin();
  const row = await prisma.organizationSettings.findUnique({
    where: { organizationId: orgId },
    select: { featureOverrides: true },
  });
  if (!row?.featureOverrides || typeof row.featureOverrides !== 'object') {
    return {};
  }
  return sanitizeOverrides(row.featureOverrides as Record<string, unknown>);
}

export async function saveOrgFeatureOverridesAction(
  orgId: string,
  overrides: FeatureOverrides,
) {
  const admin = await requireAdmin();
  const before = await getOrgFeatureOverridesAction(orgId);
  if (!orgId?.trim()) {
    throw new Error('Invalid organization ID');
  }

  const clean = sanitizeOverrides(overrides as Record<string, unknown>);

  // Strip null/inherit entries so the JSON stays minimal.
  const stored: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(clean)) {
    if (v === true || v === false) {
      stored[k] = v;
    }
  }

  await prisma.organizationSettings.upsert({
    where: { organizationId: orgId },
    update: { featureOverrides: stored },
    create: { organizationId: orgId, featureOverrides: stored },
  });

  // Feature overrides gate the public API, the external chatbot and public
  // thread links, so a change here widens or narrows what the world can reach.
  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.orgFeaturesChanged,
    entityType: 'organization_settings',
    entityId: orgId,
    organizationId: orgId,
    before: before as Record<string, unknown>,
    after: stored,
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  revalidatePath('/features');
  revalidatePath(`/organizations/${orgId}`);
}

export async function getPlanFeaturesAction(
  planId: string,
): Promise<Record<string, boolean>> {
  await requireAdmin();
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
    select: { features: true },
  });
  if (!plan?.features || typeof plan.features !== 'object') {
    return {};
  }
  const features = plan.features as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  for (const key of FEATURE_KEYS) {
    if (features[key] === true || features[key] === false) {
      out[key] = features[key] as boolean;
    }
  }
  return out;
}

export async function savePlanFeaturesAction(
  planId: string,
  features: Record<FeatureKey, boolean | null>,
) {
  const admin = await requireAdmin();
  const before = await getPlanFeaturesAction(planId);
  // Strip null/unset entries — undefined means "no opinion".
  const stored: Record<string, boolean> = {};
  for (const key of FEATURE_KEYS) {
    const v = features[key];
    if (v === true || v === false) {
      stored[key] = v;
    }
  }

  await prisma.subscriptionPlan.update({
    where: { id: planId },
    data: { features: stored },
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.planFeaturesChanged,
    entityType: 'subscription_plan',
    entityId: planId,
    before,
    after: stored,
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  revalidatePath('/features/plans');
  revalidatePath('/features');
}

/**
 * Platform-wide feature defaults (ADR-35).
 *
 * The layer between the plan and the code constant. An installation that
 * manages no plans — the self-hosted case — previously had no way to answer
 * "is API access on here" except by setting an override on each organization
 * one at a time. An agency operator running several client organizations sets
 * it once and can still override per client.
 */
export async function getPlatformFeatureDefaultsAction(): Promise<PlatformFeatureDefaults> {
  await requireAdmin();
  const row = await prisma.settings.findUnique({
    where: { key: PLATFORM_FEATURE_DEFAULTS_KEY },
  });
  if (!row) {
    return {};
  }
  try {
    return sanitizeOverrides(JSON.parse(row.value) as Record<string, unknown>);
  } catch {
    return {};
  }
}

export async function savePlatformFeatureDefaultsAction(
  defaults: PlatformFeatureDefaults,
): Promise<void> {
  const admin = await requireAdmin();
  const before = await getPlatformFeatureDefaultsAction();

  const clean = sanitizeOverrides(defaults as Record<string, unknown>);

  // Only explicit booleans are stored; `null` means inherit and is expressed
  // by absence, matching how the per-organization overrides are written.
  const stored: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(clean)) {
    if (value === true || value === false) {
      stored[key] = value;
    }
  }

  await prisma.settings.upsert({
    where: { key: PLATFORM_FEATURE_DEFAULTS_KEY },
    update: { value: JSON.stringify(stored) },
    create: {
      key: PLATFORM_FEATURE_DEFAULTS_KEY,
      value: JSON.stringify(stored),
    },
  });

  // Read live on every request, so this reaches every organization that has
  // no override of its own immediately — there is nothing to propagate, and
  // nothing to undo but another edit.
  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.defaultFeaturesChanged,
    entityType: 'settings',
    entityId: PLATFORM_FEATURE_DEFAULTS_KEY,
    before: before as Record<string, unknown>,
    after: stored,
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED', severity: 'warn' },
  });

  revalidatePath('/features');
}

/**
 * What an organization actually gets, and which layer decided it.
 *
 * The panel could set an override and could not say what a feature currently
 * evaluates to — so an operator could not tell an override that was doing
 * something from one that was being shadowed by a plan.
 */
export async function getOrgFeatureResolutionAction(
  orgId: string,
): Promise<FeatureResolution> {
  await requireAdmin();

  const [settings, subscriptions, platformDefaults] = await Promise.all([
    prisma.organizationSettings.findUnique({
      where: { organizationId: orgId },
      select: { featureOverrides: true },
    }),
    prisma.subscription.findMany({
      where: { referenceId: orgId },
      select: { plan: true, status: true },
    }),
    getPlatformFeatureDefaultsAction(),
  ]);

  // Simpler than apps/web's `pickBestSubscription`, and deliberately so: this
  // is a diagnostic view, and an organization with several overlapping rows
  // is itself worth seeing rather than silently reduced to one.
  const active = subscriptions.find(
    (row) => row.status === 'active' || row.status === 'trialing',
  );

  let planFeatures: Record<string, unknown> | null = null;
  if (active?.plan) {
    const plan = await prisma.subscriptionPlan.findFirst({
      where: { name: active.plan },
      select: { features: true },
    });
    planFeatures = (plan?.features ?? null) as Record<string, unknown> | null;
  }

  return resolveFeatures({
    orgOverrides: sanitizeOverrides(
      (settings?.featureOverrides ?? {}) as Record<string, unknown>,
    ),
    planFeatures: sanitizeOverrides(planFeatures ?? {}),
    platformDefaults,
  });
}
