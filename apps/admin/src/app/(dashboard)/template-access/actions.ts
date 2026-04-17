'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

const DEFAULT_ALLOWED_TEMPLATES_KEY = 'default_allowed_templates';

export type TemplateOption = {
  id: string;
  name: string;
  iconUrl: string | null;
  isActive: boolean;
};

export async function getActiveTemplatesAction(): Promise<TemplateOption[]> {
  const templates = await prisma.assistantTemplate.findMany({
    where: { isActive: true },
    select: { id: true, name: true, iconUrl: true, isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  return templates;
}

export async function getDefaultAllowedTemplatesAction(): Promise<string[]> {
  const row = await prisma.settings.findUnique({
    where: { key: DEFAULT_ALLOWED_TEMPLATES_KEY },
  });

  if (!row) {
    return [];
  }

  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export async function saveDefaultAllowedTemplatesAction(
  templateIds: string[],
): Promise<void> {
  await prisma.settings.upsert({
    where: { key: DEFAULT_ALLOWED_TEMPLATES_KEY },
    update: { value: JSON.stringify(templateIds) },
    create: {
      key: DEFAULT_ALLOWED_TEMPLATES_KEY,
      value: JSON.stringify(templateIds),
    },
  });

  revalidatePath('/template-access');
}

export async function saveOrgAllowedTemplatesAction(
  orgId: string,
  templateIds: string[],
): Promise<void> {
  if (!orgId?.trim()) {
    throw new Error('Invalid organization ID');
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
    update: { allowedTemplates: templateIds },
    create: { organizationId: orgId, allowedTemplates: templateIds },
  });

  revalidatePath('/template-access');
  revalidatePath(`/organizations/${orgId}`);
}
