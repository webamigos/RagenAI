/**
 * Server-side async authorization guards.
 *
 * Imports pure check functions from auth-access-control.ts and adds
 * session/member lookup logic that requires server-only imports.
 */
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { cache } from 'react';
import db from '@ragenai/prisma-client';
import { isAppAdmin, isOrgAdmin } from './auth-access-control';

// Re-export pure functions for convenience
export { isAppAdmin, isOrgAdmin, APP_ADMIN_ROLE } from './auth-access-control';
export { hasOrgRole, APP_USER_ROLE } from './auth-access-control';
export type { AppRole, OrgRole } from './auth-access-control';

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export async function getSessionOrThrow() {
  const session = await getSession();
  if (!session?.user) {
    throw new Error('Unauthorized: no active session');
  }
  return session;
}

// ---------------------------------------------------------------------------
// App-level guards
// ---------------------------------------------------------------------------

export async function requireAppAdmin() {
  const session = await getSessionOrThrow();
  if (!isAppAdmin(session.user)) {
    throw new Error('Unauthorized: app admin role required');
  }
  return session.user;
}

// ---------------------------------------------------------------------------
// Organization-level guards
// ---------------------------------------------------------------------------

export const getActiveMember = cache(async (organizationId: string) => {
  const session = await getSession();
  if (!session?.user) {
    return null;
  }

  const member = await db.member.findFirst({
    where: {
      organizationId,
      userId: session.user.id,
    },
  });

  return member;
});

export async function requireOrgAdmin(organizationId: string) {
  const member = await getActiveMember(organizationId);
  if (!member || !isOrgAdmin(member.role)) {
    throw new Error('Unauthorized: org admin or owner role required');
  }
  return member;
}

export async function requireOrgOwner(organizationId: string) {
  const member = await getActiveMember(organizationId);
  if (!member || member.role !== 'owner') {
    throw new Error('Unauthorized: org owner role required');
  }
  return member;
}
