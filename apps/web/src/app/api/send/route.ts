export const dynamic = 'force-dynamic';

import { type NextRequest, NextResponse } from 'next/server';

import { sendContactEmail } from '@/app/emails/services/mailer';
import { logger } from '@/app/lib/utils/logger';
import { getCurrentUser } from '@/app/lib/utils/auth-helpers';

const VALID_TYPES = ['bug', 'question', 'suggestion'] as const;
type SupportType = (typeof VALID_TYPES)[number];

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    const type = formData.get('type') as string;
    const email = user.email;
    const title = formData.get('title') as string;
    const message = formData.get('message') as string;

    if (!VALID_TYPES.includes(type as SupportType)) {
      return NextResponse.json(
        { error: 'Nieznany typ wiadomości' },
        { status: 400 },
      );
    }

    if (!email || !title || !message) {
      return NextResponse.json(
        { error: 'Brak wymaganych pól do wysyłki kontaktowej' },
        { status: 400 },
      );
    }

    const attachments = [];

    const MAX_FILE_SIZE = 5 * 1024 * 1024;

    for (const file of files) {
      if (file instanceof File) {
        if (file.size > MAX_FILE_SIZE) {
          return NextResponse.json(
            { error: 'File too large' },
            { status: 400 },
          );
        }
        const arrayBuffer = await file.arrayBuffer();
        attachments.push({
          filename: file.name,
          content: Buffer.from(arrayBuffer).toString('base64'),
        });
      }
    }

    const categoryLabel = type.charAt(0).toUpperCase() + type.slice(1);

    const response = await sendContactEmail({
      email,
      title: `[${categoryLabel}] ${title}`,
      message,
      category: categoryLabel,
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
      { status: 500 },
    );
  }
}
