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

  const activeVersion = await db.documentVersion.findFirst({
    where: { documentId: doc.id, organizationId: orgId, isActive: true },
    select: { ragScore: true },
  });
  const versionScore = activeVersion?.ragScore as { total?: number } | null;
  const resolvedBaseScore =
    typeof versionScore?.total === 'number' ? versionScore.total : null;

  // Write pending state immediately so frontend can show spinner.
  // baseScore is pre-filled from the active DocumentVersion so the tab
  // displays the canonical score (same as Version History) without waiting
  // for the worker to finish its own LLM scoring call.
  // Preserve existing suggestions during pending/processing so the user
  // can still see (and act on) them while the new job runs. They are
  // replaced only when the worker writes the final 'done' state.
  await db.$executeRaw`
    UPDATE user_documents
    SET metadata = jsonb_set(
      COALESCE(metadata, '{}'),
      '{optimizationJob}',
      jsonb_build_object(
        'id',        ${jobId}::text,
        'status',    'pending',
        'baseScore', ${resolvedBaseScore}::numeric,
        'suggestions', COALESCE(metadata->'optimizationJob'->'suggestions', '[]'::jsonb),
        'startedAt', ${new Date().toISOString()}::text
      )
    )
    WHERE id = ${doc.id}
      AND organization_id = ${orgId}
  `;

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
          baseScore: resolvedBaseScore,
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
