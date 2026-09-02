'use server';

import { requireAdmin } from '@/lib/auth-guard';
import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

/**
 * A user can belong to several organizations, or none, so these actions have no
 * single `organizationId` and cannot go in `AuditLog`. They are recorded as
 * `ADMIN_USER_ACTION` security events instead — see `src/lib/audit.ts`.
 */

export async function renameUserAction(userId: string, name: string) {
  const admin = await requireAdmin();
  if (!name.trim()) {
    throw new Error('Name cannot be empty');
  }

  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { name: name.trim() },
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.userRenamed,
    entityType: 'user',
    entityId: userId,
    before: before ?? null,
    after: { name: name.trim() },
    securityEvent: { eventType: 'ADMIN_USER_ACTION' },
  });

  revalidatePath('/users');
  revalidatePath(`/users/${userId}`);
}

export async function banUserAction(userId: string, reason?: string) {
  const admin = await requireAdmin();
  await prisma.user.update({
    where: { id: userId },
    data: {
      banned: true,
      banReason: reason || null,
    },
  });

  // `warn`, not `info`: banning is the most consequential thing this page does,
  // and it is the one an incident review is most likely to be looking for.
  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.userBanned,
    entityType: 'user',
    entityId: userId,
    after: { banned: true, banReason: reason || null },
    securityEvent: { eventType: 'ADMIN_USER_ACTION', severity: 'warn' },
  });

  revalidatePath('/users');
  revalidatePath(`/users/${userId}`);
}

export async function unbanUserAction(userId: string) {
  const admin = await requireAdmin();
  await prisma.user.update({
    where: { id: userId },
    data: {
      banned: false,
      banReason: null,
      banExpires: null,
    },
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.userUnbanned,
    entityType: 'user',
    entityId: userId,
    after: { banned: false },
    securityEvent: { eventType: 'ADMIN_USER_ACTION' },
  });

  revalidatePath('/users');
  revalidatePath(`/users/${userId}`);
}
