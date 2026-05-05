import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import { Workflow } from '@/features/documents/contracts/document.types';
import { getFileFromS3 } from '@/app/lib/services/storage';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';

const UNSUPPORTED_TYPES = new Set(['IMAGE', 'XLSX', 'CSV']);

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let orgId: string;
  let userId: string | null;
  try {
    orgId = await getOrgIdFromAuthOrThrow();
    userId = await getCurrentUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const file = await db.userFile.findFirst({
    where: { documentId: id, organizationId: orgId },
    select: {
      id: true,
      fileType: true,
      fileExtension: true,
      document: {
        select: { id: true, content: true, title: true, projectId: true },
      },
    },
  });

  const doc =
    file?.document ??
    (await db.userDocument.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, content: true, title: true, projectId: true },
    }));

  if (!doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (file && UNSUPPORTED_TYPES.has(file.fileType)) {
    return NextResponse.json(
      { error: 'File type not supported for optimization' },
      { status: 422 },
    );
  }

  let content: string;
  if (file?.document?.content) {
    content = file.document.content;
  } else if (doc.content) {
    content = doc.content;
  } else if (file && file.fileExtension) {
    try {
      const buffer = await getFileFromS3(`${file.id}.${file.fileExtension}`);
      content = buffer.toString('utf-8');
    } catch {
      return NextResponse.json(
        { error: 'Failed to extract file content' },
        { status: 500 },
      );
    }
  } else {
    return NextResponse.json(
      { error: 'No content available' },
      { status: 422 },
    );
  }

  const jobId = randomUUID();

  // Write pending state immediately so frontend can show spinner
  await db.userDocument.updateMany({
    where: { id: doc.id, organizationId: orgId },
    data: {
      metadata: {
        optimizationJob: {
          id: jobId,
          status: 'pending',
          baseScore: null,
          suggestions: [],
          startedAt: new Date().toISOString(),
        },
      },
    },
  });

  try {
    const client = getTemporalClient();
    await client.workflow.start(Workflow.OPTIMIZE_DOCUMENT, {
      taskQueue: TASK_QUEUE_NAME,
      workflowId: `optimize-${doc.id}-${jobId}`,
      args: [
        {
          jobId,
          documentId: doc.id,
          orgId,
          projectId: doc.projectId ?? null,
          userId,
          documentText: content,
          documentTitle: doc.title,
        },
      ],
    });
  } catch (err) {
    logger.error(
      { err, documentId: doc.id },
      'Failed to start optimization workflow',
    );
    return NextResponse.json(
      { error: 'Failed to start optimization' },
      { status: 500 },
    );
  }

  logger.info({ documentId: doc.id, jobId }, 'Optimization workflow started');

  return NextResponse.json({ jobId });
}
