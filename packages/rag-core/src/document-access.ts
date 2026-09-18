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
 * Known gap, recorded here because this is where the next person will look.
 *
 * `metadata.accessible_by` is written at ingest and **never refreshed**.
 * Nothing calls `syncFolderVectorPermissions` — not apps/web, not apps/api;
 * `documents.controller.ts` says so explicitly ("Nothing to wire"), and the
 * only other writer is the one-shot `backfill-accessible-by` script. So a
 * share revoked after a document was indexed still satisfies the retrieval
 * filter until that document is re-ingested.
 *
 * `fileAccessWhere` reads the database directly, so the knowledge-base listing
 * honours a revocation immediately. The lag is retrieval-only, and it is new
 * in the sense that it had nothing to lag behind before: the field was absent,
 * so the filter matched nothing and member-scope retrieval returned nothing at
 * all. Trading "no retrieval" for "retrieval that lags a revoke" is the right
 * direction, not the destination.
 *
 * Closing it means calling the sync from every path that changes who may read
 * a file — a share, an unshare, a folder move, a team change, an `isOrgWide`
 * toggle, an owner deletion — which is a larger change than the one that made
 * the field real.
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
