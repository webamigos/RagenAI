import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/app/lib/utils/logger';
import { auth } from '@/lib/auth';
import { getSttProvider } from '@/libs/speech';
import { getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';

export const dynamic = 'force-dynamic';

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Voice dictation is opt-in per organization (a platform admin turns it
    // on in apps/admin). Hiding the microphone in the composer is a courtesy;
    // this is the gate — the route is reachable directly by anyone with a
    // session, and transcription costs money per request.
    const orgId = await getOrgIdFromAuth();
    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const voiceInputEnabled = await isFeatureEnabledQuery(orgId, 'voiceInput');
    if (!voiceInputEnabled) {
      return NextResponse.json(
        { error: 'Voice dictation is not enabled for your organization' },
        { status: 403 },
      );
    }

    const stt = await getSttProvider();
    if (!stt) {
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

    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    const text = await stt.transcribe(
      audioBuffer,
      audioFile.type || 'audio/webm',
      language,
    );

    logger.info({ textLength: text.length }, 'Transcription successful');

    return NextResponse.json({ text });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('Speech-to-text API request timed out');
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
