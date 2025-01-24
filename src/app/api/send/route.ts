import { NextRequest, NextResponse } from 'next/server';

import { sendContactEmail } from '@/app/emails/services/mailer';
import { logger } from '@/app/lib/utils/logger';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const type = formData.get('type');
    const email = formData.get('email') as string;
    const title = formData.get('title') as string;
    const message = formData.get('message') as string;
    const file = formData.get('file') as File | null;

    if (type !== 'contact') {
      return NextResponse.json(
        { error: 'Nieznany typ wiadomości' },
        { status: 400 }
      );
    }

    if (!email || !title || !message) {
      return NextResponse.json(
        { error: 'Brak wymaganych pól do wysyłki kontaktowej' },
        { status: 400 }
      );
    }

    let attachment;
    if (file) {
      const arrayBuffer = await file.arrayBuffer();
      const base64File = Buffer.from(arrayBuffer).toString('base64');

      attachment = {
        filename: file.name,
        content: base64File,
      };
    }

    const response = await sendContactEmail({
      email,
      title,
      message,
      file: attachment,
    });

    if (response.error) {
      return NextResponse.json({ error: response.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    logger.error({ err: error }, 'Błąd podczas przetwarzania żądania');
    return NextResponse.json(
      { error: 'Błąd podczas przetwarzania żądania' },
      { status: 500 }
    );
  }
}
