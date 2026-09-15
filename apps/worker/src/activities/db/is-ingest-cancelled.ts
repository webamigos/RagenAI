import { db } from '../../services/db/index.js';
import { type UserFile } from '../../types/UserFile.js';

/**
 * The cancellation checkpoint, as an activity.
 *
 * It has to be one. A Temporal workflow runs in a sandbox with no I/O, so a
 * handler asking `ctx.checkCancelled()` cannot read the database itself — the
 * seam's contract is engine-neutral, and on this engine the only way to
 * satisfy it is an activity. On BullMQ the same context calls the same query
 * directly, with no activity in between.
 *
 * Deliberately unlogged. It runs about five times per ingest and answers
 * "no" almost every time; a log line per call would bury the one that matters.
 */
export async function isIngestCancelled({
  fileId,
  orgId,
}: {
  fileId: UserFile['id'];
  orgId: UserFile['organizationId'];
}): Promise<boolean> {
  return await db.isIngestCancelled(fileId, orgId);
}
