/**
 * Better Auth access-control wiring — client-safe (no server imports).
 *
 * The role *vocabulary* and the predicates over it no longer live here: they
 * are `@ragenai/platform-contracts`, because `apps/api` and `apps/admin`
 * resolve the same words and two of them used to do it by inlining
 * `role === 'admin' || role === 'owner'` (ADR-33, ADR-39). What stays is the
 * part that is genuinely this application's: the `AccessControl` objects and
 * role registries handed to Better Auth, which exist only where the auth
 * server is configured.
 *
 * Two distinct role hierarchies, never to be confused:
 *   App-level:  User.role    — 'admin' (platform operator) vs 'user'
 *   Org-level:  Member.role  — 'owner' | 'admin' | 'member'
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
// Re-exports of the shared vocabulary
// ---------------------------------------------------------------------------

/**
 * Re-exported rather than imported directly by every call site, so that
 * `@/lib/auth-access-control` stays the one import path this app's components
 * and actions reach for. The package is the single definition; this is the
 * local name for it.
 */
export {
  APP_ADMIN_ROLE,
  APP_USER_ROLE,
  ORG_ADMIN_ROLE,
  ORG_MEMBER_ROLE,
  ORG_OWNER_ROLE,
  ORG_ROLES,
  canManageOrg,
  canOwnOrg,
  hasOrgRole,
  isAppAdmin,
  isOrgRole,
  orgVisibilityScope,
} from '@ragenai/platform-contracts';
export type {
  AppRole,
  OrgRole,
  OrgVisibilityScope,
} from '@ragenai/platform-contracts';

// ---------------------------------------------------------------------------
// Organization access control (Better Auth integration)
// ---------------------------------------------------------------------------

export const orgAccessControl = createAccessControl(defaultStatements);

/**
 * The roles Better Auth will accept.
 *
 * Not decorative: the organization plugin validates the role string on invite
 * and on `addMember`, and answers `ROLE_NOT_FOUND` for anything absent here.
 * A new organization role has to be registered in this object *and* taught to
 * `@ragenai/platform-contracts` — the keys and `ORG_ROLES` are asserted to
 * agree in `__tests__/auth-access-control.test.ts`.
 */
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
