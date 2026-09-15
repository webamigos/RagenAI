import db from '@ragenai/prisma-client';
import { EmbeddingStatus, ParsingStatus } from '@/generated/prisma/client';
import { jobs } from '@/libs/jobs';
import { logger } from '@/app/lib/utils/logger';
import { NotFoundException } from '@/libs/utils/errors';

/**
 * A phase that has finished cannot be cancelled, whatever the outcome was.
 *
 * Mutable arrays, not `as const`: Prisma's `notIn` takes `ParsingStatus[]` and
 * rejects a readonly tuple.
 */
const TERMINAL_PARSING: ParsingStatus[] = [
  ParsingStatus.COMPLETED,
  ParsingStatus.FAILED,
  ParsingStatus.CANCELLED,
];

const TERMINAL_EMBEDDING: EmbeddingStatus[] = [
  EmbeddingStatus.COMPLETED,
  EmbeddingStatus.FAILED,
  EmbeddingStatus.CANCELLED,
];

/**
 * Cancel the ingest of one file.
 *
 * **Cancellation is a database fact, not an engine instruction** — the
 * worker-runtime spec's §4. This writes CANCELLED to whichever phase is still
 * in flight, and the pipeline reads that row at the checkpoints it already
 * had. It used to send a Temporal `cancelEmbedding` signal instead, which set
 * a boolean in workflow memory.
 *
 * Three things got better in the exchange, and they are the reason for it
 * rather than a bonus:
 *
 * - **The UI flips immediately.** The status was previously written by the
 *   worker at its next checkpoint, which is after whatever activity is in
 *   flight — up to ten minutes for a Docling parse.
 * - **A run the engine has forgotten is no longer an error.** Signalling an
 *   aged-out workflow threw `WorkflowNotFoundError`, so cancelling a file
 *   whose ingest had already finished reported a failure.
 * - **A late activity cannot overwrite CANCELLED.** The status writers carry a
 *   `where` clause now instead of relying on ordering.
 *
 * Cancellation stays cooperative: an activity already running is not
 * interrupted, because none of them heartbeat. What `requestCancel` adds is
 * the part the engine does own — a job still queued should never start.
 */
/**
 * Which phase a cancel should be written to, if any.
 *
 * Parsing first: a run that has not finished parsing has not started
 * embedding. Embedding is only cancellable once parsing has **completed** —
 * after a failed or already-cancelled parse there is no embedding phase to
 * stop, and writing CANCELLED to a column the run never reached would leave a
 * status nobody can interpret (and would make a second cancel of an already
 * cancelled file write to the other column rather than doing nothing).
 */
function cancellablePhase(file: {
  parsingStatus: ParsingStatus;
  embeddingStatus: EmbeddingStatus;
}): 'parsing' | 'embedding' | null {
  if (!TERMINAL_PARSING.includes(file.parsingStatus)) {
    return 'parsing';
  }
  if (
    file.parsingStatus === ParsingStatus.COMPLETED &&
    !TERMINAL_EMBEDDING.includes(file.embeddingStatus)
  ) {
    return 'embedding';
  }
  return null;
}

const PHASE_WRITE = {
  parsing: {
    where: { parsingStatus: { notIn: TERMINAL_PARSING } },
    data: { parsingStatus: ParsingStatus.CANCELLED },
  },
  embedding: {
    where: { embeddingStatus: { notIn: TERMINAL_EMBEDDING } },
    data: { embeddingStatus: EmbeddingStatus.CANCELLED },
  },
} as const;

export async function cancelFileEmbeddingCommand(
  fileId: string,
  organizationId: string,
): Promise<void> {
  const file = await db.userFile.findFirst({
    where: { id: fileId, organizationId },
    select: {
      workflowId: true,
      parsingStatus: true,
      embeddingStatus: true,
    },
  });

  if (!file) {
    throw new NotFoundException(`File not found: ${fileId}`);
  }

  // Bounded at two. The pipeline can cross from parsing into embedding between
  // the read above and the write below, and a cancel aimed at the phase that
  // just ended matches no rows — which would otherwise be reported as "already
  // finished" while the ingest carried on embedding. Re-reading and writing to
  // the phase that is live now closes that. It is bounded rather than a loop
  // because there are only two phases: the second attempt cannot be overtaken
  // by a third transition.
  let phase = cancellablePhase(file);
  let written = false;

  for (let attempt = 1; attempt <= 2 && phase && !written; attempt++) {
    const { count } = await db.userFile.updateMany({
      // Conditional, and that is the whole guard: a cancel racing the
      // pipeline's own COMPLETED write matches nothing rather than
      // resurrecting a finished ingest.
      where: { id: fileId, organizationId, ...PHASE_WRITE[phase].where },
      data: {
        ...PHASE_WRITE[phase].data,
        ...(phase === 'parsing'
          ? { parsingFailedAt: new Date() }
          : { embeddingFailedAt: new Date() }),
      },
    });

    written = count > 0;

    if (!written && attempt === 1) {
      const current = await db.userFile.findFirst({
        where: { id: fileId, organizationId },
        select: { parsingStatus: true, embeddingStatus: true },
      });
      phase = current ? cancellablePhase(current) : null;
    }
  }

  if (!written) {
    // Not an error. The ingest finished, failed, or was already cancelled —
    // all of which mean there is nothing to stop, and none of which the user
    // needs to see as a failure.
    logger.info(
      { fileId, organizationId },
      'Cancel requested for a file whose ingest had already finished',
    );
    return;
  }

  if (!file.workflowId) {
    // Predates the feature, or the best-effort `workflowId` write lost a race
    // with a database blip. The status is written either way, which is what
    // the pipeline reads — so there is nothing left to do but say so.
    logger.warn(
      { fileId, organizationId },
      'Cancelled a file with no recorded run id; a queued job cannot be removed',
    );
    return;
  }

  // The engine's half: stop a job the worker has not picked up yet. Deliberately
  // not "end the running job" — that would take away the status write the
  // pipeline makes when it reads the row, and leave the file in PROCESSING.
  try {
    await jobs().requestCancel(file.workflowId);
  } catch (err) {
    // The row is already CANCELLED, so the user's intent is recorded. An
    // engine that could not be reached must not turn that into a failed
    // request.
    logger.warn(
      { err, fileId, workflowId: file.workflowId },
      'Wrote CANCELLED but could not ask the runtime to drop a queued job',
    );
  }
}
