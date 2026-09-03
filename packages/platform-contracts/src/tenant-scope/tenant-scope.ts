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
 * that column's name. `DocumentCitation` is the one naming outlier (`orgId`
 * instead of `organizationId`).
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
  McpOAuthToken: 'organizationId',
  AiUsage: 'organizationId',
  GoogleDriveSync: 'organizationId',
  AuditLog: 'organizationId',
  SecurityEvent: 'organizationId',
  Chatbot: 'organizationId',
  Notification: 'organizationId',
  DocumentVersion: 'organizationId',
  DocumentCitation: 'orgId',
};

const WHERE_OPERATIONS = new Set([
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
 * Whether `args` includes the tenant-scoping field for `model`/`operation`.
 *
 * Returns `null` when `model` isn't in `TENANT_SCOPED_MODELS` (nothing to
 * check) or `operation` isn't one this guard understands (e.g. raw queries) —
 * callers should treat `null` as "not applicable", not as a violation.
 *
 * Only checks the top-level `where`/`data`/`create`/`update` key — current
 * call sites always thread the org field as a sibling key there, never
 * nested inside `AND`/`OR`/a relation filter, so a deeper check isn't
 * needed yet (see the tenant-scoping research this file's tests are based
 * on).
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
    return hasDefinedField(args.where, field);
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
      hasDefinedField(args.where, field) && hasDefinedField(args.create, field)
    );
  }

  return null;
}

export interface TenantScopeViolation {
  model: string;
  operation: string;
}

export type { QueryArgs };
