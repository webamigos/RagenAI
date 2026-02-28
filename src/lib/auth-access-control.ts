/**
 * Centralized access control definitions — client-safe (no server imports).
 *
 * Two distinct role hierarchies:
 *   App-level:  User.role        — 'admin' (superadmin) vs 'user'
 *   Org-level:  Member.role      — 'owner' | 'admin' | 'member'
 */
import { createAccessControl } from 'better-auth/plugins/access';
import {
  defaultStatements,
  adminAc,
  ownerAc,
  memberAc,
} from 'better-auth/plugins/organization/access';

// ---------------------------------------------------------------------------
// Organization access control (Better Auth integration)
// ---------------------------------------------------------------------------

export const orgAccessControl = createAccessControl(defaultStatements);

export const orgRoles = {
  admin: adminAc,
  owner: ownerAc,
  member: memberAc,
} as const;

// ---------------------------------------------------------------------------
// App-level role constants & types
// ---------------------------------------------------------------------------

export const APP_ADMIN_ROLE = 'admin' as const;
export const APP_USER_ROLE = 'user' as const;

export type AppRole = typeof APP_ADMIN_ROLE | typeof APP_USER_ROLE;
export type OrgRole = 'owner' | 'admin' | 'member';

// ---------------------------------------------------------------------------
// Pure check functions (safe for client AND server)
// ---------------------------------------------------------------------------

export function isAppAdmin(
  user: { role?: string } | null | undefined,
): boolean {
  return user?.role === APP_ADMIN_ROLE;
}

export function isOrgAdmin(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'owner';
}

export function hasOrgRole(
  memberRole: string | null | undefined,
  requiredRole: OrgRole,
): boolean {
  if (!memberRole) {
    return false;
  }
  if (requiredRole === 'member') {
    return (
      memberRole === 'member' ||
      memberRole === 'admin' ||
      memberRole === 'owner'
    );
  }
  if (requiredRole === 'admin') {
    return memberRole === 'admin' || memberRole === 'owner';
  }
  return memberRole === 'owner';
}
