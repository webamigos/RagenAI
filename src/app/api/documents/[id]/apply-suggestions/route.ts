import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { applySuggestionsCommand } from '@/features/documents/services/commands/apply-suggestions-command';
import { optimizationSuggestionSchema } from '@/features/documents/contracts/optimization-suggestion.types';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import { Workflow } from '@/features/documents/contracts/document.types';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { nanoid } from 'nanoid';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  acceptedSuggestionIds: z.array(z.string()).min(1),
  suggestions: z.array(optimizationSuggestionSchema),
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
      suggestions: body.suggestions,
    });

    const file = await db.userFile.findFirst({
      where: { documentId: id, organizationId: orgId },
      select: { id: true },
    });

    if (file) {
      const updatedFile = await db.userFile.findFirst({
        where: { id: file.id },
      });
      if (updatedFile) {
        const workflowId = `apply-sug-${nanoid()}`;
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
            'Failed to start re-embedding after apply-suggestions',
          );
        }
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === 'Document not found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Failed to apply suggestions' },
      { status: 500 },
    );
  }
}
