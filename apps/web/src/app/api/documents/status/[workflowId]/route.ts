import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getTemporalClient } from '@/libs/temporal';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ workflowId: string }>;
}

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

  // Verify the workflow belongs to this organization
  // Workflow IDs are formatted as: docgen-{orgId}-{nanoid}
  const expectedPrefix = `docgen-${orgId}-`;
  if (!workflowId.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
  }

  try {
    const client = getTemporalClient();
    const handle = client.workflow.getHandle(workflowId);
    const description = await handle.describe();

    const status = description.status.name;

    if (status === 'COMPLETED') {
      const result = await handle.result();
      return NextResponse.json({
        status: 'COMPLETED',
        fileId: result.fileId,
        fileUrl: result.fileUrl,
        fileName: result.fileName,
      });
    }

    if (
      status === 'FAILED' ||
      status === 'TERMINATED' ||
      status === 'CANCELLED'
    ) {
      try {
        await handle.result();
      } catch (err) {
        logger.error(
          { err, workflowId },
          'Document generation workflow failed',
        );
      }
      return NextResponse.json({
        status: 'FAILED',
        error: 'Document generation failed',
      });
    }

    return NextResponse.json({ status: 'RUNNING' });
  } catch (error) {
    if (error instanceof Error && error.name === 'WorkflowNotFoundError') {
      return NextResponse.json(
        { error: 'Workflow not found' },
        { status: 404 },
      );
    }
    logger.error({ err: error, workflowId }, 'Failed to query workflow status');
    return NextResponse.json(
      { error: 'Failed to query workflow status' },
      { status: 500 },
    );
  }
}
