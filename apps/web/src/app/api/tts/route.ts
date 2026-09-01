import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/app/lib/utils/logger';
import { auth } from '@/lib/auth';
import { getTtsProvider } from '@/libs/speech';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tts = await getTtsProvider();
    if (!tts) {
      return NextResponse.json(
        { error: 'TTS service not configured' },
        { status: 503 },
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { text, voiceId } = body;

    if (!text || !voiceId) {
      return NextResponse.json(
        { error: 'text and voiceId are required' },
        { status: 400 },
      );
    }

    if (typeof text !== 'string' || text.length > 5000) {
      return NextResponse.json(
        { error: 'text must be a string under 5000 characters' },
        { status: 400 },
      );
    }

    const audioBuffer = await tts.synthesize(text, voiceId);

    return new Response(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString(),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error in TTS conversion');
    return NextResponse.json(
      { error: 'Failed to convert text to speech' },
      { status: 500 },
    );
  }
}
