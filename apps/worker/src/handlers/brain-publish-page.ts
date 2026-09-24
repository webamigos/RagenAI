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
  const result = await publishKnowledgePage(payload);
  ctx.log.info(
    `brain publish ${payload.pageId} (generation ${payload.generation}): ${result.status}, ${result.chunks} chunks`,
  );
  return result;
}
