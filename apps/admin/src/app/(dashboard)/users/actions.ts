'use server';

import { APP_ADMIN_ROLE } from '@ragenai/platform-contracts';

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

  /**
   * Setting the flag is not the ban. Better Auth's admin plugin checks
   * `banned` in its `session.create` hook — at sign-in, and nowhere else — and
   * apps/web never checks it at all. apps/web's session is seven days and
   * slides on use, so without this a banned account keeps working for as long
   * as the person keeps using it.
   *
   * Deleting the rows closes it completely: the existing sessions stop
   * resolving, and the `session.create` hook refuses to issue a new one.
   */
  const { count: sessionsRevoked } = await prisma.session.deleteMany({
    where: { userId },
  });

  // `warn`, not `info`: banning is the most consequential thing this page does,
  // and it is the one an incident review is most likely to be looking for.
  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.userBanned,
    entityType: 'user',
    entityId: userId,
    after: { banned: true, banReason: reason || null, sessionsRevoked },
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

/**
 * Grant or revoke the platform-administrator role.
 *
 * The only role that decides who may use this panel was the one it could not
 * set: promoting a colleague meant an UPDATE against `users.role` by hand.
 *
 * Two refusals, because both mistakes lock people out of the panel and neither
 * can be undone from inside it:
 *
 *  - You cannot demote yourself. The obvious misclick, and the guard reads the
 *    role from the database on every request, so it takes effect on the next
 *    page load.
 *  - You cannot remove the last administrator. That one is unrecoverable
 *    without database access.
 *
 * `AUTH_ADMIN_ROLE_GRANTED` had existed in the enum since the security work
 * and had never been emitted; this is what it was for. Its counterpart,
 * `AUTH_ADMIN_ROLE_REVOKED`, was added later — filing both halves under
 * "granted" meant the incidents view, which filters on `eventType`, could not
 * answer "who lost this role".
 */
/**
 * Demote, refusing if it would leave the platform with no administrator.
 *
 * Counting and then updating is not enough. Two administrators demoting each
 * other at the same moment each count one survivor — the other — and both
 * proceed, which is how the platform ends up with zero and needs database
 * access to recover. A conditional `EXISTS` in the UPDATE does not close it
 * either: under READ COMMITTED each statement reads a snapshot taken before the
 * other transaction committed, so both still see a survivor.
 *
 * So this locks every active administrator row **ordered by id** and re-checks
 * inside the lock. The deterministic order means the two transactions queue
 * rather than deadlock, and `FOR UPDATE` re-reads each row after the lock is
 * granted — so the second one sees the first one's demotion and refuses.
 */
async function demoteUnlessLastAdmin(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const activeAdmins = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users
      WHERE role = ${APP_ADMIN_ROLE} AND banned IS NOT TRUE
      ORDER BY id
      FOR UPDATE
    `;

    const others = activeAdmins.filter((row) => row.id !== userId);
    if (others.length === 0) {
      throw new Error(
        'This is the last platform administrator — promote somebody else first.',
      );
    }

    await tx.user.update({ where: { id: userId }, data: { role: 'user' } });
  });
}

export async function setPlatformRoleAction(
  userId: string,
  makeAdmin: boolean,
): Promise<void> {
  const admin = await requireAdmin();

  if (userId === admin.id && !makeAdmin) {
    throw new Error(
      'You cannot remove your own platform-administrator role — ask another administrator.',
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });
  if (!target) {
    throw new Error('User not found');
  }

  const nextRole = makeAdmin ? APP_ADMIN_ROLE : 'user';
  if (target.role === nextRole) {
    return;
  }

  if (makeAdmin) {
    await prisma.user.update({
      where: { id: userId },
      data: { role: nextRole },
    });
  } else {
    await demoteUnlessLastAdmin(userId);
  }

  await recordAdminAction({
    admin,
    action: makeAdmin
      ? ADMIN_ACTIONS.platformRoleGranted
      : ADMIN_ACTIONS.platformRoleRevoked,
    entityType: 'user',
    entityId: userId,
    before: { role: target.role },
    after: { role: nextRole, email: target.email },
    // Always `warn`: this changes who can reach every organization's data.
    // One event type each way — see the note above.
    securityEvent: {
      eventType: makeAdmin
        ? 'AUTH_ADMIN_ROLE_GRANTED'
        : 'AUTH_ADMIN_ROLE_REVOKED',
      severity: 'warn',
    },
  });

  revalidatePath('/users');
  revalidatePath(`/users/${userId}`);
}
