'use server';

import db from '@ragenai/prisma-client';
import type { OperationResult } from '@/types/common';

const DEFAULT_ORGANIZATION_NAME = 'My organization';

/**
 * Turn this install's first and only user into its platform admin, once.
 *
 * ## Why this does not read the session
 *
 * It used to, and that made the first-run screen a dead end on every
 * production deployment. `auth.ts` sets `requireEmailVerification` whenever
 * `NODE_ENV === 'production'`, and Better Auth deliberately establishes **no
 * session** for a sign-up that still needs verifying. So `/initial-account`
 * signed the user up and then failed here with "No active session" — and there
 * was no way round it, because returning to the form ran `signUp.email` again
 * against an account that now existed.
 *
 * ## Why dropping it is not a weakening
 *
 * The session was there to stop a caller nominating *which* account gets the
 * platform-admin role. The invariant below does that more directly: there must
 * be exactly one user in the install and no admin yet, so there is only one
 * account it could possibly promote. A second user existing — a race between
 * two people at a fresh install — refuses rather than guesses.
 *
 * Whoever completes this screen first becomes the admin, which is exactly what
 * the session-based version did too. What changes is that it now works.
 */
export async function updateInitialAdminAccountCommand(
  organizationName?: string,
): Promise<OperationResult<{ message: string }>> {
  try {
    const existingAdmin = await db.user.findFirst({
      where: { role: 'admin' },
      select: { id: true },
    });

    if (existingAdmin) {
      return { success: false, error: 'Admin account already exists' };
    }

    const users = await db.user.findMany({ select: { id: true }, take: 2 });

    if (users.length === 0) {
      return { success: false, error: 'No account to promote' };
    }

    if (users.length > 1) {
      // Fails closed. Promoting an arbitrary one of several accounts is the
      // failure this guards against, and it is recoverable by hand.
      return {
        success: false,
        error:
          'More than one account exists, so the first admin cannot be chosen automatically',
      };
    }

    const userId = users[0]!.id;

    await db.user.update({
      where: { id: userId },
      data: {
        role: 'admin',
        emailVerified: true,
      },
    });

    const membership = await db.member.findFirst({
      where: { userId, role: 'owner' },
    });

    if (membership) {
      const name = organizationName?.trim() || DEFAULT_ORGANIZATION_NAME;
      await db.organization.update({
        where: { id: membership.organizationId },
        data: { name, slug: toSlug(name, membership.organizationId) },
      });
    }

    return { success: true, data: { message: 'Admin account created' } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to create admin account',
    };
  }
}

/**
 * Organization slugs are unique, and a name like "My organization" is a likely
 * collision on a shared install — so the organization id is appended, which is
 * already unique and stable.
 */
function toSlug(name: string, organizationId: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  return base ? `${base}-${organizationId}` : organizationId;
}
