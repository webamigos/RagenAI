import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { auth } from '@clerk/nextjs/server';

import { convertAndStoreDocument } from '../../threads/services/saveDataInVectorTable';
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
import { uploadToS3 } from '@/app/lib/services/aws';
import { createFileDetailsInDB } from '@/app/lib/services/file';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = {
  params: { upload: string };
};

export async function POST(request: NextRequest, { params }: Params) {
  const uploaderId = params.upload[0];

  const { orgId } = auth();
  if (!orgId) {
    throw new Error('Invalid organization');
  }

  try {
    setSentryServiceTag('upload');
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const organizationId = orgId;
    setSentryClerkOrganizationTag(organizationId);
    if (!uploaderId) {
      logger.error('Uploader ID missing!');
      return NextResponse.json(
        { message: 'Uploader ID is missing!' },
        { status: 400 }
      );
    }
    if (!files || files.length === 0) {
      return NextResponse.json(
        { message: 'No file to process' },
        { status: 400 }
      );
    }

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
        const { message, success } = await convertAndStoreDocument({
          fileContent: parsedFile.content,
          fileName: parsedFile.fileName,
          organizationId,
          fileId: uniqueFileId,
          projectId: defaultProjectId,
        });

        if (success) {
          const fileRecord = await createFileDetailsInDB(
            parsedFile.fileName,
            file.size,
            organizationId,
            uniqueFileId,
            fileType
          );

          if (parsedFile.fileType === 'text' || parsedFile.fileType === 'srt') {
            await createMarkdownDocument({
              public_id: uniqueFileId,
              title: parsedFile.fileName,
              organization_id: organizationId,
              content: parsedFile.content as string,
              file_id: fileRecord.id,
            });
          }

          // upload file to S3 in the background
          uploadToS3(
            `${fileRecord.id}.${fileExtension}`,
            parsedFile.content as Buffer
          )
            .then(() => {
              logger.info(`File uploaded to S3: ${parsedFile.fileName}`);
            })
            .catch((error) => {
              logger.error(
                { err: error },
                `Error uploading file to S3: ${parsedFile.fileName}`
              );
            });
        }

        if (!success) {
          logger.error(
            { err: message },
            `Błąd podczas przetwarzania pliku ${file.name}`
          );
          return NextResponse.json({ message }, { status: 500 });
        }

        processedFiles.push({
          fileName: parsedFile.fileName,
          fileSize: file.size,
          uniqueFileId,
          content: parsedFile.content,
        });

        usageTracker.incUploadedFilesSize(file.size);
        usageTracker.incUploadedFilesCount();
      } catch (error) {
        logger.error({ err: error }, `Error processing file ${file.name}`);
        return NextResponse.json(
          { message: `Error while processing the file ${file.name}` },
          { status: 500 }
        );
      }
    }
    await saveOrganizationPublicMetadata(uploaderId, { hasKnowledge: true });
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
