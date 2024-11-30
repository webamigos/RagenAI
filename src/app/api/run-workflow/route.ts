import { NextRequest, NextResponse } from 'next/server';

import { getTemporalClient } from '../../../../temporal/src/client';
import { estimateAgeWorkflow } from '../../../../temporal/src/workflows';
import { TASK_QUEUE_NAME } from '../../../../temporal/src/shared';
import { logger } from '@/app/lib/utils/logger';
import { nanoid } from 'nanoid';

/**
 *
 * @param request It's temporary for discussion purposes
 * @returns
 */
export const GET = async (request: NextRequest) => {
  const workflowId = `doc-${nanoid()}`;
  const itemId = `654321`; // TODO: in real implementation replace with real id

  try {
    const client = await getTemporalClient();

    // Workflow Execution Request
    const handle = await client.workflow.start(estimateAgeWorkflow, {
      taskQueue: TASK_QUEUE_NAME,
      workflowId: workflowId,
      args: [{ name: 'Jannusz' }], // this will be passed as an argument to cancelEmbeddingProcess and cancelEmbeddingProcess
    });

    logger.info('handle: %j', handle, 2);

    // for fetching workflow from another part of the app(s)
    // const workflow = await getTemporalClient().workflow.getHandle(transactionId);

    // logger.info('handle: %j', await handle.result(), 2);

    // let embeddingState = await handle.query(ACTIVITY_EMBEDDING_STATE_QUERY);
    // logger.info('embeddingState before cancel signal: %o', { embeddingState });

    // await handle.signal(ACTIVITY_CANCEL_EMBEDDING_COMMAND);

    // embeddingState = await handle.query(ACTIVITY_EMBEDDING_STATE_QUERY);
    // logger.info('embeddingState after cancel signal: %o', { embeddingState });

    return NextResponse.json({ workflowId });
  } catch (error) {
    logger.error({ err: error }, 'Fail to start Workflow');
    return NextResponse.json({ status: 'oh no' });
  }
};
