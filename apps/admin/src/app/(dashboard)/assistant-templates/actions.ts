'use server';

import { requireAdmin } from '@/lib/auth-guard';
import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

const REVALIDATE_PATH = '/assistant-templates';

export type AssistantTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  instructions: string;
  iconUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export async function getAssistantTemplatesAction(): Promise<
  AssistantTemplateRow[]
> {
  await requireAdmin();
  return prisma.assistantTemplate.findMany({
    orderBy: { sortOrder: 'asc' },
  });
}

export async function getAssistantTemplateAction(
  id: string,
): Promise<AssistantTemplateRow | null> {
  await requireAdmin();
  return prisma.assistantTemplate.findUnique({
    where: { id },
  });
}

export async function createAssistantTemplateAction(data: {
  name: string;
  description?: string;
  instructions: string;
  iconUrl?: string;
  sortOrder?: number;
}): Promise<void> {
  const admin = await requireAdmin();
  const created = await prisma.assistantTemplate.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      instructions: data.instructions,
      iconUrl: data.iconUrl ?? null,
      sortOrder: data.sortOrder ?? 0,
    },
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.templateCreated,
    entityType: 'assistant_template',
    entityId: created.id,
    after: { name: data.name, sortOrder: data.sortOrder ?? 0 },
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  revalidatePath(REVALIDATE_PATH);
}

export async function updateAssistantTemplateAction(
  id: string,
  data: {
    name?: string;
    description?: string | null;
    instructions?: string;
    iconUrl?: string | null;
    isActive?: boolean;
    sortOrder?: number;
  },
): Promise<void> {
  const admin = await requireAdmin();
  await prisma.assistantTemplate.update({
    where: { id },
    data,
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.templateUpdated,
    entityType: 'assistant_template',
    entityId: id,
    after: data as Record<string, unknown>,
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  revalidatePath(REVALIDATE_PATH);
}

export async function deleteAssistantTemplateAction(id: string): Promise<void> {
  const admin = await requireAdmin();
  // Read first: after the delete there is nothing left to describe, and an
  // organization's `allowedTemplates` may still reference this id.
  const before = await prisma.assistantTemplate.findUnique({
    where: { id },
    select: { name: true, isActive: true },
  });

  await prisma.assistantTemplate.delete({
    where: { id },
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.templateDeleted,
    entityType: 'assistant_template',
    entityId: id,
    before: before ?? null,
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED', severity: 'warn' },
  });

  revalidatePath(REVALIDATE_PATH);
}

export async function toggleAssistantTemplateAction(
  id: string,
  isActive: boolean,
): Promise<void> {
  const admin = await requireAdmin();
  await prisma.assistantTemplate.update({
    where: { id },
    data: { isActive },
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.templateToggled,
    entityType: 'assistant_template',
    entityId: id,
    after: { isActive },
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  revalidatePath(REVALIDATE_PATH);
}
