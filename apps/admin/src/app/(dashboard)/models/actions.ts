'use server';

import { requireAdmin } from '@/lib/auth-guard';

import { prisma } from '@/lib/db';
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
  await requireAdmin();

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

  revalidatePath('/models');
}

export async function saveOrgAllowedModelsAction(
  orgId: string,
  models: string[],
): Promise<void> {
  await requireAdmin();
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

  // Sync allowed models to LiteLLM team (direct API call — admin app can't import from main app)
  try {
    const litellmUrl = process.env.LITELLM_PROXY_URL;
    const litellmKey = process.env.LITELLM_MASTER_KEY;
    if (litellmUrl) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (litellmKey) {
        headers['Authorization'] = `Bearer ${litellmKey}`;
      }
      await fetch(`${litellmUrl}/team/update`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ team_id: orgId, models }),
        signal: AbortSignal.timeout(5000),
      });
    }
  } catch {
    // LiteLLM sync is best-effort — don't block the admin action
  }

  revalidatePath('/models');
  revalidatePath(`/organizations/${orgId}`);
}
