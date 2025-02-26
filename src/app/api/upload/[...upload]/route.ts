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
import {
  fetchOrganizationDefaultProjectId,
  getProjectByPublicId,
} from '@/app/lib/services/project';
import { saveOrganizationPublicMetadata } from '@/app/actions';
import { getFileType, parseFile } from '@/app/lib/services/fileParser';
import { usageTracker } from '@/app/lib/services/usage';
import { uploadToS3 } from '@/app/lib/services/aws';
import { createFileDetailsInDB } from '@/app/lib/services/file';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = {
  params: { upload: string[] };
};

export async function POST(request: NextRequest, { params }: Params) {
  // Sprawdzamy czy to upload do organizacji czy do konkretnego projektu
  const uploadMode = params.upload[0];
  const isProjectUpload = uploadMode === 'project';

  let uploaderId: string | undefined;
  let projectPublicId: string | undefined;

  if (isProjectUpload) {
    // Format URL: /api/upload/project/{projectPublicId}
    projectPublicId = params.upload[1];
    if (!projectPublicId) {
      return NextResponse.json(
        { message: 'Project ID is missing!' },
        { status: 400 }
      );
    }
  } else {
    // Format URL: /api/upload/{organizationId}
    uploaderId = params.upload[0];
    if (!uploaderId) {
      logger.error('Uploader ID missing!');
      return NextResponse.json(
        { message: 'Uploader ID is missing!' },
        { status: 400 }
      );
    }
  }

  const { orgId } = auth();
  if (!orgId) {
    return NextResponse.json(
      { message: 'Invalid organization' },
      { status: 401 }
    );
  }

  try {
    setSentryServiceTag(isProjectUpload ? 'upload-project' : 'upload');
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const organizationId = orgId;
    setSentryClerkOrganizationTag(organizationId);

    // Możemy również obsłużyć opcjonalny projectId w formData
    const formDataProjectId = formData.get('projectId')?.toString();

    if (!files || files.length === 0) {
      return NextResponse.json(
        { message: 'No file to process' },
        { status: 400 }
      );
    }

    // Ustalenie projectId - z URL dla projektu, z formData jako opcja, lub domyślny
    let projectId: number | null = null;

    if (isProjectUpload && projectPublicId) {
      // Jeśli upload do projektu, pobierz ID projektu z URL
      const project = await getProjectByPublicId(projectPublicId);
      if (!project) {
        return NextResponse.json(
          { message: 'Project not found' },
          { status: 404 }
        );
      }
      projectId = project.id;
    } else if (formDataProjectId) {
      // Jeśli przekazano projectId w formData, użyj go
      const parsedId = parseInt(formDataProjectId, 10);
      if (isNaN(parsedId)) {
        return NextResponse.json(
          { message: 'Invalid project ID' },
          { status: 400 }
        );
      }
      projectId = parsedId;
    } else {
      // W przeciwnym razie użyj domyślnego projektu
      projectId = await fetchOrganizationDefaultProjectId(organizationId);
    }

    const processedFiles = [];

    for (const file of files) {
      try {
        const parsedFile = await parseFile(file, organizationId);
        const fileType = getFileType(parsedFile.fileName);
        const fileExtension = parsedFile.fileExtension;

        const uniqueFileId = uuidv4();

        const { message, success } = await convertAndStoreDocument({
          fileContent: parsedFile.content,
          fileName: parsedFile.fileName,
          organizationId,
          fileId: uniqueFileId,
          projectId,
          mimeType: file.type,
        });

        if (success) {
          const fileRecord = await createFileDetailsInDB(
            parsedFile.fileName,
            file.size,
            organizationId,
            uniqueFileId,
            fileType,
            projectId ?? undefined
          );

          if (parsedFile.fileType === 'text' || parsedFile.fileType === 'srt') {
            await createMarkdownDocument({
              public_id: uniqueFileId,
              title: parsedFile.fileName,
              organization_id: organizationId,
              content: parsedFile.content as string,
              file_id: fileRecord.id,
              project_id: projectId || undefined,
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
          content: isProjectUpload ? undefined : parsedFile.content,
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

    // Aktualizuj metadane organizacji tylko dla uploadu do organizacji
    if (!isProjectUpload && uploaderId) {
      await saveOrganizationPublicMetadata(uploaderId, { hasKnowledge: true });
    }

    return NextResponse.json({
      message: 'All files successfully processed',
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
