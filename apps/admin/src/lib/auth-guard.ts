import 'server-only';

import { APP_ADMIN_ROLE } from '@ragenai/platform-contracts';
import { headers } from 'next/headers';
import { auth } from './auth';
import { prisma } from './db';

/**
 * Re-exported, not redeclared. This file used to define
 * `APP_ADMIN_ROLE = 'admin'` beside the identical constant in
 * `@ragenai/platform-contracts` — a fourth copy of a role literal, which is
 * the drift ADR-33 exists to stop.
 *
 * Keeping it exported here would only preserve the second import path that
 * caused the trouble: this module builds the whole Better Auth instance, so
 * anything reaching it for a five-character string pays several hundred
 * milliseconds and, in a test, pays them inside whichever case imports first.
 * Import the constant from the package.
 */
export { APP_ADMIN_ROLE };

export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
};

/**
 * The single authority on who may use this panel.
 *
 * Having a session is not enough. `users` is shared with apps/web, so every
 * ordinary customer account lives in the same table — the check that separates
 * a platform administrator from a customer is `User.role`, and it is read from
 * the database rather than the session so that revoking the role or banning an
 * account takes effect immediately instead of after the 5-minute cookie cache.
 *
 * Returns null instead of throwing so callers choose their own failure mode:
 * pages redirect, Server Actions throw.
 */
export async function getAdminUser(): Promise<AdminUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, role: true, banned: true },
  });

  if (!user || user.banned || user.role !== APP_ADMIN_ROLE) {
    return null;
  }

  return { id: user.id, email: user.email, name: user.name };
}

/**
 * Guard for Server Actions and any other non-page entry point.
 *
 * Server Actions are POST endpoints that do not run a route's layout, so the
 * dashboard layout's check does not protect them — each action must call this
 * itself. Throws rather than redirects: an action's caller should see the
 * failure, not a redirect it cannot follow.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const user = await getAdminUser();
  if (!user) {
    throw new Error('Forbidden: platform administrator access required.');
  }
  return user;
}
