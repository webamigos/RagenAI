import { NextRequest, NextResponse } from 'next/server';
import { convertAndStoreDocument } from '../../threads/services/saveDataInVectorTable';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = {
  params: { upload: string };
};

export async function POST(request: NextRequest, { params }: Params) {
  const uploaderId = params.upload;

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
      await convertAndStoreDocument(content, file.name, uploaderId);
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
