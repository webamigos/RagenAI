import db from '@ragenai/prisma-client';
import { nanoid } from 'nanoid';

import { logger } from '@/app/lib/utils/logger';
import { EmbeddingStatus, ParsingStatus } from '@/generated/prisma/client';
import { startFileReindexCommand } from './start-file-reindex-command';

export interface ReindexForContextResult {
  started: number;
  failed: number;
}

/**
 * Re-index the given files so they gain the current context prefix (spec
 * 2026-09-29-contextual-chunks, C1). The caller passes the ids
 * `getContextVersionStatusQuery` found stale; they are looked up again here
 * under the organization, so an id from anywhere else matches nothing.
 *
 * Each file is reset to NOT_STARTED with its new run id before its job
 * starts — the worker's status writers refuse to write over CANCELLED — and
 * `startFileReindexCommand` picks the job, so an edited document re-indexes
 * its active version rather than the original upload. A start that fails
 * puts the file's previous status back, conditional on the row still
 * carrying the failed run's id, and the loop goes on. The jobs join the
 * ordinary ingest queue, whose Docling ceiling bounds them as it bounds an
 * upload.
 */
export async function reindexForContextCommand({
  organizationId,
  fileIds,
  userId = null,
}: {
  organizationId: string;
  fileIds: readonly string[];
  userId?: string | null;
}): Promise<ReindexForContextResult> {
  const files = await db.userFile.findMany({
    where: {
      organizationId,
      id: { in: [...fileIds] },
      publishedPages: { none: {} },
    },
    select: {
      id: true,
      fileName: true,
      projectId: true,
      parsingStatus: true,
      embeddingStatus: true,
      workflowId: true,
    },
  });

  const result: ReindexForContextResult = { started: 0, failed: 0 };
  for (const file of files) {
    const workflowId = `reindex-context-${nanoid()}`;
    await db.userFile.updateMany({
      where: { id: file.id, organizationId },
      data: {
        parsingStatus: ParsingStatus.NOT_STARTED,
        embeddingStatus: EmbeddingStatus.NOT_STARTED,
        workflowId,
      },
    });
    try {
      await startFileReindexCommand({
        file,
        organizationId,
        workflowId,
        userId,
      });
      result.started += 1;
    } catch (err) {
      result.failed += 1;
      logger.error(
        { err, fileId: file.id },
        'reindexForContextCommand: job start failed; restoring the status',
      );
      await db.userFile
        .updateMany({
          where: { id: file.id, organizationId, workflowId },
          data: {
            parsingStatus: file.parsingStatus,
            embeddingStatus: file.embeddingStatus,
            workflowId: file.workflowId,
          },
        })
        .catch((restoreError: unknown) => {
          logger.error(
            { err: restoreError, fileId: file.id },
            'reindexForContextCommand: could not restore the status',
          );
        });
    }
  }
  return result;
}
