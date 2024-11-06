import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

import { convertAndStoreDocument } from '../../threads/services/saveDataInVectorTable';
import { deleteDocument } from '../services/TableService';

import { logger } from '../../../lib/utils/logger';
import {
  createDocumentDetailsInDB,
  createMarkdownDocument,
  deleteDocumentFromUserDocument,
} from '../../../lib/services/document';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = {
  params: { upload: string };
};

export async function POST(request: NextRequest, { params }: Params) {
  const uploaderId = params.upload[0];

  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const organizationId = formData.get('organizationId') as string;

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
        const { message, success } = await convertAndStoreDocument(
          content,
          file.name,
          organizationId,
          uniqueFileId
        );

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

        if (!success) {
          logger.error(
            `Błąd podczas przetwarzania pliku ${file.name}:%o`,
            message
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
        logger.error(`Błąd podczas przetwarzania pliku ${file.name}:`, error);
        return NextResponse.json(
          { message: `Błąd podczas przetwarzania pliku ${file.name}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      message: 'Pliki zostały przetworzone',
      status: 200,
      files: processedFiles,
    });
  } catch (error) {
    logger.error('Błąd podczas przetwarzania plików:', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: any }) {
  const visitor_id = params.upload[0];
  const document_id = params.upload[1];

  if (!visitor_id || !document_id) {
    return new Response(
      JSON.stringify({ error: 'Missing visitor_id or document_id' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    await deleteDocument(document_id);
    await deleteDocumentFromUserDocument(document_id, visitor_id);
    return new Response(
      JSON.stringify({ message: 'Document successfully deleted' }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Error in DELETE handler:', error);
    return new Response(JSON.stringify({ error: 'Error deleting document' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
