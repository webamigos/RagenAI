'use server';

import { nanoid } from 'nanoid';
import db from '@ragenai/prisma-client';
import { FileType } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { getDriveFileContentQuery } from '../queries/get-drive-file-content-query';
import { uploadToS3WithOrg } from '@/app/lib/services/storage';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import { Workflow } from '@/features/documents/contracts/document.types';

interface ImportFileResult {
  success: boolean;
  alreadyExists?: boolean;
  error?: string;
}

export const importDriveFileToProjectCommand = async (
  orgId: string,
  userId: string,
  driveFileId: string,
  driveFileName: string,
  driveModifiedTime: string,
  projectId: string,
): Promise<ImportFileResult> => {
  const project = await db.project.findFirst({
    where: { id: projectId, organizationId: orgId },
    select: { id: true },
  });

  if (!project) {
    return { success: false, error: 'Project not found' };
  }

  // Check if already imported
  const existingFile = await db.userFile.findFirst({
    where: {
      organizationId: orgId,
      projectId: project.id,
      metadata: {
        path: ['driveFileId'],
        equals: driveFileId,
      },
    },
  });

  if (existingFile) {
    return { success: true, alreadyExists: true };
  }

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { slug: true, id: true },
  });

  if (!org) {
    return { success: false, error: 'Organization not found' };
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  // Fetch content
  const contentResult = await getDriveFileContentQuery(
    orgId,
    userId,
    driveFileId,
  );
  if (!contentResult.success || !contentResult.content) {
    return {
      success: false,
      error: contentResult.error || 'Failed to fetch file content',
    };
  }

  // Ensure filename has .md extension (Drive files are exported as text)
  const fileName = driveFileName.endsWith('.md')
    ? driveFileName
    : `${driveFileName}.md`;

  // Create UserFile with Drive metadata
  const fileRecord = await db.userFile.create({
    data: {
      organizationId: orgId,
      fileName,
      fileSize: Buffer.byteLength(contentResult.content, 'utf-8'),
      fileType: FileType.MARKDOWN,
      projectId: project.id,
      isBinaryFile: false,
      fileExtension: 'md',
      fileMimeType: 'text/markdown',
      metadata: {
        driveFileId,
        driveModifiedTime,
      },
    },
  });

  // Upload to S3
  const fileContent = Buffer.from(contentResult.content, 'utf-8');
  await uploadToS3WithOrg(org.id, `${fileRecord.id}.md`, fileContent);

  await db.userFile.update({
    where: { id: fileRecord.id, organizationId: orgId },
    data: { isUploaded: true, uploadedAt: new Date() },
  });

  // Start embedding workflow
  const workflowId = `drive-file-${nanoid()}`;
  const temporalClient = getTemporalClient();
  await temporalClient.workflow.start(Workflow.RUN_FILE_EMBEDDINGS, {
    taskQueue: TASK_QUEUE_NAME,
    workflowId,
    args: [
      {
        ...fileRecord,
        projectId: project.id,
        organizationSlug: org.slug,
        organizationId: org.id,
        userEmail: user?.email ?? undefined,
        userId,
      },
    ],
  });

  logger.info(
    { workflowId, driveFileId, fileName: driveFileName },
    'Imported Drive file to project with metadata',
  );

  return { success: true };
};
