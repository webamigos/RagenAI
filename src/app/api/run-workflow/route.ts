import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

import { getTemporalClient } from '@/temporal/client';
import { TASK_QUEUE_NAME } from '@/temporal/shared';

// DO NOT import workflows in Next.js app!
// import { EmbeddingWorkflow } from '@/temporal/src/workflows';

import { logger } from '@/app/lib/utils/logger';
import { newEstimateAgeWorkflow } from '@/temporal/workflows';

export const dynamic = 'force-dynamic';

/**
 *
 * @param request It's temporary for discussion purposes
 * @returns
 */
export const GET = async (request: NextRequest) => {
  const personWorkflowId = `person-${nanoid()}`;
  const documentWorkflowId = `doc-${nanoid()}`;
  const itemId = `654321`; // TODO: in real implementation replace with real id

  try {
    const client = getTemporalClient();

    // ⚠️ Workflow Start
    // ❌ WRONG: it's possible to pass workflow as a function, it will work on dev but not on prod!!!
    // because there are completely different artifacts from next.js and temporal - it's really hard to match tem (if possible)
    // moreover if we wat to use temporal worker from another services like Nest API, then we definitely should use string names of workflow
    // TIP: passing function instead of string it may be helpful for dev because we have tape-safety then and editor suggests possible worker input params
    // ✅ OK: string name for the workflow
    const personHandle = await client.workflow.start('newEstimateAgeWorkflow', {
      taskQueue: TASK_QUEUE_NAME,
      workflowId: personWorkflowId,
      args: [{ name: 'Janina4' }],
    });

    logger.info('personHandle: %j', personHandle, 2);

    // const documentHandle = await client.workflow.start(EmbeddingWorkflow, {
    const documentHandle = await client.workflow.start('EmbeddingWorkflow', {
      taskQueue: TASK_QUEUE_NAME,
      workflowId: documentWorkflowId,
      args: [{ documentId: itemId }],
    });

    logger.info('documentHandle: %j', documentHandle, 2);

    return NextResponse.json({
      personWorkflowId,
      personWorkflowResultUrl: `${request.nextUrl}/people/${personWorkflowId}`,
      documentWorkflowId,
      documentWorkflowResultUrl: `${request.nextUrl}/documents/${documentWorkflowId}`,
    });
  } catch (error) {
    logger.error({ err: error }, 'Fail to start Workflow');
    return NextResponse.json({ status: 'oh no' });
  }
};
