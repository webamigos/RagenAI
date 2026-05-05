import { NextResponse, type NextRequest } from 'next/server';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { rollbackDocumentVersionCommand } from '@/features/documents/services/commands/rollback-document-version-command';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import { Workflow } from '@/features/documents/contracts/document.types';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { nanoid } from 'nanoid';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string; versionId: string } },
) {
  let orgId: string;
  let userId: string | null;
  try {
    orgId = await getOrgIdFromAuthOrThrow();
    userId = await getCurrentUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const newVersion = await rollbackDocumentVersionCommand({
      documentId: params.id,
      versionId: params.versionId,
      authorId: userId,
      orgId,
    });

    const file = await db.userFile.findFirst({
      where: { documentId: params.id, organizationId: orgId },
      select: { id: true },
    });

    if (file) {
      const updatedFile = await db.userFile.findFirst({
        where: { id: file.id },
      });
      if (updatedFile) {
        const workflowId = `rollback-${nanoid()}`;
        try {
          const client = getTemporalClient();
          await client.workflow.start(Workflow.RUN_FILE_EMBEDDINGS, {
            taskQueue: TASK_QUEUE_NAME,
            workflowId,
            args: [{ ...updatedFile, requestId: workflowId }],
          });
        } catch (err) {
          logger.error(
            { err, fileId: file.id },
            'Failed to start re-embedding after rollback',
          );
        }
      }
    }

    return NextResponse.json({
      newVersionId: newVersion.id,
      newVersionNumber: newVersion.versionNumber,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Version not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Rollback failed' }, { status: 500 });
  }
}
