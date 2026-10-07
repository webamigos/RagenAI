/**
 * Who may retrieve a document's chunks.
 *
 * `metadata.accessible_by` on a vector-store point is the retrieval side of
 * document access control: `buildMetadataFilter` asks for a point whose
 * `accessible_by` names one of the caller's principals, so this array and
 * `fileAccessWhere`'s SQL are two spellings of the same rule and have to agree.
 * They did not. The computation lived as two copies —
 * `apps/web`'s `sync-vector-permissions-command` and `apps/api`'s
 * `VectorPermissionsService` — and both still keyed org-wide sharing off a
 * null owner, which is exactly what the `is_org_wide` migration
 * (20260909180000) was written to stop meaning:
 *
 *   - a file whose owner had been deleted (the FK is ON DELETE SET NULL)
 *     was published to the whole organization, and
 *   - a file deliberately shared with the organization reached nobody but
 *     its owner, because `isOrgWide` was never read here.
 *
 * The DB reads stay with each caller — they have different Prisma clients —
 * but the rule itself is here, once, so a third caller (the worker's ingest,
 * which is what writes the field in the first place) cannot introduce a third
 * interpretation.
 */

/**
 * How `accessible_by` stays current (#1245).
 *
 * The field is written at ingest, and **rewritten by the `syncDocumentAccess`
 * job** (`apps/worker/src/handlers/sync-document-access.ts`) whenever something
 * changes who may read a file. The job reads the database when it runs, so it
 * carries no principals and two quick changes converge on the later state. The
 * three ingest handlers read the principals again after writing their points,
 * because an ingest takes them before a write that can last minutes.
 *
 * What still has to hold is on the producers: every path that changes who may
 * read a file — a share, an unshare, a file or folder move, a team change, an
 * `isOrgWide` toggle, an owner deletion — starts the job after it commits.
 * `fileAccessWhere` reads Postgres directly, so the knowledge-base listing was
 * always right the moment a grant was revoked; this is what makes retrieval as
 * prompt.
 *
 * `syncFolderVectorPermissions`, in apps/web and apps/api, was the earlier
 * attempt and is deleted: it had no call site, and it wrote
 * `'metadata.accessible_by'` as a dotted payload key, which Qdrant stores as a
 * literal top-level field — the call succeeded and the retrieval filter never
 * saw it.
 */

/** A permission row, from a file, its folder, or one of that folder's ancestors. */
export type DocumentAccessGrant = {
  granteeType: string;
  granteeId: string;
};

export type DocumentAccessInput = {
  organizationId: string;
  /**
   * Null when nobody owns the file — which since the `is_org_wide` migration
   * means exactly that, and no longer doubles as "shared with everyone".
   */
  ownerId: string | null;
  /** Shared with the whole organization, stated rather than inferred. */
  isOrgWide: boolean;
  /** The team the containing folder belongs to, when it belongs to one. */
  folderTeamId?: string | null;
  /** Grants on the file, on its folder, and on that folder's ancestors. */
  grants?: readonly DocumentAccessGrant[];
};

/**
 * The principals allowed to retrieve this document, as
 * `org:<id>` / `user:<id>` / `team:<id>` strings.
 *
 * An empty result is meaningful and is returned as such: a file owned by
 * nobody, shared with nobody and granted to nobody is reachable at
 * organization scope only, and `match_any` against an empty array matches
 * nothing — which is the answer. Callers must not read empty as
 * "unrestricted".
 */
export function computeAccessiblePrincipals({
  organizationId,
  ownerId,
  isOrgWide,
  folderTeamId,
  grants = [],
}: DocumentAccessInput): string[] {
  const principals = new Set<string>();

  if (isOrgWide) {
    principals.add(`org:${organizationId}`);
  }

  if (ownerId) {
    principals.add(`user:${ownerId}`);
  }

  if (folderTeamId) {
    principals.add(`team:${folderTeamId}`);
  }

  for (const grant of grants) {
    if (grant.granteeType === 'user') {
      principals.add(`user:${grant.granteeId}`);
    } else if (grant.granteeType === 'team') {
      principals.add(`team:${grant.granteeId}`);
    }
  }

  return Array.from(principals);
}

/**
 * Who is asking, for the purpose of reaching a document.
 *
 * `scope` is derived from the *organization* role (`Member.role`), never
 * `User.role` — a platform admin has no implicit claim on a tenant's
 * documents.
 *
 * It is a scope rather than an `isOrgAdmin` boolean because those were two
 * questions wearing one answer: "may administer the organization" and "may see
 * every row in it" (ADR-39). Only the second one belongs here, and a value
 * leaves room for the third answer a team-scoped role would need without
 * every caller re-deciding what a boolean meant.
 */
export type DocumentActor = {
  userId: string | null;
  teamIds: string[];
  scope: OrgVisibilityScope;
};

/**
 * `OrgVisibilityScope` from platform-contracts, spelled out: this package does
 * not depend on it, and the three values are the contract.
 */
export type OrgVisibilityScope = 'organization' | 'member' | 'none';

/**
 * The shape of a `UserFile` where-clause, without Prisma: each app has its own
 * generated client, so the rule lives here as plain data and each caller
 * hands it to its own client (`as Prisma.UserFileWhereInput`).
 */
export type FileAccessWhere =
  | Record<string, never>
  | { id: { in: never[] } }
  | { OR: Record<string, unknown>[] };

/**
 * The single definition of "which files may this actor read".
 *
 * Every path that reaches a file — the knowledge-base listing, the assistant's
 * picker, and each by-id route — composes this rather than restating it. The
 * restating is what went wrong before: the listing filtered correctly while
 * `/api/files/[fileId]` and its neighbours checked only `organizationId`, so
 * any member could read any file in their own org by id. Two predicates that
 * are supposed to agree will eventually not.
 *
 * Returns `{}` for the `'organization'` scope (everything in the org) and an
 * `OR` otherwise. Callers must still apply `organizationId` themselves — this
 * says nothing about tenancy, and the two checks are separate on purpose.
 *
 * Deliberately pure, and deliberately free of any auth or session import: it
 * is reached from queries that component tests render under jsdom, and pulling
 * the session stack in here made those fail on an unrelated module. Resolving
 * an actor from the session lives in `get-document-actor.ts`.
 */
export function fileAccessWhere(actor: DocumentActor): FileAccessWhere {
  if (actor.scope === 'organization') {
    return {};
  }

  // A non-member reaches nothing, including the unowned files below. That arm
  // is a deliberate allowance for content that predates ownership — org-wide
  // *within the org* — and an actor with no membership row is not within it.
  // `id: { in: [] }` rather than an empty `OR`, whose emptiness is easy to
  // read as "no restriction" at a glance.
  if (actor.scope === 'none') {
    return { id: { in: [] } };
  }

  const { userId, teamIds } = actor;
  const hasTeams = teamIds.length > 0;

  return {
    OR: [
      // Shared with the whole organization, and said so. This used to be
      // `{ ownerId: null }`, which also matched every file whose owner had
      // been deleted — the FK is ON DELETE SET NULL, so removing a user
      // published their private files to the org.
      { isOrgWide: true },
      ...(userId ? [{ ownerId: userId }] : []),
      // Bound to a team through the folder itself.
      ...(hasTeams ? [{ folder: { teamId: { in: teamIds } } }] : []),
      // Granted on the file.
      ...(userId
        ? [
            {
              permissions: { some: { granteeType: 'user', granteeId: userId } },
            },
          ]
        : []),
      ...(hasTeams
        ? [
            {
              permissions: {
                some: { granteeType: 'team', granteeId: { in: teamIds } },
              },
            },
          ]
        : []),
      // Granted on the containing folder. Inherited rather than copied onto
      // each file, so this arm is what makes a folder share mean anything.
      ...(userId
        ? [
            {
              folder: {
                permissions: {
                  some: { granteeType: 'user', granteeId: userId },
                },
              },
            },
          ]
        : []),
      ...(hasTeams
        ? [
            {
              folder: {
                permissions: {
                  some: { granteeType: 'team', granteeId: { in: teamIds } },
                },
              },
            },
          ]
        : []),
    ],
  };
}
