import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

import { convertAndStoreDocument } from '../../threads/services/saveDataInVectorTable';
import { logger } from '../../../lib/utils/logger';
import {
  createDocumentDetailsInDB,
  createMarkdownDocument,
} from '../../../lib/services/document';
import {
  setSentryClerkOrganizationTag,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';
import { fetchOrganizationDefaultProjectId } from '@/app/lib/services/project';
import { SaveOrganizationPublicMetadata } from '@/app/actions';
import { parseFile } from '../../../lib/services/fileParser';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = {
  params: { upload: string };
};

export async function POST(request: NextRequest, { params }: Params) {
  const uploaderId = params.upload[0];

  try {
    setSentryServiceTag('upload');
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const organizationId = formData.get('organizationId') as string;
    setSentryClerkOrganizationTag(organizationId);

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
          await createDocumentDetailsInDB(
            parsedFile.fileName,
            file.size,
            uploaderId,
            uniqueFileId
          );

          if (parsedFile.fileType === 'text' || parsedFile.fileType === 'srt') {
            await createMarkdownDocument({
              public_id: uniqueFileId,
              title: parsedFile.fileName,
              organization_id: organizationId,
              content: parsedFile.content as string,
            });
          }
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
      } catch (error) {
        logger.error({ err: error }, `Error processing file ${file.name}`);
        return NextResponse.json(
          { message: `Error while processing the file ${file.name})` },
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
