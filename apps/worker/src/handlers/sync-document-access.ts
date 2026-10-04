import {
  JobFailure,
  type JobContext,
  type SyncDocumentAccessPayload,
  type SyncDocumentAccessResult,
} from '@ragenai/jobs';

import type * as activities from '../activities/index.js';

/**
 * Rewrite `metadata.accessible_by` for the files whose readers just changed
 * (#1245).
 *
 * `accessible_by` is what the retrieval filter matches, and until this job it
 * was written once, at ingest. A share revoked afterwards left the document
 * retrievable by someone who could no longer see it in the knowledge base —
 * `fileAccessWhere` reads Postgres, so the listing was right and the index was
 * not.
 *
 * Started by whatever changed who may read a file, *after* its change is
 * committed. Idempotent and order-independent: every run reads the current
 * state, so a redelivered job, or two jobs for two quick changes, converge on
 * the same answer. That is also why it carries no principals.
 *
 * One step per file, so a failure retries that file rather than the folder, and
 * one file that cannot be written does not hide the rest: the failures are
 * collected and the run fails at the end, which is what makes the delivery
 * retry the whole job (idempotent) instead of leaving a half-synced folder
 * reporting success.
 */
export async function syncDocumentAccess(
  payload: SyncDocumentAccessPayload,
  ctx: JobContext,
): Promise<SyncDocumentAccessResult> {
  const { orgId } = payload;
  const fileIds = payload.fileIds ?? [];
  const folderIds = payload.folderIds ?? [];

  if (fileIds.length === 0 && folderIds.length === 0) {
    // A producer bug, and retrying cannot fix it.
    throw JobFailure.nonRetryable(
      'syncDocumentAccess needs at least one file or folder',
    );
  }

  const { resolveAccessSyncFiles } = ctx.steps<typeof activities>({
    retry: {
      initialInterval: '2 seconds',
      maximumInterval: '30 seconds',
      backoffCoefficient: 2,
      maximumAttempts: 3,
    },
    startToCloseTimeout: '2 minutes',
  });

  const { syncFileAccess } = ctx.steps<typeof activities>({
    retry: {
      initialInterval: '1 second',
      maximumInterval: '30 seconds',
      backoffCoefficient: 2,
      maximumAttempts: 5,
    },
    startToCloseTimeout: '2 minutes',
  });

  const files = await resolveAccessSyncFiles({ orgId, fileIds, folderIds });

  let filesSynced = 0;
  let filesMissing = 0;
  const failed: string[] = [];

  for (const fileId of files) {
    try {
      const outcome = await syncFileAccess({ orgId, fileId });
      if (outcome === 'missing') {
        filesMissing += 1;
      } else {
        filesSynced += 1;
      }
    } catch (error) {
      failed.push(fileId);
      // The error's class only: a vector-store error can echo the request.
      ctx.log.error(`access sync failed for file ${fileId}`, {
        orgId,
        fileId,
        error: error instanceof Error ? error.name : 'unknown error',
      });
    }
  }

  if (failed.length > 0) {
    throw new JobFailure(
      `Access sync failed for ${failed.length} of ${files.length} files in ${orgId}`,
    );
  }

  ctx.log.info('Document access synced', {
    orgId,
    filesSynced,
    filesMissing,
  });

  return { filesSynced, filesMissing };
}
