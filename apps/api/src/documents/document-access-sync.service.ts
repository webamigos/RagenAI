import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { Workflow } from '../jobs/jobs.consts.js';
import { JobsService } from '../jobs/jobs.service.js';

/**
 * What a change touched: files directly, or folders whose whole subtree is
 * affected (a folder share, a folder move, a folder's team).
 */
export type AccessChange = { fileIds?: string[]; folderIds?: string[] };

/**
 * Tells the worker that who may read some files has changed (#1245).
 *
 * `metadata.accessible_by` on a file's vector points is the retrieval filter,
 * and it is written at ingest. Every code path that changes who may read a
 * file therefore has to call {@link afterChange} once the change is committed,
 * or a revoked principal keeps retrieving until the file is re-ingested. The
 * knowledge-base listing reads Postgres and is right immediately; this is what
 * makes retrieval as prompt.
 *
 * Call it **after** the change is durable, never before: the job reads the
 * database when it runs, and one that ran first would write the old answer.
 *
 * Never throws. The change has already happened and the caller has to report
 * it as done — failing the request would leave a revoke that took effect
 * answering "error", with nothing the user could retry (the permission row is
 * gone). A failed enqueue is logged at `error` with the identifiers and
 * nothing else; it means the queue's Redis is unreachable, which stops ingest
 * and every other job too, so it is loud elsewhere before it is quiet here.
 */
@Injectable()
export class DocumentAccessSyncService {
  private readonly logger = new Logger(DocumentAccessSyncService.name);

  constructor(private readonly jobs: JobsService) {}

  async afterChange(
    organizationId: string,
    change: AccessChange,
  ): Promise<void> {
    const fileIds = change.fileIds ?? [];
    const folderIds = change.folderIds ?? [];

    if (fileIds.length === 0 && folderIds.length === 0) {
      return;
    }

    try {
      // A fresh run id each time, on purpose: two changes in quick succession
      // are two jobs, and each reads the state as it is when it runs.
      await this.jobs.start(
        Workflow.SYNC_DOCUMENT_ACCESS,
        `access-${randomUUID()}`,
        { orgId: organizationId, fileIds, folderIds },
      );
    } catch (error) {
      this.logger.error(
        `Could not queue the access sync (organizationId=${organizationId}, files=${fileIds.length}, folders=${folderIds.length}); ` +
          'retrieval may keep serving the previous readers until the file is re-ingested',
        error instanceof Error ? error.name : undefined,
      );
    }
  }
}
