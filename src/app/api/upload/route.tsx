import { NextRequest, NextResponse } from 'next/server';
import { convertAndStoreDocument } from '../../api/threads/services/createVectorTable';
import { logger } from '@/app/lib/utils/logger';

export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { message: 'Brak plików do przetworzenia' },
        { status: 400 }
      );
    }

    for (const file of files) {
      const content = await file.text();
      await convertAndStoreDocument(content, file.name);
    }

    return NextResponse.json(
      { message: 'Pliki zostały przetworzone' },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Błąd podczas przetwarzania plików:', error);
    return NextResponse.json(
      { message: 'Wystąpił błąd podczas przetwarzania plików' },
      { status: 500 }
    );
  }
}
