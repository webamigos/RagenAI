import { sendContactEmail } from '@/app/emails/services/mailer';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { type, email, title, message } = body;

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

    const response = await sendContactEmail({ email, title, message });

    if (response.error) {
      return NextResponse.json({ error: response.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    return NextResponse.json(
      { error: 'Błąd podczas przetwarzania żądania' },
      { status: 500 }
    );
  }
}
