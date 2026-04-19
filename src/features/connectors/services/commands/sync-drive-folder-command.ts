'use server';

import { nanoid } from 'nanoid';
import db from '@ragenai/prisma-client';
import { FileType } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { listDriveFolderFilesQuery } from '../queries/list-drive-folder-files-query';
import { getDriveFileContentQuery } from '../queries/get-drive-file-content-query';
import { uploadToS3WithOrg } from '@/app/lib/services/storage';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import { Workflow } from '@/features/documents/contracts/document.types';

const MAX_SYNC_FILES = 200;
const SYNC_BATCH_SIZE = 5;

type SyncResult = {
  success: boolean;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  failedCount: number;
  error?: string;
};

export const syncDriveFolderCommand = async (
  orgId: string,
  userId: string,
  syncPublicId: string,
): Promise<SyncResult> => {
  const syncRecord = await db.googleDriveSync.findFirst({
    where: { id: syncPublicId, organizationId: orgId },
  });

  if (!syncRecord) {
    return {
      success: false,
      newCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      failedCount: 0,
      error: 'Sync record not found',
    };
  }

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { slug: true, id: true },
  });

  if (!org) {
    return {
      success: false,
      newCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      failedCount: 0,
      error: 'Organization not found',
    };
  }

  const project = await db.project.findUnique({
    where: { id: syncRecord.projectId },
    select: { id: true },
  });

  if (!project) {
    return {
      success: false,
      newCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      failedCount: 0,
      error: 'Project not found',
    };
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  // List current files in the Drive folder
  const driveFiles: Array<{
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
      syncRecord.driveFolderId,
      50,
      pageToken,
    );
    if (!result.success || !result.files) {
      return {
        success: false,
        newCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        failedCount: 0,
        error: result.error || 'Failed to list folder files',
      };
    }
    driveFiles.push(...result.files);
    pageToken = result.nextPageToken;
  } while (pageToken && driveFiles.length < MAX_SYNC_FILES);

  if (driveFiles.length > MAX_SYNC_FILES) {
    driveFiles.length = MAX_SYNC_FILES;
  }

  let newCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let failedCount = 0;

  const temporalClient = getTemporalClient();

  const syncSingleFile = async (
    driveFile: (typeof driveFiles)[number],
  ): Promise<'new' | 'updated' | 'unchanged' | 'failed'> => {
    try {
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
        // Check if modified
        const existingMeta = existingFile.metadata as Record<
          string,
          unknown
        > | null;
        const storedModifiedTime = existingMeta?.driveModifiedTime as
          | string
          | undefined;

        if (storedModifiedTime === driveFile.modified_time) {
          return 'unchanged';
        }

        // File was modified — re-fetch content and update
        const contentResult = await getDriveFileContentQuery(
          orgId,
          userId,
          driveFile.id,
        );
        if (!contentResult.success || !contentResult.content) {
          logger.warn(
            { driveFileId: driveFile.id, error: contentResult.error },
            'Failed to fetch Drive file content during sync',
          );
          return 'failed';
        }

        const fileContent = Buffer.from(contentResult.content, 'utf-8');
        await uploadToS3WithOrg(org.id, `${existingFile.id}.md`, fileContent);

        // Delete existing document so workflow can re-create it
        if (existingFile.documentId) {
          await db.userDocument
            .delete({
              where: { id: existingFile.documentId },
            })
            .catch(() => {
              // Document may not exist, ignore
            });
        }

        await db.userFile.update({
          where: { id: existingFile.id, organizationId: orgId },
          data: {
            fileSize: fileContent.byteLength,
            fileName: driveFile.name.endsWith('.md')
              ? driveFile.name
              : `${driveFile.name}.md`,
            metadata: {
              driveFileId: driveFile.id,
              driveFolderId: syncRecord.driveFolderId,
              driveModifiedTime: driveFile.modified_time,
            },
            isUploaded: true,
            uploadedAt: new Date(),
            documentId: null,
            parsingStatus: 'NOT_STARTED',
            parsingStartedAt: null,
            parsingCompletedAt: null,
            parsingFailedAt: null,
            embeddingStatus: 'NOT_STARTED',
            embeddingStartedAt: null,
            embeddingCompletedAt: null,
            embeddingFailedAt: null,
          },
        });

        // Re-run embedding workflow
        const workflowId = `drive-sync-${nanoid()}`;
        await temporalClient.workflow.start(Workflow.RUN_FILE_EMBEDDINGS, {
          taskQueue: TASK_QUEUE_NAME,
          workflowId,
          args: [
            {
              ...existingFile,
              fileSize: fileContent.byteLength,
              fileName: driveFile.name.endsWith('.md')
                ? driveFile.name
                : `${driveFile.name}.md`,
              metadata: {
                driveFileId: driveFile.id,
                driveFolderId: syncRecord.driveFolderId,
                driveModifiedTime: driveFile.modified_time,
              },
              projectId: project.id,
              organizationSlug: org.slug,
              organizationId: org.id,
              userEmail: user?.email ?? undefined,
              userId,
            },
          ],
        });

        logger.info(
          { workflowId, driveFileId: driveFile.id, fileName: driveFile.name },
          'Updated and re-embedded synced Drive file',
        );

        return 'updated';
      }

      // New file — import it
      const contentResult = await getDriveFileContentQuery(
        orgId,
        userId,
        driveFile.id,
      );
      if (!contentResult.success || !contentResult.content) {
        logger.warn(
          { driveFileId: driveFile.id, error: contentResult.error },
          'Failed to fetch new Drive file content during sync',
        );
        return 'failed';
      }

      const newFileName = driveFile.name.endsWith('.md')
        ? driveFile.name
        : `${driveFile.name}.md`;

      const fileRecord = await db.userFile.create({
        data: {
          organizationId: orgId,
          fileName: newFileName,
          fileSize: Buffer.byteLength(contentResult.content, 'utf-8'),
          fileType: FileType.MARKDOWN,
          projectId: project.id,
          isBinaryFile: false,
          fileExtension: 'md',
          fileMimeType: 'text/markdown',
          metadata: {
            driveFileId: driveFile.id,
            driveFolderId: syncRecord.driveFolderId,
            driveModifiedTime: driveFile.modified_time,
          },
        },
      });

      const fileContent = Buffer.from(contentResult.content, 'utf-8');
      await uploadToS3WithOrg(org.id, `${fileRecord.id}.md`, fileContent);

      await db.userFile.update({
        where: { id: fileRecord.id, organizationId: orgId },
        data: { isUploaded: true, uploadedAt: new Date() },
      });

      const workflowId = `drive-sync-${nanoid()}`;
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
        { workflowId, driveFileId: driveFile.id, fileName: driveFile.name },
        'Imported new Drive file during sync',
      );

      return 'new';
    } catch (error) {
      logger.error(
        { err: error, driveFileId: driveFile.id },
        'Error syncing Drive file',
      );
      return 'failed';
    }
  };

  // Process in batches
  for (let i = 0; i < driveFiles.length; i += SYNC_BATCH_SIZE) {
    const batch = driveFiles.slice(i, i + SYNC_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((file) => syncSingleFile(file)),
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        switch (result.value) {
          case 'new':
            newCount++;
            break;
          case 'updated':
            updatedCount++;
            break;
          case 'unchanged':
            unchangedCount++;
            break;
          case 'failed':
            failedCount++;
            break;
        }
      } else {
        failedCount++;
      }
    }
  }

  // Update sync record
  await db.googleDriveSync.update({
    where: { id: syncRecord.id },
    data: { lastSyncedAt: new Date() },
  });

  return {
    success: true,
    newCount,
    updatedCount,
    unchangedCount,
    failedCount,
  };
};
