'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function renameUserAction(userId: string, name: string) {
  if (!name.trim()) {
    throw new Error('Name cannot be empty');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { name: name.trim() },
  });

  revalidatePath('/users');
  revalidatePath(`/users/${userId}`);
}

export async function banUserAction(userId: string, reason?: string) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      banned: true,
      banReason: reason || null,
    },
  });

  revalidatePath('/users');
  revalidatePath(`/users/${userId}`);
}

export async function unbanUserAction(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      banned: false,
      banReason: null,
      banExpires: null,
    },
  });

  revalidatePath('/users');
  revalidatePath(`/users/${userId}`);
}
