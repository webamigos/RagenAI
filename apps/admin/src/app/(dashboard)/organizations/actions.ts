'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function renameOrgAction(orgId: string, name: string) {
  if (!name.trim()) {
    throw new Error('Name cannot be empty');
  }

  await prisma.organization.update({
    where: { id: orgId },
    data: { name: name.trim() },
  });

  revalidatePath('/organizations');
  revalidatePath(`/organizations/${orgId}`);
}

export async function changeOrgSlugAction(orgId: string, slug: string) {
  const trimmed = slug.trim().toLowerCase();

  if (trimmed) {
    const existing = await prisma.organization.findUnique({
      where: { slug: trimmed },
      select: { id: true },
    });
    if (existing && existing.id !== orgId) {
      throw new Error('Slug is already taken');
    }
  }

  await prisma.organization.update({
    where: { id: orgId },
    data: { slug: trimmed || null },
  });

  revalidatePath('/organizations');
  revalidatePath(`/organizations/${orgId}`);
}
