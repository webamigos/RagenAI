import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { nanoid } from 'nanoid';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { applySuggestionsCommand } from '@/features/documents/services/commands/apply-suggestions-command';
import { Workflow } from '@/features/documents/contracts/document.types';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';

/**
 * Ids only. The suggestion bodies are read server-side from the stored job —
 * see applySuggestionsCommand.
 */
const requestSchema = z.object({
  acceptedSuggestionIds: z.array(z.string()).min(1),
  rejectedSuggestionIds: z.array(z.string()).default([]),
});

export async function POST(
  request: NextRequest,
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

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    const result = await applySuggestionsCommand({
      documentId: id,
      orgId,
      authorId: userId,
      acceptedSuggestionIds: body.acceptedSuggestionIds,
      rejectedSuggestionIds: body.rejectedSuggestionIds,
    });

    const file = await db.userFile.findFirst({
      where: { documentId: id, organizationId: orgId },
      select: { id: true, fileName: true, projectId: true },
    });

    let reindexStarted = false;
    if (file) {
      const doc = await db.userDocument.findFirst({
        where: { id, organizationId: orgId },
        select: { content: true },
      });

      try {
        const client = getTemporalClient();
        // Embeds the optimized text directly. The earlier approach overwrote
        // the stored file with it so that RUN_FILE_EMBEDDINGS would pick it
        // up — which destroys the user's original whenever it is not already
        // plain text: UTF-8 written under <id>.pdf is a PDF that no longer
        // opens.
        await client.workflow.start(Workflow.REINDEX_DOCUMENT_VERSION, {
          taskQueue: TASK_QUEUE_NAME,
          workflowId: `reindex-${id}-${nanoid()}`,
          args: [
            {
              orgId,
              fileId: file.id,
              fileName: file.fileName,
              projectId: file.projectId,
              userId,
              content: doc?.content ?? '',
            },
          ],
        });
        reindexStarted = true;
      } catch (err) {
        // The document is already rewritten and versioned; reporting failure
        // would invite a retry of work that succeeded.
        logger.error(
          { err, fileId: file.id, documentId: id },
          'Suggestions applied but re-indexing could not be started',
        );
      }
    }

    return NextResponse.json({ ...result, reindexStarted });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'Document not found') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      if (
        err.message === 'No matching suggestions' ||
        err.message === 'No suggestions could be applied'
      ) {
        // The client asked for something the stored job cannot satisfy —
        // usually a stale tab whose suggestions have since been superseded.
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
    }
    logger.error({ err, documentId: id }, 'Failed to apply suggestions');
    return NextResponse.json(
      { error: 'Failed to apply suggestions' },
      { status: 500 },
    );
  }
}
