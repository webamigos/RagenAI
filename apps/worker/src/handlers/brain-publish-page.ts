import {
  type BrainPublishPagePayload,
  type BrainPublishPageResult,
  type JobContext,
} from '@ragenai/jobs';

import type * as activities from '../activities/index.js';

/**
 * Publish one knowledge page into the index (spec E2). The whole write is one
 * step, `publishKnowledgePage`, because its safety is in its order: check the
 * generation, delete the file's chunks, write, check again. Retried, because
 * it starts by deleting what an earlier attempt left — and because an attempt
 * that went stale cleans up after itself, a retry cannot resurrect a page
 * someone withdrew.
 */
export async function brainPublishPage(
  payload: BrainPublishPagePayload,
  ctx: JobContext,
): Promise<BrainPublishPageResult> {
  const { publishKnowledgePage } = ctx.steps<typeof activities>({
    retry: {
      initialInterval: '10 seconds',
      maximumInterval: '2 minutes',
      backoffCoefficient: 2,
      maximumAttempts: 3,
    },
    startToCloseTimeout: '10 minutes',
  });
  const { markPublicationFailed } = ctx.steps<typeof activities>({
    retry: { initialInterval: '1 second', maximumAttempts: 2 },
    startToCloseTimeout: '1 minute',
  });
  let result: BrainPublishPageResult;
  try {
    result = await publishKnowledgePage(payload);
  } catch (error) {
    // Out of retries. Said where a person looks — the file reads FAILED and
    // the panel offers to publish again — and in the log, which the job
    // runtime's own final failure never reached. The error's class only:
    // an embedding call's error can carry the text it was sent.
    const kind = error instanceof Error ? error.name : 'unknown error';
    ctx.log.error(
      `brain publish ${payload.pageId} (generation ${payload.generation}) gave up: ${kind}`,
    );
    try {
      await markPublicationFailed(payload);
    } catch {
      ctx.log.error(
        `brain publish ${payload.pageId}: could not record the failure either`,
      );
    }
    throw error;
  }
  ctx.log.info(
    `brain publish ${payload.pageId} (generation ${payload.generation}): ${result.status}, ${result.chunks} chunks`,
  );
  return result;
}
