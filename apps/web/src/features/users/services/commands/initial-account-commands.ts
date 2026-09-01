'use server';

import db from '@ragenai/prisma-client';
import { getSession } from '@/lib/auth-guards';
import type { OperationResult } from '@/types/common';

const DEFAULT_ORGANIZATION_NAME = 'My organization';

/**
 * Turn the signed-in user into this install's platform admin, once.
 *
 * The user id comes from the session rather than the caller: this action is
 * reachable without an admin existing, which is exactly the window in which
 * accepting a client-supplied id would let anyone hand the platform-admin role
 * to an account of their choosing.
 */
export async function updateInitialAdminAccountCommand(
  organizationName?: string,
): Promise<OperationResult<{ message: string }>> {
  try {
    const session = await getSession();
    const userId = session?.user?.id;

    if (!userId) {
      return { success: false, error: 'No active session' };
    }

    const user = await db.user.findUnique({ where: { id: userId } });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const existingAdmin = await db.user.findFirst({
      where: { role: 'admin' },
    });

    if (existingAdmin) {
      return { success: false, error: 'Admin account already exists' };
    }

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
