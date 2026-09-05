import db from '@ragenai/prisma-client';
import type { Prisma } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retried, best-effort `UserFile` update for state that must be written after
 * a Temporal workflow has already started — most importantly `workflowId`,
 * which a later `cancelFileEmbeddingCommand` looks up by fileId to find the
 * run to signal. A transient DB blip right after the workflow starts must not
 * silently and permanently leave a file uncancellable.
 *
 * Deliberately does not fail the caller: the ingest is already running by the
 * time this runs, so surfacing an error here would report failure for an
 * upload/re-embed that actually succeeded. After all attempts are exhausted
 * this only logs — the caller still returns success.
 */
export async function persistUserFileUpdateWithRetry(params: {
  fileId: string;
  organizationId: string;
  data: Prisma.UserFileUpdateInput;
  logContext?: Record<string, unknown>;
}): Promise<void> {
  const { fileId, organizationId, data, logContext } = params;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await db.userFile.update({
        where: { id: fileId, organizationId },
        data,
      });
      return;
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) {
        logger.warn(
          { err, fileId, attempts: MAX_ATTEMPTS, ...logContext },
          'Failed to persist UserFile update after retries — the workflow is already running, so this only affects state that depends on it (e.g. cancellability)',
        );
        return;
      }
      await sleep(BASE_DELAY_MS * attempt);
    }
  }
}
