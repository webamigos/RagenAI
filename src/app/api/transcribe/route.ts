import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB
const FETCH_TIMEOUT_MS = 60_000;

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Transcription service not configured' },
        { status: 503 },
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const language = (formData.get('language') as string) || undefined;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'audio file is required' },
        { status: 400 },
      );
    }

    if (audioFile.size > MAX_AUDIO_SIZE) {
      return NextResponse.json(
        { error: 'Audio file exceeds 25MB limit' },
        { status: 400 },
      );
    }

    logger.info(
      { size: audioFile.size, type: audioFile.type, name: audioFile.name },
      'Transcribe request received',
    );

    // Read the file into a Buffer, then create a fresh Blob.
    // Next.js Web API File objects don't always serialize correctly
    // when re-appended to a new FormData for outbound fetch.
    const arrayBuffer = await audioFile.arrayBuffer();
    const blob = new Blob([arrayBuffer], {
      type: audioFile.type || 'audio/webm',
    });

    const elevenLabsForm = new FormData();
    elevenLabsForm.append('file', blob, 'recording.webm');
    elevenLabsForm.append('model_id', 'scribe_v1');
    elevenLabsForm.append('tag_audio_events', 'false');
    if (language) {
      elevenLabsForm.append('language_code', language);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(
      'https://api.elevenlabs.io/v1/speech-to-text',
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
        },
        body: elevenLabsForm,
        signal: controller.signal,
      },
    );

    clearTimeout(timer);

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(
        { status: response.status, body: errorBody },
        'ElevenLabs STT API error',
      );
      return NextResponse.json(
        {
          error: `Transcription service error (${response.status})`,
        },
        { status: 502 },
      );
    }

    const result = await response.json();

    if (typeof result.text !== 'string') {
      logger.error({ result }, 'Invalid transcription response');
      return NextResponse.json({ text: '' });
    }

    logger.info({ textLength: result.text.length }, 'Transcription successful');

    return NextResponse.json({ text: result.text });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('ElevenLabs API request timed out');
      return NextResponse.json(
        { error: 'Transcription service timed out' },
        { status: 504 },
      );
    }
    logger.error({ err: error }, 'Error in audio transcription');
    return NextResponse.json(
      { error: 'Failed to transcribe audio' },
      { status: 500 },
    );
  }
}
