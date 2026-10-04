import { computeAccessiblePrincipals } from '@ragenai/rag-core';

import { db } from '../../services/db/index.js';
import { qdrantService } from '../../services/qdrant.js';

export type SyncFileAccessOutcome = 'synced' | 'unchanged' | 'missing';

const sameMembers = (a: readonly string[], b: readonly string[]): boolean => {
  const left = new Set(a);
  const right = new Set(b);

  return (
    left.size === right.size && [...left].every((member) => right.has(member))
  );
};

/**
 * Make `metadata.accessible_by` on a file's points say who may read the file
 * *now* (#1245).
 *
 * The principals are read from the database inside this activity, at the
 * moment it runs. Two callers rely on that:
 *
 * - the `syncDocumentAccess` job, started after a permission change, which
 *   carries identifiers and no principals — so two changes in quick succession
 *   both end in the later state, whichever order their jobs run in;
 * - the three ingest handlers, which pass what they wrote as `unlessEqualTo`.
 *   An ingest takes its principals before it writes, and the write can take
 *   minutes, so a revoke that lands in between would otherwise be overwritten
 *   by the older snapshot — the shape of the original review finding on #1244.
 *   Re-reading *after* the points exist closes it: a change before that is seen
 *   here, and one after it is the job's to apply, to points that now exist.
 *
 * `missing` is a file that is gone from the organization. Nothing is written:
 * its vectors are removed by the delete path, and an empty `accessible_by`
 * would only dress a stale point up as deliberately unreachable.
 */
export const syncFileAccess = async ({
  orgId,
  fileId,
  unlessEqualTo,
}: {
  orgId: string;
  fileId: string;
  unlessEqualTo?: readonly string[];
}): Promise<SyncFileAccessOutcome> => {
  const rows = await db.getFileAccessRows(fileId, orgId);

  if (!rows) {
    return 'missing';
  }

  const accessibleBy = computeAccessiblePrincipals({
    organizationId: orgId,
    ownerId: rows.ownerId,
    isOrgWide: rows.isOrgWide,
    folderTeamId: rows.folderTeamId,
    grants: rows.grants,
  });

  if (unlessEqualTo && sameMembers(unlessEqualTo, accessibleBy)) {
    return 'unchanged';
  }

  await qdrantService.setFileAccess({ orgId, fileId, accessibleBy });

  return 'synced';
};
