import { db } from '../../services/db/index.js';

/**
 * Read a document's current text, for a job that no longer carries it.
 *
 * The text used to ride in the job payload. On Temporal that meant a copy in
 * workflow history; on BullMQ it means a copy in Redis, which is neither
 * encrypted nor covered by the retention anyone reasons about — a document's
 * full text sitting in a queue is the sort of thing you find out about later.
 *
 * Reading it here also fixes a staleness the payload version had: the job
 * embeds what the document says now, not what it said when the job was
 * enqueued.
 */
export async function getDocumentContent({
  documentId,
  orgId,
}: {
  documentId: string;
  orgId: string;
}): Promise<{ content: string; title: string | null } | null> {
  return await db.getDocumentContent(documentId, orgId);
}
