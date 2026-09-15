import { type NextRequest, NextResponse } from 'next/server';
import type { GenerateDocumentResult } from '@ragenai/jobs';
import { auth } from '@/lib/auth';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { jobs } from '@/libs/jobs';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ workflowId: string }>;
}

/**
 * What the document-generation UI polls while a run is in flight.
 *
 * Through `JobRuntime.getRun` rather than `handle.describe()` and
 * `handle.result()` — the worker-runtime spec's §5. The adapter already did
 * the mapping this route used to do inline, including the two Temporal states
 * (`TERMINATED`, `TIMED_OUT`) that have to read as failures so the response
 * shape does not change.
 *
 * `unknown` is a real state and not a fallback: both engines forget completed
 * runs eventually, and the answer to "you polled too late" is 404, which is
 * what this route already returned for an aged-out workflow. Collapsing it
 * into a failure would tell a user their document failed when it did not.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let orgId: string;
  try {
    orgId = await getOrgIdFromAuthOrThrow();
  } catch {
    return NextResponse.json(
      { error: 'Organization not found' },
      { status: 403 },
    );
  }

  const { workflowId } = await params;

  if (!workflowId || !workflowId.startsWith('docgen-')) {
    return NextResponse.json({ error: 'Invalid workflow ID' }, { status: 400 });
  }

  // The org check is a prefix test on the run id, which producers build as
  // `docgen-{orgId}-{nanoid}`. It keeps working through the seam because run
  // ids are unchanged — BullMQ takes a caller-supplied `jobId` too.
  const expectedPrefix = `docgen-${orgId}-`;
  if (!workflowId.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
  }

  try {
    const run = await jobs().getRun(workflowId);

    if (run.status === 'unknown') {
      return NextResponse.json(
        { error: 'Workflow not found' },
        { status: 404 },
      );
    }

    if (run.status === 'completed') {
      const result = run.result as GenerateDocumentResult | undefined;
      return NextResponse.json({
        status: 'COMPLETED',
        fileId: result?.fileId,
        fileUrl: result?.fileUrl,
        fileName: result?.fileName,
      });
    }

    if (run.status === 'failed' || run.status === 'cancelled') {
      // Logged here rather than re-read from the engine: the adapter does not
      // call `result()` on a failed run, because that throws the workflow's
      // own failure at a caller who asked for a status.
      logger.error(
        { workflowId, status: run.status, failure: run.failure },
        'Document generation did not complete',
      );
      return NextResponse.json({
        status: 'FAILED',
        error: 'Document generation failed',
      });
    }

    return NextResponse.json({ status: 'RUNNING' });
  } catch (error) {
    logger.error({ err: error, workflowId }, 'Failed to read job status');
    return NextResponse.json(
      { error: 'Failed to query workflow status' },
      { status: 500 },
    );
  }
}
