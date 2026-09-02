'use server';

import { requireAdmin } from '@/lib/auth-guard';
import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';

import { prisma } from '@/lib/db';
import { syncOrgToLiteLLM } from '@/lib/litellm';
import { revalidatePath } from 'next/cache';
import { allModels } from './models-config';

const DEFAULT_ALLOWED_MODELS_KEY = 'default_allowed_models';

const VALID_MODEL_VALUES = new Set(allModels.map((m) => m.value));

/**
 * Mirrors `connectors/actions.ts`. Without it any string reaches
 * `OrganizationSettings.allowedModels` and then LiteLLM's `/team/update`, and
 * a value that matches no LiteLLM model ID silently empties the organization's
 * model picker rather than restricting it.
 */
function validateModels(models: string[]): boolean {
  if (!Array.isArray(models)) {
    return false;
  }
  if (models.length > VALID_MODEL_VALUES.size) {
    return false;
  }
  return models.every(
    (m) => typeof m === 'string' && VALID_MODEL_VALUES.has(m),
  );
}

export async function getDefaultAllowedModelsAction(): Promise<string[]> {
  await requireAdmin();
  const row = await prisma.settings.findUnique({
    where: { key: DEFAULT_ALLOWED_MODELS_KEY },
  });

  if (!row) {
    return [];
  }

  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveDefaultAllowedModelsAction(
  models: string[],
): Promise<void> {
  const admin = await requireAdmin();
  const before = await getDefaultAllowedModelsAction();

  if (!validateModels(models)) {
    throw new Error('Invalid model values');
  }

  await prisma.settings.upsert({
    where: { key: DEFAULT_ALLOWED_MODELS_KEY },
    update: { value: JSON.stringify(models) },
    create: {
      key: DEFAULT_ALLOWED_MODELS_KEY,
      value: JSON.stringify(models),
    },
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.defaultModelsChanged,
    entityType: 'settings',
    entityId: 'default_allowed_models',
    before: { models: before },
    after: { models },
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  revalidatePath('/models');
}

export async function saveOrgAllowedModelsAction(
  orgId: string,
  models: string[],
): Promise<import('@/lib/litellm').LiteLLMSyncResult> {
  const admin = await requireAdmin();
  if (!orgId?.trim()) {
    throw new Error('Invalid organization ID');
  }

  if (!validateModels(models)) {
    throw new Error('Invalid model values');
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true },
  });

  if (!org) {
    throw new Error('Organization not found');
  }

  await prisma.organizationSettings.upsert({
    where: { organizationId: orgId },
    update: { allowedModels: models },
    create: { organizationId: orgId, allowedModels: models },
  });

  const sync = await syncOrgToLiteLLM(orgId, { models });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.orgModelsChanged,
    entityType: 'organization_settings',
    entityId: orgId,
    organizationId: orgId,
    after: { allowedModels: models, litellmSync: sync },
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  revalidatePath('/models');
  revalidatePath(`/organizations/${orgId}`);

  return sync;
}
