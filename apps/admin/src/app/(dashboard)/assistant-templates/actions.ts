'use server';

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
  return prisma.assistantTemplate.findMany({
    orderBy: { sortOrder: 'asc' },
  });
}

export async function getAssistantTemplateAction(
  id: string,
): Promise<AssistantTemplateRow | null> {
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
  await prisma.assistantTemplate.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      instructions: data.instructions,
      iconUrl: data.iconUrl ?? null,
      sortOrder: data.sortOrder ?? 0,
    },
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
  await prisma.assistantTemplate.update({
    where: { id },
    data,
  });

  revalidatePath(REVALIDATE_PATH);
}

export async function deleteAssistantTemplateAction(id: string): Promise<void> {
  await prisma.assistantTemplate.delete({
    where: { id },
  });

  revalidatePath(REVALIDATE_PATH);
}

export async function toggleAssistantTemplateAction(
  id: string,
  isActive: boolean,
): Promise<void> {
  await prisma.assistantTemplate.update({
    where: { id },
    data: { isActive },
  });

  revalidatePath(REVALIDATE_PATH);
}
