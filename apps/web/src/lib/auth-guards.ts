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
import { recordSecurityEvent } from '@/features/security/services/commands/record-security-event-command';

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

/**
 * Organization admin, or a platform administrator acting on this organization.
 *
 * The `/organization/*` layout lets a platform administrator in without a
 * membership — an access bypass, not a wider view: the page still reports one
 * organization, the active one. Actions behind those pages have to agree, and
 * for three of them they briefly did not: the page rendered while every
 * action threw `Unauthorized`.
 *
 * Worse than a broken page. `requireOrgAdmin` classifies a missing membership
 * as `CROSS_ORG_ACCESS_ATTEMPTED` and records a security event, so an
 * operator simply opening those pages filled the panel's own Incidents view
 * with alerts about themselves.
 *
 * Returns the `Member` for an organization admin and `null` for a platform
 * administrator who is not one — callers scope by `organizationId`, not by
 * the membership, so nothing downstream needs it.
 */
export async function requireOrgAdminOrAppAdmin(organizationId: string) {
  const session = await getSessionOrThrow();
  if (isAppAdmin(session.user)) {
    return null;
  }
  return requireOrgAdmin(organizationId);
}

export async function requireOrgAdmin(organizationId: string) {
  const member = await getActiveMember(organizationId);
  if (!member || !isOrgAdmin(member.role)) {
    const session = await getSession();
    // Classify as cross-org attempt only when the user IS authenticated
    // but doesn't have a membership in this org — bare 'no session' is
    // just unauth, not a security event worth paging an admin.
    if (session?.user) {
      recordSecurityEvent({
        eventType: member
          ? 'UNAUTHORIZED_ACCESS_ATTEMPTED'
          : 'CROSS_ORG_ACCESS_ATTEMPTED',
        severity: 'warn',
        source: 'auth',
        organizationId,
        userId: session.user.id,
        metadata: {
          requiredRole: 'orgAdmin',
          actualRole: member?.role ?? null,
        },
      });
    }
    throw new Error('Unauthorized: org admin or owner role required');
  }
  return member;
}

export async function requireOrgOwner(organizationId: string) {
  const member = await getActiveMember(organizationId);
  if (!member || member.role !== 'owner') {
    const session = await getSession();
    if (session?.user) {
      recordSecurityEvent({
        eventType: member
          ? 'UNAUTHORIZED_ACCESS_ATTEMPTED'
          : 'CROSS_ORG_ACCESS_ATTEMPTED',
        severity: 'warn',
        source: 'auth',
        organizationId,
        userId: session.user.id,
        metadata: {
          requiredRole: 'orgOwner',
          actualRole: member?.role ?? null,
        },
      });
    }
    throw new Error('Unauthorized: org owner role required');
  }
  return member;
}

// ---------------------------------------------------------------------------
// Team-level guards
// ---------------------------------------------------------------------------

export const getUserTeamIds = cache(
  async (organizationId: string, userId: string): Promise<string[]> => {
    const memberships = await db.teamMember.findMany({
      where: {
        userId,
        team: { organizationId },
      },
      select: { teamId: true },
    });

    return memberships.map((m) => m.teamId);
  },
);

export async function requireTeamMember(
  teamId: string,
  organizationId: string,
) {
  const session = await getSessionOrThrow();

  const membership = await db.teamMember.findFirst({
    where: {
      teamId,
      userId: session.user.id,
      team: { organizationId },
    },
  });

  if (!membership) {
    throw new Error('Unauthorized: team membership required');
  }

  return membership;
}
