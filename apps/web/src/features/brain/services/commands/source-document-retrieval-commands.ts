import 'server-only';

import db from '@ragenai/prisma-client';

import { deleteFileFromVectorStore } from '@/app/api/upload/services/TableService';
import { logger } from '@/app/lib/utils/logger';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
import { reembedFileCommand } from '@/features/documents/services/commands/reembed-file-command';

import type { SourceDocumentResult } from '../../contracts/brain-documents.types';
import { extractableFilesWhere } from '../queries/get-extractable-documents-query';

/**
 * Take a curated source document out of retrieval (spec E9) — mode 1's path
 * to a clean index, once the document's knowledge lives in approved pages.
 *
 * Human-triggered, per document, never automatic, and refused until at least
 * one approved page cites the document. The chunks are deleted first and the
 * status written after, so a failure leaves the document searchable and
 * saying so — never out of the index while its row claims otherwise, and
 * never the reverse. The file, its versions and every page's citations stay;
 * only its chunks go. `WITHDRAWN` is what the knowledge base shows for it.
 */
export async function withdrawSourceDocumentCommand(input: {
  orgId: string;
  fileId: string;
}): Promise<SourceDocumentResult> {
  const { orgId, fileId } = input;
  const file = await db.userFile.findFirst({
    where: { ...extractableFilesWhere(orgId), id: fileId },
    select: { id: true, embeddingStatus: true },
  });
  if (!file) {
    return { success: false, error: 'not-found' };
  }
  if (file.embeddingStatus !== 'COMPLETED') {
    return { success: false, error: 'invalid-status' };
  }
  const curated = await db.knowledgePageSource.findFirst({
    where: { organizationId: orgId, fileId, page: { status: 'APPROVED' } },
    select: { id: true },
  });
  if (!curated) {
    return { success: false, error: 'not-curated' };
  }
  try {
    await deleteFileFromVectorStore(fileId, orgId);
  } catch (error) {
    logger.error(
      {
        orgId,
        fileId,
        error: error instanceof Error ? error.message : String(error),
      },
      'brain: could not take a source document out of retrieval',
    );
    return { success: false, error: 'index-unavailable' };
  }
  await db.userFile.updateMany({
    where: { organizationId: orgId, id: fileId },
    data: { embeddingStatus: 'WITHDRAWN' },
  });
  trackAudit({
    action: 'document.withdrawn_from_retrieval',
    entityType: 'document',
    entityId: fileId,
  });
  return { success: true };
}

/**
 * Put a withdrawn source document back into retrieval (spec E9: "reversible
 * by re-running ingest") — the knowledge base's own re-embed, so the chunks
 * are exactly what an upload would produce.
 */
export async function restoreSourceDocumentCommand(input: {
  orgId: string;
  fileId: string;
}): Promise<SourceDocumentResult> {
  const { orgId, fileId } = input;
  const file = await db.userFile.findFirst({
    where: { ...extractableFilesWhere(orgId), id: fileId },
    select: { id: true, embeddingStatus: true },
  });
  if (!file) {
    return { success: false, error: 'not-found' };
  }
  if (file.embeddingStatus !== 'WITHDRAWN') {
    return { success: false, error: 'invalid-status' };
  }
  try {
    await reembedFileCommand(fileId, orgId);
  } catch (error) {
    logger.error(
      {
        orgId,
        fileId,
        error: error instanceof Error ? error.message : String(error),
      },
      'brain: could not queue a source document back into retrieval',
    );
    // The re-embed reset the status before its job failed to start. Left
    // there, the file reads "processing" for good, and neither restore nor
    // withdraw accepts it — so the "try again" the error promises could not
    // happen. Put it back, only if no run has claimed it since.
    await db.userFile.updateMany({
      where: {
        organizationId: orgId,
        id: fileId,
        embeddingStatus: 'NOT_STARTED',
      },
      data: { embeddingStatus: 'WITHDRAWN' },
    });
    return { success: false, error: 'failed-to-start' };
  }
  trackAudit({
    action: 'document.restored_to_retrieval',
    entityType: 'document',
    entityId: fileId,
  });
  return { success: true };
}
