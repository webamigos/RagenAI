import { db } from '../../services/db/index.js';

/**
 * The active version of a file's document, read when a job runs rather than
 * when it was enqueued. `runFileEmbeddings` asks before it re-parses a stored
 * upload on behalf of a re-embed: the version that was the upload when the
 * job was queued may be an edit by now.
 */
export async function getActiveDocumentVersion({
  fileId,
  orgId,
}: {
  fileId: string;
  orgId: string;
}): Promise<{ documentId: string; changeType: string } | null> {
  return await db.getActiveDocumentVersion(fileId, orgId);
}
