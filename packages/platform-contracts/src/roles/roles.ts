/**
 * The role vocabulary, and the predicates over it.
 *
 * Two hierarchies that are never the same thing (AGENTS.md's "RBAC" section):
 *
 *   Platform  `User.role`    'admin' | 'user'              — running the platform
 *   Organization `Member.role` 'owner' | 'admin' | 'member' — permissions in one tenant
 *
 * Three applications resolve these, and two of them used to do it by inlining
 * `role === 'admin' || role === 'owner'` — `apps/api`'s projects and folders
 * services, each with a comment explaining that it was deliberately not
 * importing apps/web's copy. That is exactly the shape ADR-33 exists to
 * prevent: not duplicated helper code, but a *value* whose divergence is
 * visible only in a third place, at runtime.
 *
 * What stays out of here: the Better Auth `orgRoles` / `platformRoles`
 * registries and the `AccessControl` objects they are built from. Those import
 * `better-auth/plugins/access`, they exist only where the auth server is
 * configured (`apps/web/src/lib/auth-access-control.ts`), and this package
 * takes no framework dependency. The vocabulary is shared; the wiring is not.
 *
 * See ADR-39 for why `canManageOrg` and `orgVisibilityScope` are two functions
 * rather than the one boolean this file replaced.
 */

// ---------------------------------------------------------------------------
// Organization roles
// ---------------------------------------------------------------------------

export const ORG_OWNER_ROLE = 'owner' as const;
export const ORG_ADMIN_ROLE = 'admin' as const;
export const ORG_MEMBER_ROLE = 'member' as const;

/**
 * Every organization role, weakest first.
 *
 * Order is meaningful — `hasOrgRole` reads it as a rank. A role that is not a
 * rank (one that sees more data but administers less, the "manager" case in
 * ADR-39) does not belong in this array; it needs its own predicate, because
 * placing it on this line would make `hasOrgRole` answer wrongly in one
 * direction or the other.
 */
export const ORG_ROLES = [
  ORG_MEMBER_ROLE,
  ORG_ADMIN_ROLE,
  ORG_OWNER_ROLE,
] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

export function isOrgRole(value: unknown): value is OrgRole {
  return (
    typeof value === 'string' &&
    (ORG_ROLES as readonly string[]).includes(value)
  );
}

/**
 * May this role administer the organization — settings, members, API keys,
 * connectors, billing?
 *
 * One of the two meanings the former `isOrgAdmin` carried. This is the one
 * about *acting*; `orgVisibilityScope` is the one about *seeing*. They agree
 * for all three roles today and are still separate functions, because the next
 * role added is the one that makes them disagree, and a caller has to have
 * already said which of the two it meant.
 */
export function canManageOrg(role: string | null | undefined): boolean {
  return role === ORG_ADMIN_ROLE || role === ORG_OWNER_ROLE;
}

/** May this role transfer or delete the organization itself? */
export function canOwnOrg(role: string | null | undefined): boolean {
  return role === ORG_OWNER_ROLE;
}

/**
 * How much of an organization's data this actor may see.
 *
 * `'organization'` — every row in the tenant, regardless of who owns it.
 * `'member'`       — own rows, plus what has been shared with the member or
 *                    with one of their teams.
 * `'none'`         — nothing at all. Not a member of this organization.
 *
 * The second of the two meanings the former `isOrgAdmin` carried. It is a
 * value rather than a boolean so that `fileAccessWhere` has somewhere to put a
 * further answer — "the teams I manage" — without every caller re-deciding
 * what the boolean meant.
 *
 * **Why `'none'` is separate from `'member'`.** It was not, originally, and
 * that made `'member'` do double duty: a real member, and someone whose
 * session names an organization they do not belong to. The member filter
 * always admits `{ ownerId: null }` — files that predate ownership, treated as
 * org-wide on purpose — so the outsider reached those. Narrow for a member is
 * not narrow enough for a non-member, and one enum value cannot be both.
 */
export type OrgVisibilityScope = 'organization' | 'member' | 'none';

/**
 * The principal a `'none'` scope filters the vector store on.
 *
 * Ingest writes `metadata.accessible_by` as `org:<id>` / `user:<id>` /
 * `team:<id>`, so a value with no prefix matches no chunk that exists. It is
 * declared here, once, because both RAG chains (apps/web's and apps/api's)
 * build that filter independently: two hand-written sentinels would look alike
 * until one of them was edited into something a real principal could equal,
 * and a filter that silently starts matching is the failure this exists to
 * prevent.
 *
 * Note this is a *deny* sentinel: the filter must always be an equality on it,
 * never a negation.
 */
export const NO_ACCESS_PRINCIPAL = '__no_access__' as const;

/**
 * Resolve the scope from a `Member.role`.
 *
 * `null`/`undefined` means **no membership row was found**, which is the only
 * way this is called for a non-member — `Member.role` is non-nullable in the
 * schema, so a member always has one. Hence `'none'` rather than `'member'`.
 *
 * An unrecognised non-null role still resolves to `'member'`: whoever holds it
 * *is* a member, and `'member'` is already the floor for one. A role this
 * module has not been taught should see less than an admin, not less than
 * everyone.
 */
export function orgVisibilityScope(
  role: string | null | undefined,
): OrgVisibilityScope {
  if (canManageOrg(role)) {
    return 'organization';
  }
  return role == null ? 'none' : 'member';
}

/**
 * Rank test over `ORG_ROLES`: does `memberRole` reach `requiredRole`?
 *
 * Only meaningful while every organization role sits on a single line. Kept
 * because member management genuinely is a rank question — an admin may not
 * demote an owner — but it is not the function to reach for when asking
 * whether someone may *do* or *see* something. Use `canManageOrg` /
 * `orgVisibilityScope` for those.
 */
export function hasOrgRole(
  memberRole: string | null | undefined,
  requiredRole: OrgRole,
): boolean {
  if (!isOrgRole(memberRole)) {
    return false;
  }
  return ORG_ROLES.indexOf(memberRole) >= ORG_ROLES.indexOf(requiredRole);
}

// ---------------------------------------------------------------------------
// Platform roles
// ---------------------------------------------------------------------------

export const APP_ADMIN_ROLE = 'admin' as const;
export const APP_USER_ROLE = 'user' as const;

export type AppRole = typeof APP_ADMIN_ROLE | typeof APP_USER_ROLE;

/**
 * A platform administrator — an operator of the installation, not a member of
 * any particular tenant.
 *
 * Deliberately takes the user rather than the role string: the two hierarchies
 * use the same two words (`'admin'`), and a bare string at a call site cannot
 * say which one it came from. Passing `user` makes `User.role` the only thing
 * that can be read here.
 */
export function isAppAdmin(
  user: { role?: string | null } | null | undefined,
): boolean {
  return user?.role === APP_ADMIN_ROLE;
}
