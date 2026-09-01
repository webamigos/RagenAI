import db from '@ragenai/prisma-client';
import { getFileFromS3 } from '@/app/lib/services/storage';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import { Workflow } from '@/features/documents/contracts/document.types';
import { logger } from '@/app/lib/utils/logger';

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

  const client = getTemporalClient();
  await client.workflow.start(Workflow.SCORE_DOCUMENT, {
    taskQueue: TASK_QUEUE_NAME,
    workflowId: `score-${fileId}-${Date.now()}`,
    args: [
      {
        fileId,
        documentId: file.document?.id ?? null,
        orgId,
        projectId: file.projectId ?? null,
        fileName: file.fileName ?? undefined,
        documentText: content,
      },
    ],
  });

  logger.info({ fileId, orgId }, 'Score document workflow started');
}
