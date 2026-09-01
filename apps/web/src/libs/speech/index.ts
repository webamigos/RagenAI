import type { TtsProvider, SttProvider } from './types';

export type { TtsProvider, SttProvider } from './types';

let ttsInstance: TtsProvider | null = null;
let sttInstance: SttProvider | null = null;

/**
 * Returns the configured TTS provider, or null if none is configured.
 *
 * SPEECH_PROVIDER env: 'elevenlabs' (default when ELEVENLABS_API_KEY is set),
 * 'openai' (uses OpenAI TTS via LiteLLM or directly).
 */
export async function getTtsProvider(): Promise<TtsProvider | null> {
  if (ttsInstance) {
    return ttsInstance;
  }

  const provider = process.env.SPEECH_PROVIDER || detectProvider();
  if (!provider) {
    return null;
  }

  switch (provider) {
    case 'elevenlabs': {
      const { ElevenLabsTtsProvider } = await import('./elevenlabs-provider');
      ttsInstance = new ElevenLabsTtsProvider();
      break;
    }
    case 'openai': {
      const { OpenAiTtsProvider } = await import('./openai-provider');
      ttsInstance = new OpenAiTtsProvider();
      break;
    }
    default:
      throw new Error(
        `Unknown SPEECH_PROVIDER: "${provider}". Supported: "elevenlabs", "openai".`,
      );
  }

  return ttsInstance;
}

/**
 * Returns the configured STT provider, or null if none is configured.
 */
export async function getSttProvider(): Promise<SttProvider | null> {
  if (sttInstance) {
    return sttInstance;
  }

  const provider = process.env.SPEECH_PROVIDER || detectProvider();
  if (!provider) {
    return null;
  }

  switch (provider) {
    case 'elevenlabs': {
      const { ElevenLabsSttProvider } = await import('./elevenlabs-provider');
      sttInstance = new ElevenLabsSttProvider();
      break;
    }
    case 'openai': {
      const { OpenAiSttProvider } = await import('./openai-provider');
      sttInstance = new OpenAiSttProvider();
      break;
    }
    default:
      throw new Error(
        `Unknown SPEECH_PROVIDER: "${provider}". Supported: "elevenlabs", "openai".`,
      );
  }

  return sttInstance;
}

function detectProvider(): string | null {
  if (process.env.ELEVENLABS_API_KEY) {
    return 'elevenlabs';
  }
  return null;
}
