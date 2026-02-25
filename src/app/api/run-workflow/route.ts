import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

import { logger } from '@/app/lib/utils/logger';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import { Workflow } from '@/features/documents/contracts/document.types';

export const dynamic = 'force-dynamic';

/**
 *
 * @param request It's temporary for discussion purposes
 * @returns
 */
export const GET = async (request: NextRequest) => {
  const personWorkflowId = `person-${nanoid()}`;
  const documentWorkflowId = `doc-${nanoid()}`;
  const embeddingWorkflowId = `embd-${nanoid()}`;
  const itemId = `654321`; // TODO: in real implementation replace with real id

  try {
    const client = getTemporalClient();

    // ⚠️ Workflow Start
    // ❌ WRONG: it's possible to pass workflow as a function, it will work on dev but not on prod!!!
    // because there are completely different artifacts from next.js and temporal - it's really hard to match tem (if possible)
    // moreover if we wat to use temporal worker from another services like Nest API, then we definitely should use string names of workflow
    // TIP: passing function instead of string it may be helpful for dev because we have tape-safety then and editor suggests possible worker input params
    // ✅ OK: string name for the workflow
    const embeddingsHandle = await client.workflow.start(
      Workflow.RUN_FILE_EMBEDDINGS,
      {
        taskQueue: TASK_QUEUE_NAME,
        workflowId: embeddingWorkflowId,
        args: [
          {
            fileId: 'f5b5f1a5-99f9-4024-b529-48c33919d198',
            orgId: 'org_2uVtRWLWKbIuPcuRdMKKnrQqLax',
            projectId: '789',
          },
        ],
      }
    );

    logger.info('embeddingsHandle: %j', embeddingsHandle, 2);

    // const documentHandle = await client.workflow.start(EmbeddingWorkflow, {
    // const documentHandle = await client.workflow.start('EmbeddingWorkflow', {
    //   taskQueue: TASK_QUEUE_NAME,
    //   workflowId: documentWorkflowId,
    //   args: [{ documentId: itemId }],
    // });

    // logger.info('documentHandle: %j', documentHandle, 2);

    return NextResponse.json({
      embeddingWorkflowId,
      embeddingResultUrl: `${request.nextUrl}/embd/${embeddingWorkflowId}`,
    });
  } catch (error) {
    logger.error({ err: error }, 'Fail to start Workflow');
    return NextResponse.json({ status: 'oh no' });
  }
};
