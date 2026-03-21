'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

const DEFAULT_ALLOWED_MODELS_KEY = 'default_allowed_models';

export async function getDefaultAllowedModelsAction(): Promise<string[]> {
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
  if (!orgId?.trim()) {
    throw new Error('Invalid organization ID');
  }

  await prisma.organizationSettings.upsert({
    where: { organizationId: orgId },
    update: { allowedModels: models },
    create: { organizationId: orgId, allowedModels: models },
  });

  revalidatePath('/models');
  revalidatePath(`/organizations/${orgId}`);
}
