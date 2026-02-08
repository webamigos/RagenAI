import { NextRequest, NextResponse } from 'next/server';

import { sendContactEmail } from '@/app/emails/services/mailer';
import { logger } from '@/app/lib/utils/logger';
import { getCurrentUser } from '@/app/lib/utils/auth-helpers';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.email) {
      throw new Error('Invalid user');
    }
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    const type = formData.get('type');
    const email = user.email;
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

    let attachments = [];

    for (const file of files) {
      if (file instanceof File) {
        const arrayBuffer = await file.arrayBuffer();
        attachments.push({
          filename: file.name,
          content: Buffer.from(arrayBuffer).toString('base64'),
        });
      }
    }

    const response = await sendContactEmail({
      email,
      title,
      message,
      files: attachments,
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
