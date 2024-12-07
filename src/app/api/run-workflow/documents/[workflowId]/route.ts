import { NextResponse } from 'next/server';

import { getTemporalClient } from '@/temporal/client';
import {
  ACTIVITY_CANCEL_EMBEDDING_COMMAND,
  ACTIVITY_EMBEDDING_STATE_QUERY,
} from '@/temporal/shared';
import { logger } from '@/app/lib/utils/logger';

type Params = {
  params: { workflowId: string };
};

export const dynamic = 'force-dynamic';

export const GET = async (_request: Request, { params }: Params) => {
  const workflowId = params.workflowId;

  try {
    const client = await getTemporalClient();
    const handle = await client.workflow.getHandle(workflowId);
    const result = await handle.result();

    logger.info('handle: %j', await handle.result(), 2);

    let embeddingState = await handle.query(ACTIVITY_EMBEDDING_STATE_QUERY);
    logger.info('embeddingState before cancel signal: %o', { embeddingState });

    // this will fail in this scenario because document was processed
    // await handle.signal(ACTIVITY_CANCEL_EMBEDDING_COMMAND);

    embeddingState = await handle.query(ACTIVITY_EMBEDDING_STATE_QUERY);
    logger.info('embeddingState after cancel signal: %o', { embeddingState });

    // remember to have launched temporal worker
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ error: true });
  }
};
