import { NextResponse, type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { rollbackDocumentVersionCommand } from '@/features/documents/services/commands/rollback-document-version-command';
import { Workflow } from '@/features/documents/contracts/document.types';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
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

  const { id, versionId } = await params;

  try {
    const newVersion = await rollbackDocumentVersionCommand({
      documentId: id,
      versionId,
      authorId: userId,
      orgId,
    });

    // Retrieval has to follow the restored content, or the document reads one
    // way in the UI and answers another way in chat.
    const file = await db.userFile.findFirst({
      where: { documentId: id, organizationId: orgId },
      select: { id: true, fileName: true, projectId: true },
    });

    if (file) {
      const workflowId = `reindex-${id}-${nanoid()}`;
      try {
        const client = getTemporalClient();
        // Deliberately not RUN_FILE_EMBEDDINGS: that re-parses the stored file,
        // which still holds the original upload, so it would undo the rollback
        // in the index. This workflow embeds the version text and clears the
        // previous chunks first.
        await client.workflow.start(Workflow.REINDEX_DOCUMENT_VERSION, {
          taskQueue: TASK_QUEUE_NAME,
          workflowId,
          args: [
            {
              orgId,
              fileId: file.id,
              fileName: file.fileName,
              projectId: file.projectId,
              userId,
              content: newVersion.content,
            },
          ],
        });
      } catch (err) {
        // The rollback itself succeeded; reporting failure would invite the
        // user to retry a completed operation. Surfaced as a warning on the
        // response instead so the UI can say retrieval is behind.
        logger.error(
          { err, fileId: file.id, documentId: id },
          'Rollback succeeded but re-indexing could not be started',
        );

        return NextResponse.json({
          newVersionId: newVersion.id,
          newVersionNumber: newVersion.versionNumber,
          reindexStarted: false,
        });
      }
    }

    return NextResponse.json({
      newVersionId: newVersion.id,
      newVersionNumber: newVersion.versionNumber,
      // False when the document has no file behind it — nothing is indexed for
      // it, so there is nothing to re-index.
      reindexStarted: Boolean(file),
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message === 'Version not found' ||
        err.message === 'Document not found')
    ) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    logger.error({ err, documentId: id, versionId }, 'Rollback failed');
    return NextResponse.json({ error: 'Rollback failed' }, { status: 500 });
  }
}
