import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

import { convertAndStoreDocument } from '../../threads/services/saveDataInVectorTable';
import db from '@salesyy/prisma-client';

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

    const processedFiles: any = [];

    await db.$transaction(async (tx) => {
      for (const file of files) {
        if (!file.size) {
          throw new Error(`Plik ${file.name} jest pusty`);
        }

        let content;
        const arrayBuffer = await file.arrayBuffer();
        content = file.name.endsWith('.epub')
          ? Buffer.from(arrayBuffer)
          : await file.text();

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

        if (!success) {
          logger.error(
            { err: message },
            `Błąd podczas przetwarzania pliku ${file.name}`
          );
          throw new Error(
            `Błąd podczas przetwarzania pliku ${file.name}: ${message}`
          );
        }

        await createDocumentDetailsInDB(
          file.name,
          file.size,
          uploaderId,
          uniqueFileId
        );

        if (file.name.endsWith('.md')) {
          await createMarkdownDocument({
            public_id: uniqueFileId,
            title: file.name,
            organization_id: organizationId.toLowerCase(),
            content: content as string,
          });
        }

        processedFiles.push({
          fileName: file.name,
          fileSize: file.size,
          uniqueFileId,
          content,
        });
      }
    });

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
