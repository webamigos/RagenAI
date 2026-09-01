import { db } from '../../services/db/db';
import { logger } from '../../services/logger';

/**
 * Record the ingested document as version 1.
 *
 * Errors are rethrown so Temporal's retry policy applies — a transient database
 * failure should not be the reason a document ends up with no history. The
 * caller in `parse-and-embed` swallows the failure once retries are exhausted,
 * because a document with embeddings and no v1 is still usable and the backfill
 * script can add one later; failing the whole ingest over it would not be.
 */
export async function createInitialDocumentVersion({
  documentId,
  organizationId,
  content,
  title,
  authorId,
  ragScore,
}: {
  documentId: string;
  organizationId: string;
  content: string;
  title: string;
  authorId: string | null;
  /** The ingest score, so v1 carries one from the moment it exists. */
  ragScore: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const created = await db.createInitialDocumentVersion({
      documentId,
      organizationId,
      content,
      title,
      authorId,
      ragScore,
    });

    if (created === 0) {
      // A replayed or retried workflow, not an error.
      logger.debug(
        { documentId },
        'createInitialDocumentVersion: document already has versions',
      );
    }
  } catch (err) {
    logger.warn({ err, documentId }, 'createInitialDocumentVersion failed');
    throw err;
  }
}
