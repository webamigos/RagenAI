import 'server-only';

import { randomUUID } from 'node:crypto';

import db from '@ragenai/prisma-client';

import { logger } from '@/app/lib/utils/logger';
import { jobs } from '@/libs/jobs';

import type { ExtractionStartResult } from '../../contracts/brain-extraction.types';
import { extractableFilesWhere } from '../queries/get-extractable-documents-query';

/**
 * Start a `brainExtract` run over documents a person chose (spec D3).
 *
 * The file ids come from the browser, so they are filtered here against the
 * organization and `extractableFilesWhere` — an id from another organization
 * is dropped exactly like one that does not exist, and the run is started
 * only for what is left. The run's budget (documents and tokens) is the
 * worker's, read when it runs; the flag is checked there too.
 *
 * Retrying one `EXTRACTION_FAILED` document is this with one file id: the
 * worker resolves the finding when that document extracts.
 */
export async function startBrainExtractionCommand(input: {
  orgId: string;
  userId: string;
  fileIds: string[];
}): Promise<ExtractionStartResult> {
  const files = await db.userFile.findMany({
    where: {
      ...extractableFilesWhere(input.orgId),
      id: { in: [...new Set(input.fileIds)] },
    },
    select: { id: true },
  });
  if (files.length === 0) {
    return { success: false, error: 'no-documents' };
  }
  const fileIds = files.map((f) => f.id);
  try {
    await jobs().start('brainExtract', `brain-extract-${randomUUID()}`, {
      orgId: input.orgId,
      fileIds,
      userId: input.userId,
    });
  } catch (error) {
    logger.error(
      {
        orgId: input.orgId,
        documents: fileIds.length,
        error: error instanceof Error ? error.message : String(error),
      },
      'brain: could not start an extraction run',
    );
    return { success: false, error: 'failed-to-start' };
  }
  logger.info(
    { orgId: input.orgId, documents: fileIds.length },
    'brain: extraction run started from the panel',
  );
  return { success: true, documents: fileIds.length };
}

/**
 * Retry the document an open `EXTRACTION_FAILED` finding names (spec D3).
 * The finding stays open until the document extracts; the worker resolves it
 * then (`resolveExtractionFailed`), so a retry that fails again leaves it
 * where a person will see it.
 */
export async function retryExtractionFindingCommand(input: {
  orgId: string;
  userId: string;
  findingPublicId: string;
}): Promise<ExtractionStartResult> {
  const finding = await db.knowledgeFinding.findFirst({
    where: {
      organizationId: input.orgId,
      publicId: input.findingPublicId,
      type: 'EXTRACTION_FAILED',
      status: 'OPEN',
    },
    select: { fileId: true },
  });
  if (!finding?.fileId) {
    return { success: false, error: 'not-found' };
  }
  return startBrainExtractionCommand({
    orgId: input.orgId,
    userId: input.userId,
    fileIds: [finding.fileId],
  });
}
