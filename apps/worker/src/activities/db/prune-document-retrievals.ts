import { db } from '../../services/db';
import { logger } from '../../services/logger';
import { ANALYTICS_RETENTION_DAYS } from '../../consts';

export type PruneDocumentRetrievalsResult = {
  organizationsScanned: number;
  retrievalsDeleted: number;
  olderThan: string;
};

/**
 * Drop `document_retrievals` rows past the retention window.
 *
 * Unlike the demo cleanup beside it, this runs everywhere and has no
 * enable/skip switch: the table it prunes only exists because something writes
 * to it on every RAG turn, so a deployment that never prunes is a deployment
 * whose analytics table grows without bound. `ANALYTICS_RETENTION_DAYS`
 * defaults to 90, which is already further back than any panel looks.
 *
 * Deleting is the whole job — there is nothing to preserve past the window,
 * because a retrieval row is only ever read as part of a windowed aggregate.
 */
export async function pruneDocumentRetrievals(): Promise<PruneDocumentRetrievalsResult> {
  const olderThan = new Date(
    Date.now() - ANALYTICS_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const { organizationsScanned, retrievalsDeleted } =
    await db.deleteExpiredDocumentRetrievals(olderThan);

  logger.info(
    {
      olderThan: olderThan.toISOString(),
      retentionDays: ANALYTICS_RETENTION_DAYS,
      organizationsScanned,
      retrievalsDeleted,
    },
    'Document retrieval prune completed',
  );

  return {
    organizationsScanned,
    retrievalsDeleted,
    olderThan: olderThan.toISOString(),
  };
}
