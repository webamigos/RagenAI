'use server';

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { requireAppAdmin } from '@/lib/auth-guards';
import { revalidatePath } from 'next/cache';
import db from '@ragenai/prisma-client';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';

export async function impersonateUserAction(userId: string) {
  await requireAppAdmin();

  await auth.api.impersonateUser({
    body: { userId },
    headers: await headers(),
  });

  revalidatePath('/');
}

export async function stopImpersonationAction() {
  await requireAppAdmin();

  await auth.api.stopImpersonating({
    headers: await headers(),
  });

  revalidatePath('/');
}

export async function banUserAction(userId: string, reason?: string) {
  await requireAppAdmin();

  await auth.api.banUser({
    body: { userId, banReason: reason },
    headers: await headers(),
  });

  trackAudit({
    action: 'user.banned',
    entityType: 'user',
    entityId: userId,
    newData: { reason },
  });

  revalidatePath('/settings/users');
}

export async function unbanUserAction(userId: string) {
  await requireAppAdmin();

  await auth.api.unbanUser({
    body: { userId },
    headers: await headers(),
  });

  trackAudit({
    action: 'user.unbanned',
    entityType: 'user',
    entityId: userId,
  });

  revalidatePath('/settings/users');
}

export async function renameUserAction(userId: string, name: string) {
  await requireAppAdmin();

  await db.user.update({
    where: { id: userId },
    data: { name },
  });

  revalidatePath('/settings/users');
}

export async function createUserAction(data: {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'user';
}) {
  await requireAppAdmin();

  await auth.api.createUser({
    body: {
      name: data.name,
      email: data.email,
      password: data.password,
      role: data.role,
    },
    headers: await headers(),
  });

  trackAudit({
    action: 'user.created',
    entityType: 'user',
    newData: { name: data.name, email: data.email, role: data.role },
  });

  revalidatePath('/settings/users');
}
