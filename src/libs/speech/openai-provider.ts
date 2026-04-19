import type { TtsProvider, SttProvider } from './types';

const FETCH_TIMEOUT_MS = 60_000;

/**
 * OpenAI TTS provider.
 *
 * Uses the OpenAI-compatible TTS endpoint. When LITELLM_PROXY_URL is set,
 * routes through LiteLLM proxy; otherwise uses OpenAI directly.
 */
export class OpenAiTtsProvider implements TtsProvider {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.LITELLM_PROXY_URL || 'https://api.openai.com';
    this.apiKey =
      process.env.LITELLM_MASTER_KEY || process.env.OPENAI_API_KEY || '';
  }

  async synthesize(text: string, voiceId: string): Promise<Buffer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}/v1/audio/speech`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.TTS_MODEL || 'tts-1',
          input: text,
          voice: voiceId,
          response_format: 'mp3',
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI TTS error (${response.status}): ${errorBody}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * OpenAI Whisper STT provider.
 *
 * Uses the OpenAI-compatible transcription endpoint. When LITELLM_PROXY_URL
 * is set, routes through LiteLLM proxy; otherwise uses OpenAI directly.
 */
export class OpenAiSttProvider implements SttProvider {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.LITELLM_PROXY_URL || 'https://api.openai.com';
    this.apiKey =
      process.env.LITELLM_MASTER_KEY || process.env.OPENAI_API_KEY || '';
  }

  async transcribe(
    audioBuffer: Buffer,
    mimeType: string,
    language?: string,
  ): Promise<string> {
    const blob = new Blob([audioBuffer], { type: mimeType || 'audio/webm' });

    const formData = new FormData();
    formData.append('file', blob, 'recording.webm');
    formData.append('model', process.env.STT_MODEL || 'whisper-1');
    if (language) {
      formData.append('language', language);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}/v1/audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `OpenAI Whisper STT error (${response.status}): ${errorBody}`,
        );
      }

      const result = await response.json();
      return typeof result.text === 'string' ? result.text : '';
    } finally {
      clearTimeout(timer);
    }
  }
}
