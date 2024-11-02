import { NextRequest, NextResponse } from 'next/server';

import { getTemporalClient } from '@/temporal/src/client';
import { EmbeddingWorkflow } from '@/temporal/src/workflows';
import { logger } from '@/app/lib/utils/logger';

/**
 *
 * @param request It's temporary for discussion purposes
 * @returns
 */
export const GET = async (request: NextRequest) => {
  const workflowId = 'doc-123567';
  const itemId = '5432';

  const workflow = await getTemporalClient().workflow.start(EmbeddingWorkflow, {
    taskQueue: 'smartrag-tasks',
    workflowId: workflowId,
    args: [itemId], // this will be passed as an argument to cancelEmbeddingProcess and cancelEmbeddingProcess
  });

  logger.info('workflow: %j', workflow, 2);

  // for fetching workflow from another part of the app(s)
  // const workflow = await getTemporalClient().workflow.getHandle(transactionId);

  let embeddingState = await workflow.query('embeddingState');
  logger.info('embeddingState before cancel signal: %o', { embeddingState });

  await workflow.signal('cancelEmbedding');

  embeddingState = await workflow.query('embeddingState');
  logger.info('embeddingState after cancel signal: %o', { embeddingState });

  return NextResponse.json({ embeddingState });
};
