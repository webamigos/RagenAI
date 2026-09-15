import db from '@ragenai/prisma-client';
import { EmbeddingStatus, ParsingStatus } from '@/generated/prisma/client';

/**
 * Clear a file's ingest status so a new run can record its own.
 *
 * **This is what makes a cancelled file re-indexable**, and it has to happen
 * here rather than in the worker's status writers, because "a new run is
 * starting" is knowledge only the producer has.
 *
 * CANCELLED is final for the run that was cancelled: the worker's
 * `updateParsingStatus` / `updateEmbeddingStatus` refuse to write over it, so
 * a late activity from a cancelled run cannot report COMPLETED. That rule used
 * to carry an exception for STARTED, which a new run writes — but a *cancelled*
 * run writes STARTED too, at the top of its embedding phase, so the exception
 * left a window: a cancel landing between the pipeline's last checkpoint and
 * its STARTED write was overwritten and lost. Resetting here removes the need
 * for the exception, and with it the window.
 *
 * `bulkReembedFilesAction` and `reembedFolderWithPolicyCommand` already did
 * this inline before starting their runs; this is the same write, in one place,
 * for every producer that restarts an ingest.
 *
 * Not best-effort: a reset that silently failed would leave the new run unable
 * to record any status at all, which looks exactly like an ingest that never
 * started.
 */
export async function resetIngestStatusForNewRun(params: {
  fileId: string;
  organizationId: string;
}): Promise<void> {
  await db.userFile.updateMany({
    where: { id: params.fileId, organizationId: params.organizationId },
    data: {
      parsingStatus: ParsingStatus.NOT_STARTED,
      embeddingStatus: EmbeddingStatus.NOT_STARTED,
    },
  });
}
