'use server';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

async function requireAdminSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    throw new Error('Unauthorized');
  }
  return session;
}

export const FEATURE_KEYS = [
  'inviteMembers',
  'publicChatbot',
  'apiAccess',
  'mcpConnectors',
  'customAssistantTemplates',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type FeatureOverrides = Partial<Record<FeatureKey, boolean | null>>;

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
  await requireAdminSession();
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
  await requireAdminSession();
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

  revalidatePath('/features');
  revalidatePath(`/organizations/${orgId}`);
}

export async function getPlanFeaturesAction(
  planId: string,
): Promise<Record<string, boolean>> {
  await requireAdminSession();
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
  await requireAdminSession();
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

  revalidatePath('/subscriptions/plans');
  revalidatePath('/features');
}
