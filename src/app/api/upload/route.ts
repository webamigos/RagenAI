import { type NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUser,
} from '@/app/lib/utils/auth-helpers';
import { logger } from '@/app/lib/utils/logger';
import { getProjectByPublicIdOrThrowQuery as getProjectByPublicIdOrThrow } from '@/features/projects/services/queries/get-project-query';
import { saveOrganizationPublicMetadata } from '@/app/actions';
import { getFileType, parseFile } from '@/app/lib/services/fileParser';
import { uploadToS3 } from '@/app/lib/services/aws';
import { createFileDetailsInDB } from '@/app/lib/services/file';
import db from '@ragenai/prisma-client';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import { Workflow } from '@/features/documents/contracts/document.types';
import { getStorageLimits } from '@/features/organizations/services/organization-settings';
import {
  getStorageUsageQuery,
  getProjectStorageUsageQuery,
} from '@/features/organizations/services/queries/get-storage-usage-query';
import prettyBytes from 'pretty-bytes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// I've removed uploader/organization id from request
// it was security breach - everyone could set any organization during files transfer
export async function POST(request: NextRequest) {
  const orgId = await getOrgIdFromAuthOrThrow();
  if (!orgId) {
    throw new Error('Invalid organization');
  }

  const [user, org] = await Promise.all([
    getCurrentUser(),
    db.organization.findUnique({
      where: { id: orgId },
      select: { slug: true },
    }),
  ]);

  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const formProjectId = formData.get('projectId')?.toString();

    if (!files || files.length === 0) {
      return NextResponse.json(
        { message: 'No file to process' },
        { status: 400 },
      );
    }

    let projectRecord = undefined;
    if (formProjectId) {
      projectRecord = await getProjectByPublicIdOrThrow(formProjectId);
      if (projectRecord.organization_id !== orgId) {
        return NextResponse.json(
          { message: 'Project does not belong to this organization' },
          { status: 403 },
        );
      }
    }

    // Storage limit enforcement
    const [storageLimits, orgUsage, projectUsageResult] = await Promise.all([
      getStorageLimits(orgId),
      getStorageUsageQuery(orgId),
      projectRecord
        ? getProjectStorageUsageQuery(orgId, projectRecord.id)
        : Promise.resolve(null),
    ]);
    let runningOrgUsage = orgUsage.totalBytes;
    let runningProjectUsage = projectUsageResult?.totalBytes ?? 0;

    const processedFiles = [];
    const failedFiles: { fileName: string; error: string }[] = [];

    for (const file of files) {
      // Check single file limit
      if (file.size > storageLimits.singleFileLimitBytes) {
        failedFiles.push({
          fileName: file.name,
          error: `File exceeds maximum size of ${prettyBytes(storageLimits.singleFileLimitBytes)}`,
        });
        continue;
      }

      // Check org-wide storage limit
      if (runningOrgUsage + file.size > storageLimits.storageLimitBytes) {
        failedFiles.push({
          fileName: file.name,
          error: `Organization storage limit of ${prettyBytes(storageLimits.storageLimitBytes)} would be exceeded`,
        });
        continue;
      }

      // Check project storage limit
      if (
        projectRecord &&
        runningProjectUsage + file.size > storageLimits.projectStorageLimitBytes
      ) {
        failedFiles.push({
          fileName: file.name,
          error: `Project storage limit of ${prettyBytes(storageLimits.projectStorageLimitBytes)} would be exceeded`,
        });
        continue;
      }
      try {
        const parsedFile = await parseFile(file, orgId);
        const fileType = getFileType(parsedFile.fileName);
        const fileExtension = parsedFile.fileExtension;

        // Step 1: create file details in db
        const fileRecord = await createFileDetailsInDB(
          parsedFile.fileName,
          file.size,
          orgId,
          fileType,
          projectRecord?.id ?? null,
        );

        // Step 2: upload to S3
        await uploadToS3(
          `${fileRecord.public_id}.${fileExtension}`,
          parsedFile.content as Buffer,
        );

        await db.userFile.update({
          where: {
            id: fileRecord.id,
            organization_id: orgId,
          },
          data: {
            is_uploaded: true,
            uploaded_at: new Date(),
          },
        });

        logger.info(`File uploaded to S3: ${parsedFile.fileName}`);

        // Step 3: start async embedding workflow
        const embeddingWorkflowId = `doc-${nanoid()}`;
        const client = getTemporalClient();

        await client.workflow.start(Workflow.RUN_FILE_EMBEDDINGS, {
          taskQueue: TASK_QUEUE_NAME,
          workflowId: embeddingWorkflowId,
          args: [
            {
              ...fileRecord,
              project_public_id: projectRecord?.public_id ?? null,
              organization_slug: org?.slug ?? undefined,
              user_email: user?.email ?? undefined,
            },
          ],
        });

        logger.info(
          { workflowId: embeddingWorkflowId, fileName: parsedFile.fileName },
          'Started embedding workflow',
        );

        // Only count as processed after workflow start succeeds
        processedFiles.push({
          fileName: parsedFile.fileName,
          fileSize: file.size,
          uniqueFileId: fileRecord.public_id,
        });

        // Update running totals for cumulative validation
        runningOrgUsage += file.size;
        if (projectRecord) {
          runningProjectUsage += file.size;
        }
      } catch (error) {
        logger.error({ err: error }, `Error processing file ${file.name}`);
        failedFiles.push({
          fileName: file.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Continue processing remaining files
      }
    }

    if (processedFiles.length > 0) {
      await saveOrganizationPublicMetadata(orgId, {
        hasKnowledge: true,
      });
    }

    if (processedFiles.length === 0 && failedFiles.length > 0) {
      return NextResponse.json(
        { message: 'All files failed to process', failedFiles },
        { status: 500 },
      );
    }

    return NextResponse.json({
      message:
        failedFiles.length > 0
          ? `${processedFiles.length} file(s) processed, ${failedFiles.length} failed`
          : 'All files are successfully processed',
      status: 200,
      files: processedFiles,
      failedFiles: failedFiles.length > 0 ? failedFiles : undefined,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error processing files');
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 },
    );
  }
}
