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
import {
  defaultAc as platformAc,
  userAc as platformUserAc,
} from 'better-auth/plugins/admin/access';

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
// Platform (app-level) access control — impersonation removed
// ---------------------------------------------------------------------------

/**
 * The platform-administrator role, with `user: ["impersonate"]` withheld.
 *
 * Impersonation was withdrawn as a product decision: an operator does not
 * need to read customer messages to run the platform. Removing the UI was not
 * enough — Better Auth's `admin` plugin exposes
 * `POST /api/auth/admin/impersonate-user`, and its route authorizes on this
 * permission, so the endpoint answered for any account holding the role while
 * no button anywhere called it.
 *
 * There is no `disableImpersonation` option in better-auth 1.7.2; the plugin
 * accepts only `adminRoles`, `defaultRole`, `roles`, `bannedUserMessage` and
 * `schema`. Withholding the permission is the mechanism the route itself
 * checks — `hasPermission` reads `options.roles || defaultRoles`, so passing
 * these replaces the defaults entirely rather than merging with them.
 *
 * Everything else the built-in `adminAc` grants is kept verbatim, so banning,
 * role changes and session revocation are unaffected. Note the built-in role
 * already withholds `impersonate-admins`; this withholds plain `impersonate`
 * as well, which is the one that reached ordinary customers.
 */
export const platformAdminAc = platformAc.newRole({
  user: [
    'create',
    'list',
    'set-role',
    'ban',
    'delete',
    'set-password',
    'set-email',
    'get',
    'update',
  ],
  session: ['list', 'revoke', 'delete'],
});

export const platformRoles = {
  admin: platformAdminAc,
  user: platformUserAc,
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
  user: { role?: string | null } | null | undefined,
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
