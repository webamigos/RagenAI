'use server';

import { requireAdmin } from '@/lib/auth-guard';
import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import {
  FEATURE_KEYS,
  type FeatureKey,
  type FeatureOverrides,
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
