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
import { uploadToS3WithOrg } from '@/app/lib/services/storage';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  acceptedSuggestionIds: z.array(z.string()).min(1),
  rejectedSuggestionIds: z.array(z.string()).default([]),
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
      rejectedSuggestionIds: body.rejectedSuggestionIds,
      suggestions: body.suggestions,
    });

    const decidedIds = new Set([
      ...body.acceptedSuggestionIds,
      ...body.rejectedSuggestionIds,
    ]);
    const remainingSuggestions = body.suggestions.filter(
      (s) => !decidedIds.has(s.id),
    );

    const file = await db.userFile.findFirst({
      where: { documentId: id, organizationId: orgId },
      select: { id: true, fileExtension: true },
    });

    if (file) {
      // Overwrite the S3 file with the updated document content so that
      // RUN_FILE_EMBEDDINGS re-scores the modified text, not the original.
      const updatedDoc = await db.userDocument.findFirst({
        where: { id, organizationId: orgId },
        select: { content: true },
      });
      if (updatedDoc?.content && file.fileExtension) {
        const s3Key = `${file.id}.${file.fileExtension}`;
        logger.info(
          { fileId: file.id, s3Key, orgId },
          'Uploading updated content to S3',
        );
        try {
          await uploadToS3WithOrg(
            orgId,
            s3Key,
            Buffer.from(updatedDoc.content, 'utf-8'),
          );
          logger.info({ fileId: file.id, s3Key }, 'S3 upload succeeded');
        } catch (s3Err) {
          logger.error(
            { err: s3Err, fileId: file.id },
            'Failed to overwrite S3 file after apply-suggestions — embeddings may use stale content',
          );
        }
      } else {
        logger.warn(
          {
            fileId: file.id,
            hasContent: !!updatedDoc?.content,
            fileExtension: file.fileExtension,
          },
          'S3 upload skipped',
        );
      }

      const updatedFile = await db.userFile.findFirst({
        where: { id: file.id },
      });
      if (updatedFile) {
        const workflowId = `apply-sug-${nanoid()}`;
        try {
          const client = getTemporalClient();
          const rescoreSuggestionsPayload =
            remainingSuggestions.length > 0
              ? {
                  documentId: id,
                  orgId,
                  suggestions: remainingSuggestions,
                  projectId: null,
                  userId,
                }
              : undefined;
          await client.workflow.start(Workflow.RUN_FILE_EMBEDDINGS, {
            taskQueue: TASK_QUEUE_NAME,
            workflowId,
            args: [
              {
                ...updatedFile,
                requestId: workflowId,
                rescoreSuggestionsPayload,
              },
            ],
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
