'use server';

import { nanoid } from 'nanoid';
import db from '@ragenai/prisma-client';
import { FileType } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { listDriveFolderFilesQuery } from '../queries/list-drive-folder-files-query';
import { getDriveFileContentQuery } from '../queries/get-drive-file-content-query';
import { uploadToS3WithOrg } from '@/app/lib/services/aws';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import { Workflow } from '@/features/documents/contracts/document.types';

const MAX_IMPORT_FILES = 200;
const IMPORT_BATCH_SIZE = 5;

type ImportResult = {
  success: boolean;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  error?: string;
};

export const importDriveFolderCommand = async (
  orgId: string,
  userId: string,
  folderId: string,
  folderName: string,
  projectPublicId: string,
  enableSync: boolean = false,
): Promise<ImportResult> => {
  const project = await db.project.findFirst({
    where: { publicId: projectPublicId, organizationId: orgId },
    select: { id: true, publicId: true },
  });

  if (!project) {
    return {
      success: false,
      importedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      error: 'Project not found',
    };
  }

  const org = await db.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { slug: true, publicId: true },
  });

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  // List files in the folder (paginate, capped at MAX_IMPORT_FILES)
  const allFiles: Array<{
    id: string;
    name: string;
    mime_type: string;
    modified_time: string;
  }> = [];
  let pageToken: string | undefined;

  do {
    const result = await listDriveFolderFilesQuery(
      orgId,
      userId,
      folderId,
      50,
      pageToken,
    );
    if (!result.success || !result.files) {
      return {
        success: false,
        importedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        error: result.error || 'Failed to list folder files',
      };
    }
    allFiles.push(...result.files);
    pageToken = result.nextPageToken;
  } while (pageToken && allFiles.length < MAX_IMPORT_FILES);

  if (allFiles.length > MAX_IMPORT_FILES) {
    allFiles.length = MAX_IMPORT_FILES;
  }

  let importedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const temporalClient = getTemporalClient();

  const importSingleFile = async (driveFile: (typeof allFiles)[number]) => {
    // Check if already imported via metadata
    const existingFile = await db.userFile.findFirst({
      where: {
        organizationId: orgId,
        projectId: project.id,
        metadata: {
          path: ['driveFileId'],
          equals: driveFile.id,
        },
      },
    });

    if (existingFile) {
      return 'skipped' as const;
    }

    // Fetch file content
    const contentResult = await getDriveFileContentQuery(
      orgId,
      userId,
      driveFile.id,
    );
    if (!contentResult.success || !contentResult.content) {
      logger.warn(
        { driveFileId: driveFile.id, error: contentResult.error },
        'Failed to fetch Drive file content during import',
      );
      return 'failed' as const;
    }

    // Create UserFile record
    const fileRecord = await db.userFile.create({
      data: {
        organizationId: orgId,
        fileName: driveFile.name,
        fileSize: Buffer.byteLength(contentResult.content, 'utf-8'),
        fileType: FileType.MARKDOWN,
        projectId: project.id,
        isBinaryFile: false,
        fileExtension: 'md',
        fileMimeType: 'text/markdown',
        metadata: {
          driveFileId: driveFile.id,
          driveFolderId: folderId,
          driveModifiedTime: driveFile.modified_time,
        },
      },
    });

    // Upload to S3
    const fileContent = Buffer.from(contentResult.content, 'utf-8');
    await uploadToS3WithOrg(
      org.publicId,
      `${fileRecord.publicId}.md`,
      fileContent,
    );

    await db.userFile.update({
      where: { id: fileRecord.id, organizationId: orgId },
      data: { isUploaded: true, uploadedAt: new Date() },
    });

    // Start embedding workflow
    const workflowId = `drive-import-${nanoid()}`;
    await temporalClient.workflow.start(Workflow.RUN_FILE_EMBEDDINGS, {
      taskQueue: TASK_QUEUE_NAME,
      workflowId,
      args: [
        {
          ...fileRecord,
          projectPublicId: project.publicId,
          organizationSlug: org.slug,
          organizationPublicId: org.publicId,
          userEmail: user?.email ?? undefined,
          userId,
        },
      ],
    });

    logger.info(
      {
        workflowId,
        driveFileId: driveFile.id,
        fileName: driveFile.name,
      },
      'Started embedding workflow for Drive-imported file',
    );

    return 'imported' as const;
  };

  // Process files in batches for better throughput
  for (let i = 0; i < allFiles.length; i += IMPORT_BATCH_SIZE) {
    const batch = allFiles.slice(i, i + IMPORT_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((file) => importSingleFile(file)),
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value === 'imported') {
          importedCount++;
        } else if (result.value === 'skipped') {
          skippedCount++;
        } else {
          failedCount++;
        }
      } else {
        logger.error({ err: result.reason }, 'Error importing Drive file');
        failedCount++;
      }
    }
  }

  // Create or update sync record if enabled
  if (enableSync) {
    await db.googleDriveSync.upsert({
      where: {
        organizationId_projectId_driveFolderId: {
          organizationId: orgId,
          projectId: project.id,
          driveFolderId: folderId,
        },
      },
      create: {
        organizationId: orgId,
        userId,
        projectId: project.id,
        driveFolderId: folderId,
        folderName,
        enabled: true,
        lastSyncedAt: new Date(),
      },
      update: {
        lastSyncedAt: new Date(),
        enabled: true,
        folderName,
      },
    });
  }

  return {
    success: true,
    importedCount,
    skippedCount,
    failedCount,
  };
};
