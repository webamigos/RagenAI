import { NextResponse, type NextRequest } from 'next/server';
import { ElevenLabsClient } from 'elevenlabs';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'TTS service not configured' },
        { status: 503 },
      );
    }

    const body = await request.json();
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

    const client = new ElevenLabsClient({ apiKey });

    const response = await client.textToSpeech.convert(voiceId, {
      output_format: 'mp3_44100_128',
      text,
      model_id: 'eleven_multilingual_v2',
    });

    const chunks: Uint8Array[] = [];
    for await (const chunk of response) {
      chunks.push(chunk);
    }

    const audioBuffer = Buffer.concat(chunks);

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
