import { db } from '../../services/db/db';
import { logger } from '../../services/logger';

/**
 * Attach a score to the document's active version.
 *
 * Rethrows so Temporal's retry policy applies — a transient database failure
 * should not leave a version permanently unscored. The workflow decides whether
 * an exhausted retry budget is survivable, the same way createInitialDocument-
 * Version is handled.
 */
export async function syncRagScoreToVersion({
  documentId,
  orgId,
  ragScore,
}: {
  documentId: string;
  orgId: string;
  ragScore: Record<string, unknown>;
}): Promise<void> {
  try {
    const updated = await db.updateActiveDocumentVersionRagScore({
      documentId,
      orgId,
      ragScore,
    });

    if (updated === 0) {
      // Not an error: a document can legitimately have no version yet.
      logger.warn(
        { documentId, orgId },
        'syncRagScoreToVersion: no active version found',
      );
    }
  } catch (err) {
    logger.warn({ err, documentId, orgId }, 'syncRagScoreToVersion failed');
    throw err;
  }
}
