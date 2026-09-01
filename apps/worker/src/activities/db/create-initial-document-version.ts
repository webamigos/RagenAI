import { db } from '../../services/db/db';
import { logger } from '../../services/logger';

/**
 * Record the ingested document as version 1.
 *
 * Best-effort, like the summary and scoring steps around it: a document whose
 * history failed to start is still a usable document, and failing the whole
 * ingest over it would be a worse outcome than a missing v1 that the backfill
 * script can add later.
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
    logger.warn(
      { err, documentId },
      'createInitialDocumentVersion failed — continuing without an initial version',
    );
  }
}
