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
        { message: 'Brak plików do przetworzenia' },
        { status: 400 }
      );
    }

    const processedFiles = [];

    for (const file of files) {
      if (!file.size) {
        return NextResponse.json(
          { message: `Plik ${file.name} jest pusty` },
          { status: 400 }
        );
      }

      let content;
      const arrayBuffer = await file.arrayBuffer();
      content = file.name.endsWith('.epub')
        ? Buffer.from(arrayBuffer)
        : await file.text();

      try {
        const uniqueFileId = uuidv4();
        const defaultProjectId = await fetchOrganizationDefaultProjectId(
          organizationId
        );
        const { message, success } = await convertAndStoreDocument({
          fileContent: content,
          fileName: file.name,
          organizationId,
          fileId: uniqueFileId,
          projectId: defaultProjectId,
        });

        if (success) {
          await createDocumentDetailsInDB(
            file.name,
            file.size,
            uploaderId,
            uniqueFileId
          );
          if (file.name.endsWith('.md') || file.name.endsWith('.srt')) {
            await createMarkdownDocument({
              public_id: uniqueFileId,
              title: file.name,
              organization_id: organizationId,
              content: content as string,
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
          fileName: file.name,
          fileSize: file.size,
          uniqueFileId,
          content,
        });
      } catch (error) {
        logger.error({ err: error }, `Error processing file ${file.name}`);
        return NextResponse.json(
          { message: `Błąd podczas przetwarzania pliku ${file.name}` },
          { status: 500 }
        );
      }
    }
    await SaveOrganizationPublicMetadata(uploaderId, true);
    return NextResponse.json({
      message: 'Pliki zostały przetworzone',
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
