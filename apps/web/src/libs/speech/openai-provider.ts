import type { TtsProvider, SttProvider } from './types';

const FETCH_TIMEOUT_MS = 60_000;

/** OpenAI's own audio API, when nothing points somewhere else. */
const DEFAULT_BASE_URL = 'https://api.openai.com';

/**
 * Where the `/v1/audio/*` calls go, and what authenticates them.
 *
 * Until B3 this read `LITELLM_PROXY_URL` and `LITELLM_MASTER_KEY`, preferring
 * them over OpenAI's own endpoint. That was not merely indirect — it was
 * broken: `infra/litellm/config.yaml` registers no audio route, and never has,
 * so any deployment with a proxy URL set (which is all of them; the variable is
 * required) and `SPEECH_PROVIDER=openai` sent every synthesis and every
 * transcription to an endpoint that 404s. The fallback to `api.openai.com` was
 * unreachable for exactly the deployments that needed it.
 *
 * `SPEECH_BASE_URL` replaces it as a real seam rather than a hardcoded
 * indirection: OpenAI's audio API is spoken by vLLM, by a LiteLLM proxy that
 * *has* been given audio routes, and by several hosted providers. Pointing at
 * one is configuration now (Q6), and pointing at none means OpenAI.
 *
 * The key is read per call rather than in the constructor, because the provider
 * is cached for the process's lifetime in `index.ts` and a constructor read
 * would pin whatever the environment held at first use.
 */
function endpoint(path: string): string {
  const base = process.env.SPEECH_BASE_URL || DEFAULT_BASE_URL;
  return `${base.replace(/\/+$/, '')}${path}`;
}

function apiKey(): string {
  const key = process.env.SPEECH_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) {
    // Loudly, and naming both variables. The previous code defaulted to `''`
    // and sent `Authorization: Bearer `, turning a configuration mistake into
    // an upstream 401 that reads like a bad key rather than a missing one.
    throw new Error(
      'OpenAI speech provider needs a key: set SPEECH_API_KEY, or OPENAI_API_KEY to reuse the chat key.',
    );
  }
  return key;
}

/**
 * Text-to-speech over OpenAI's `/v1/audio/speech` API.
 *
 * "OpenAI" names the wire format, not the vendor — see `endpoint` above.
 */
export class OpenAiTtsProvider implements TtsProvider {
  async synthesize(text: string, voiceId: string): Promise<Buffer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint('/v1/audio/speech'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey()}`,
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
 * Speech-to-text over OpenAI's `/v1/audio/transcriptions` API.
 *
 * "OpenAI" names the wire format, not the vendor — see `endpoint` above.
 */
export class OpenAiSttProvider implements SttProvider {
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
      const response = await fetch(endpoint('/v1/audio/transcriptions'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey()}`,
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
