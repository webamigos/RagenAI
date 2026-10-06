/**
 * The tenant-scope model map and the pure predicate over it.
 *
 * The Prisma Client Extension that uses this cannot live here: it needs
 * `Prisma.defineExtension` from a *generated* client, and apps/web and apps/api
 * each generate their own from the shared schema. So the package owns the part
 * that has no Prisma dependency — the model list and the check — and each app
 * keeps a small binding that wraps `createTenantScopeWarnExtension`'s body
 * around it with its own client and its own logger.
 *
 * That split is the whole point: the two copies of this file were identical
 * except for the import, the logger and the comments, and the model map is the
 * half that actually has to agree.
 */
/**
 * Prisma models that carry a direct organization-scoping column, mapped to
 * that column's name. `DocumentCitation` and `DocumentRetrieval` are the
 * naming outliers (`orgId` instead of `organizationId`).
 *
 * Deliberately NOT covered (no direct column, scoped only via a relation to
 * one of the models below — e.g. `Message`/`ThreadDocument` via `Thread`,
 * `DocumentPermission` via `UserFile`/`DocumentFolder`, `ProjectPermission`/
 * `ProjectSettings` via `Project`,
 * `ThreadShare`/`ThreadPublicLink` via `Thread`): this guard has no column to
 * check for them, so a missing/incorrect scope on those models is invisible
 * to it. See AGENTS.md's "Prisma (v7)" section.
 */
export const TENANT_SCOPED_MODELS: Record<string, string> = {
  Thread: 'organizationId',
  UserFile: 'organizationId',
  UserDocument: 'organizationId',
  OrganizationSettings: 'organizationId',
  Project: 'organizationId',
  ApiKey: 'organizationId',
  Member: 'organizationId',
  Invitation: 'organizationId',
  Team: 'organizationId',
  DocumentFolder: 'organizationId',
  McpConnector: 'organizationId',
  McpConnectSelection: 'organizationId',
  McpGrantActivity: 'organizationId',
  McpOAuthToken: 'organizationId',
  AiUsage: 'organizationId',
  GoogleDriveSync: 'organizationId',
  AuditLog: 'organizationId',
  SecurityEvent: 'organizationId',
  Chatbot: 'organizationId',
  Notification: 'organizationId',
  DocumentVersion: 'organizationId',
  DocumentPair: 'organizationId',
  DocumentCitation: 'orgId',
  DocumentRetrieval: 'orgId',
  // Nullable on Guardrail, where null marks a platform rule applying to every
  // organization. The guard covers the column, not the nullability: a query
  // for one organization's rules that forgets the scope returns every
  // organization's, which is the leak. Reading platform rules deliberately
  // asks for `organizationId: null`, which is a scope, not the absence of one.
  Guardrail: 'organizationId',
  GuardrailOrgOverride: 'organizationId',
  // Ragen Brain. The three reachable through a page carry the column anyway —
  // denormalised on purpose, as DocumentVersion is, because a model the guard
  // cannot see is a model whose missing scope nothing reports.
  KnowledgePage: 'organizationId',
  KnowledgePageSource: 'organizationId',
  KnowledgeEdge: 'organizationId',
  KnowledgeFinding: 'organizationId',
  KnowledgeDecision: 'organizationId',
  // Personal memory. The guard sees the organization half of the boundary
  // only; the user half is held by apps/web's `memory-scope.ts` and an
  // architecture test, because a missing `userId` is invisible here.
  UserMemoryProfile: 'organizationId',
  UserMemory: 'organizationId',
  UserMemoryChange: 'organizationId',
};

/**
 * Prisma operations that carry the tenant scope in a top-level `where`. An
 * operation absent from this set is answered `null` ("not applicable") rather
 * than reported, so a missing name means silently unguarded queries — exported
 * so the tests can assert the set's contents, not just sample its behaviour.
 */
export const WHERE_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

type QueryArgs = Record<string, unknown>;

function hasDefinedField(value: unknown, field: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    field in value &&
    (value as Record<string, unknown>)[field] !== undefined
  );
}

/**
 * Whether a filter value pins a column to named values. A plain value does
 * (`null` included: it selects the global rows), as do `{ equals }` with a
 * value and a non-empty `{ in }`; further operators beside them only narrow.
 * Everything else is a filter that names the column without confining it:
 * `{ not }` and `{ notIn }` select every other organization, and
 * `{ equals: undefined }` or `{}` is dropped by Prisma and filters nothing.
 * Better Auth's adapter writes `eq` as `{ equals: value }`, so an undefined
 * value arrives in exactly that shape.
 */
function pinsValue(value: unknown): boolean {
  if (value === undefined) {
    return false;
  }
  if (value === null || typeof value !== 'object') {
    return true;
  }
  if (Array.isArray(value) || value instanceof Date) {
    return false;
  }
  const filter = value as Record<string, unknown>;
  if ('equals' in filter && filter.equals !== undefined) {
    return pinsValue(filter.equals);
  }
  return (
    Array.isArray(filter.in) &&
    filter.in.length > 0 &&
    filter.in.every((item) => item !== undefined && pinsValue(item))
  );
}

function pinsField(where: unknown, field: string): boolean {
  return (
    typeof where === 'object' &&
    where !== null &&
    field in where &&
    pinsValue((where as Record<string, unknown>)[field])
  );
}

/**
 * Whether a `where` constrains `field`, in any of the shapes Prisma accepts
 * for a filter that every matching row must satisfy:
 *
 * - a top-level key: `{ organizationId }`;
 * - a compound unique selector naming the column:
 *   `{ organizationId_userId: { organizationId, userId } }` — the shape
 *   `findUnique` needs, and the one the tenant-scope audit recommends;
 * - one conjunct of an `AND`: `{ AND: [{ organizationId }, { userId }] }` —
 *   how Better Auth's Prisma adapter writes every multi-field lookup;
 * - every branch of an `OR`: `{ OR: [{ organizationId }, { organizationId: null }] }`.
 *   One unscoped branch makes the whole `OR` unscoped.
 *
 * `NOT` never counts, nor does a relation filter: neither says which
 * organization a row belongs to. In every shape the value must pin the column
 * (`pinsValue`): `{ organizationId: { not: x } }` names it and scopes nothing.
 */
function whereCarriesField(where: unknown, field: string): boolean {
  if (typeof where !== 'object' || where === null) {
    return false;
  }
  if (pinsField(where, field)) {
    return true;
  }

  const clauses = where as Record<string, unknown>;
  for (const [key, value] of Object.entries(clauses)) {
    if (key.split('_').includes(field) && pinsField(value, field)) {
      return true;
    }
  }

  const conjuncts: unknown[] = [clauses.AND].flat();
  if (conjuncts.some((conjunct) => whereCarriesField(conjunct, field))) {
    return true;
  }

  const or = clauses.OR;
  return (
    Array.isArray(or) &&
    or.length > 0 &&
    or.every((branch) => whereCarriesField(branch, field))
  );
}

/**
 * A user's own memberships are read across organizations by design.
 *
 * Listing the organizations a user belongs to — Better Auth's
 * `listOrganizations`, behind the org switcher on every panel page — has to
 * read `Member` rows in every organization, so it cannot carry an
 * `organizationId`. Its adapter issues
 * `member.findMany({ where: { userId: { equals: userId } } })`.
 *
 * This is the one exemption, and it is narrow on purpose: a `Member` read
 * (`findMany`/`findFirst`) whose `where` is a single equality on `userId` —
 * bare or `{ equals }`, at the top level or as the only conjunct of an `AND`.
 * Any other key alongside it, any other operator, and every write still need
 * the organization.
 */
const OWN_MEMBERSHIPS_MODEL = 'Member';
const OWN_MEMBERSHIPS_OPERATIONS = new Set(['findMany', 'findFirst']);

function isUserIdEquality(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.length > 0;
  }
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const keys = Object.keys(value);
  const equals = (value as Record<string, unknown>).equals;
  return (
    keys.length === 1 &&
    keys[0] === 'equals' &&
    typeof equals === 'string' &&
    equals.length > 0
  );
}

function isOwnMembershipsRead(
  model: string,
  operation: string,
  where: unknown,
): boolean {
  if (
    model !== OWN_MEMBERSHIPS_MODEL ||
    !OWN_MEMBERSHIPS_OPERATIONS.has(operation)
  ) {
    return false;
  }
  if (typeof where !== 'object' || where === null) {
    return false;
  }
  const clauses = where as Record<string, unknown>;
  const keys = Object.keys(clauses);
  if (keys.length !== 1) {
    return false;
  }
  if (keys[0] === 'userId') {
    return isUserIdEquality(clauses.userId);
  }
  if (keys[0] === 'AND') {
    const conjuncts: unknown[] = [clauses.AND].flat();
    return (
      conjuncts.length === 1 &&
      isOwnMembershipsRead(model, operation, conjuncts[0])
    );
  }
  return false;
}

/**
 * Whether `args` includes the tenant-scoping field for `model`/`operation`.
 *
 * Returns `null` when `model` isn't in `TENANT_SCOPED_MODELS` (nothing to
 * check) or `operation` isn't one this guard understands (e.g. raw queries) —
 * callers should treat `null` as "not applicable", not as a violation.
 *
 * A presence check, not a proof: it cannot tell whether the value came from
 * the session. `where` is read through `whereCarriesField`; `data`/`create`
 * only at the top level, so a create that sets the organization through
 * `organization: { connect }` is reported — write the scalar column instead.
 */
export function isTenantScopeSatisfied(
  model: string,
  operation: string,
  args: QueryArgs | undefined,
): boolean | null {
  const field = TENANT_SCOPED_MODELS[model];
  if (!field) {
    return null;
  }
  if (!args) {
    return false;
  }

  if (WHERE_OPERATIONS.has(operation)) {
    return (
      whereCarriesField(args.where, field) ||
      isOwnMembershipsRead(model, operation, args.where)
    );
  }
  if (operation === 'create') {
    return hasDefinedField(args.data, field);
  }
  if (operation === 'createMany') {
    const data = args.data;
    let items: unknown[];
    if (Array.isArray(data)) {
      items = data;
    } else {
      items = data ? [data] : [];
    }
    return (
      items.length > 0 && items.every((item) => hasDefinedField(item, field))
    );
  }
  if (operation === 'upsert') {
    return (
      whereCarriesField(args.where, field) &&
      hasDefinedField(args.create, field)
    );
  }

  return null;
}

export interface TenantScopeViolation {
  model: string;
  operation: string;
}

export type { QueryArgs };
