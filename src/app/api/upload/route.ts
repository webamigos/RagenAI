import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { auth } from '@clerk/nextjs/server';
import { convertAndStoreDocument } from '../threads/services/saveDataInVectorTable';
import { logger } from '@/app/lib/utils/logger';
import { createMarkdownDocument } from '@/app/lib/services/document';
import {
  setSentryClerkOrganizationTag,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';
import { fetchOrganizationDefaultProjectId } from '@/app/lib/services/project';
import { saveOrganizationPublicMetadata } from '@/app/actions';
import { getFileType, parseFile } from '@/app/lib/services/fileParser';
import { usageTracker } from '@/app/lib/services/usage';
import { getFileFromS3, uploadToS3 } from '@/app/lib/services/aws';
import { createFileDetailsInDB } from '@/app/lib/services/file';
import { getOrgIdOrThrow } from '@/app/lib/services/clerk';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// I've removed uploader/organization id from request
// it was security breach - everyone could set any organization during files transfer
export async function POST(request: NextRequest) {
  const { orgId } = auth();
  if (!orgId) {
    throw new Error('Invalid organization');
  }

  try {
    setSentryServiceTag('upload');
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const organizationId = getOrgIdOrThrow();
    const projectIdFromForm = formData.get('projectId')?.toString();

    setSentryClerkOrganizationTag(organizationId);

    if (!files || files.length === 0) {
      return NextResponse.json(
        { message: 'No file to process' },
        { status: 400 }
      );
    }

    const formProjectId = formData.get('projectId');

    const processedFiles = [];

    for (const file of files) {
      try {
        const parsedFile = await parseFile(file, organizationId);
        const fileType = getFileType(parsedFile.fileName);
        const fileExtension = parsedFile.fileExtension;

        const uniqueFileId = uuidv4();

        const defaultProjectId = await fetchOrganizationDefaultProjectId(
          organizationId
        );
        if (!defaultProjectId) {
          throw new Error('Default project ID is missing');
        }

        let projectIdForDb: number | undefined = undefined;

        if (projectIdFromForm) {
          projectIdForDb = parseInt(projectIdFromForm, 10);
        } else {
          projectIdForDb = undefined;
        }

        if (!projectIdForDb && !defaultProjectId) {
          throw new Error('Project ID is missing');
        }

        // Step1: create file details in db
        const fileRecord = await createFileDetailsInDB(
          parsedFile.fileName,
          file.size,
          organizationId,
          fileType,
          projectIdForDb ?? defaultProjectId
        );

        // Step2: upload to S3
        try {
          // this may be breaking change - files before had uuid as name
          // but there wasn't a logic which used files, so it should still work
          const uploadResult = await uploadToS3(
            `${fileRecord.public_id}.${fileExtension}`,
            parsedFile.content as Buffer
          );
          logger.info(`File uploaded to S3: ${parsedFile.fileName}`);

          processedFiles.push({
            fileName: parsedFile.fileName,
            fileSize: file.size,
            uniqueFileId,
            content: parsedFile.content,
          });

          // TODO: move to workflow
          // get file content
          const fileBuffer = await getFileFromS3(
            `${fileRecord.public_id}.${fileExtension}`
          );

          // For text files (like .txt, .md, .json, etc.)
          const textContent = fileBuffer.toString();
          // const textContent = fileBuffer.toString('utf-8');

          // binary files
          const base64Content = fileBuffer.toString();
          // const base64Content = fileBuffer.toString('base64');

          // console.log({ textContent });

          usageTracker.incUploadedFilesSize(file.size);
          usageTracker.incUploadedFilesCount();
        } catch (err) {
          logger.error(
            { err },
            `Error uploading file to S3: ${parsedFile.fileName}`
          );
          // TODO: can one file interrupt upload of others?
          return NextResponse.json({ status: 'Upload error' }, { status: 500 });
        }

        // Step3: run workflow
        // TODO: move to workflow
        // const { message, success } = await convertAndStoreDocument({
        //   fileContent: parsedFile.content,
        //   fileName: parsedFile.fileName,
        //   organizationId,
        //   fileId: uniqueFileId,
        //   projectId: projectIdForDb ?? defaultProjectId,
        //   mimeType: file.type,
        // });

        // if (success) {
        //   if (parsedFile.fileType === 'text' || parsedFile.fileType === 'srt') {
        //     await createMarkdownDocument({
        //       public_id: uniqueFileId,
        //       title: parsedFile.fileName,
        //       organization_id: organizationId,
        //       content: parsedFile.content as string,
        //       file_id: fileRecord.id,
        //     });
        //   }
        // }
      } catch (error) {
        logger.error({ err: error }, `Error processing file ${file.name}`);
        return NextResponse.json(
          { message: `Error while processing the file ${file.name}` },
          { status: 500 }
        );
      }
    }
    await saveOrganizationPublicMetadata(organizationId, {
      hasKnowledge: true,
    });
    return NextResponse.json({
      message: 'All files are successfully processed',
      status: 200,
      files: processedFiles,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error processing files');
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}
