import { ElevenLabsClient } from 'elevenlabs';
import type { TtsProvider, SttProvider } from './types';

const FETCH_TIMEOUT_MS = 60_000;

export class ElevenLabsTtsProvider implements TtsProvider {
  private client: ElevenLabsClient;

  constructor() {
    this.client = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY,
    });
  }

  async synthesize(text: string, voiceId: string): Promise<Buffer> {
    const response = await this.client.textToSpeech.convert(voiceId, {
      output_format: 'mp3_44100_128',
      text,
      model_id: 'eleven_multilingual_v2',
    });

    const chunks: Uint8Array[] = [];
    for await (const chunk of response) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }
}

export class ElevenLabsSttProvider implements SttProvider {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY!;
  }

  async transcribe(
    audioBuffer: Buffer,
    mimeType: string,
    language?: string,
  ): Promise<string> {
    const blob = new Blob([audioBuffer], { type: mimeType || 'audio/webm' });

    const formData = new FormData();
    formData.append('file', blob, 'recording.webm');
    formData.append('model_id', 'scribe_v1');
    formData.append('tag_audio_events', 'false');
    if (language) {
      formData.append('language_code', language);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(
        'https://api.elevenlabs.io/v1/speech-to-text',
        {
          method: 'POST',
          headers: { 'xi-api-key': this.apiKey },
          body: formData,
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `ElevenLabs STT error (${response.status}): ${errorBody}`,
        );
      }

      const result = await response.json();
      return typeof result.text === 'string' ? result.text : '';
    } finally {
      clearTimeout(timer);
    }
  }
}
