import db from '@ragenai/prisma-client';
import { getFileFromS3 } from '@/app/lib/services/storage';
import { jobs } from '@/libs/jobs';
import { Workflow } from '@/features/documents/contracts/document.types';
import { logger } from '@/app/lib/utils/logger';
import { UnauthorizedException } from '@/libs/utils/errors';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'csv',
  'json',
  'html',
  'xml',
  'srt',
]);

export async function scoreFileCommand(
  fileId: string,
  orgId: string,
): Promise<void> {
  // The menu item is hidden when the key is off; this is the gate a stale
  // client, or a direct call to the action, still meets. Spec
  // 2026-09-26-rag-readiness-score-review, Q6.
  if (!(await isFeatureEnabledQuery(orgId, 'ragReadinessScore'))) {
    throw new UnauthorizedException(
      'Scoring documents for RAG is turned off for this organization',
    );
  }

  const file = await db.userFile.findFirst({
    where: { id: fileId, organizationId: orgId },
    select: {
      id: true,
      fileName: true,
      fileExtension: true,
      projectId: true,
      document: { select: { id: true, content: true } },
    },
  });

  if (!file) {
    throw new Error('File not found');
  }

  let content: string;

  if (file.document?.content) {
    content = file.document.content;
  } else if (
    file.fileExtension &&
    TEXT_EXTENSIONS.has(file.fileExtension.toLowerCase())
  ) {
    const buffer = await getFileFromS3(`${file.id}.${file.fileExtension}`);
    content = buffer.toString('utf-8');
  } else {
    throw new Error(
      'Content not extracted yet — scoring requires a text-based file or a processed document',
    );
  }

  if (!content.trim()) {
    throw new Error('File has no content to score');
  }

  await jobs().start(Workflow.SCORE_DOCUMENT, `score-${fileId}-${Date.now()}`, {
    fileId,
    documentId: file.document?.id ?? null,
    orgId,
    projectId: file.projectId ?? null,
    fileName: file.fileName ?? undefined,
    documentText: content,
  });

  logger.info({ fileId, orgId }, 'Score document job started');
}
