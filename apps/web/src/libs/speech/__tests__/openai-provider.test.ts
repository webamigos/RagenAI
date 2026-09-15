import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OpenAiSttProvider, OpenAiTtsProvider } from '../openai-provider';

/**
 * The regression this file exists for: the provider used to prefer
 * `LITELLM_PROXY_URL` over OpenAI's own endpoint, and the shipped proxy config
 * registers no `/v1/audio/*` route — so every deployment that set the proxy URL
 * (all of them; the variable is required) and chose `SPEECH_PROVIDER=openai`
 * got a 404 per synthesis and per transcription, with the working fallback
 * unreachable for exactly the deployments that needed it.
 *
 * So the assertions below are mostly about *which URL is called*, which is the
 * thing nothing checked.
 */

const saved = { ...process.env };

function mockFetch(body: BodyInit | object, ok = true) {
  const fetchMock = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 404,
    arrayBuffer: async () => new TextEncoder().encode('audio').buffer,
    json: async () => body as object,
    text: async () => 'upstream said no',
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const calledUrl = (fetchMock: ReturnType<typeof mockFetch>) =>
  (fetchMock.mock.calls[0] as unknown as [string])[0];

const calledInit = (fetchMock: ReturnType<typeof mockFetch>) =>
  (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SPEECH_BASE_URL;
  delete process.env.SPEECH_API_KEY;
  delete process.env.LITELLM_PROXY_URL;
  delete process.env.LITELLM_MASTER_KEY;
  process.env.OPENAI_API_KEY = 'sk-openai';
});

afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
});

describe('where the audio calls go', () => {
  it('reaches OpenAI when nothing points elsewhere', async () => {
    const fetchMock = mockFetch({});

    await new OpenAiTtsProvider().synthesize('hello', 'alloy');

    expect(calledUrl(fetchMock)).toBe('https://api.openai.com/v1/audio/speech');
  });

  /**
   * The actual bug. A proxy URL in the environment must no longer capture
   * speech — it never served it.
   */
  it('ignores LITELLM_PROXY_URL entirely', async () => {
    process.env.LITELLM_PROXY_URL = 'http://localhost:4000';
    process.env.LITELLM_MASTER_KEY = 'sk-litellm';
    const fetchMock = mockFetch({});

    await new OpenAiTtsProvider().synthesize('hello', 'alloy');

    expect(calledUrl(fetchMock)).toBe('https://api.openai.com/v1/audio/speech');
    expect(calledInit(fetchMock).headers).toMatchObject({
      Authorization: 'Bearer sk-openai',
    });
  });

  it('honours SPEECH_BASE_URL, which is how a proxy is attached on purpose', async () => {
    process.env.SPEECH_BASE_URL = 'http://localhost:8000';
    const fetchMock = mockFetch({});

    await new OpenAiTtsProvider().synthesize('hello', 'alloy');

    expect(calledUrl(fetchMock)).toBe('http://localhost:8000/v1/audio/speech');
  });

  it('does not double the slash when the base URL has a trailing one', async () => {
    process.env.SPEECH_BASE_URL = 'http://localhost:8000/';
    const fetchMock = mockFetch({});

    await new OpenAiTtsProvider().synthesize('hello', 'alloy');

    expect(calledUrl(fetchMock)).toBe('http://localhost:8000/v1/audio/speech');
  });

  it('sends transcriptions to the same base', async () => {
    process.env.SPEECH_BASE_URL = 'http://localhost:8000';
    const fetchMock = mockFetch({ text: 'transcript' });

    await new OpenAiSttProvider().transcribe(Buffer.from('x'), 'audio/webm');

    expect(calledUrl(fetchMock)).toBe(
      'http://localhost:8000/v1/audio/transcriptions',
    );
  });

  /**
   * Read per call, not in the constructor: `index.ts` caches the provider for
   * the life of the process, so a constructor read would pin whatever the
   * environment held at first use.
   */
  it('picks up a base URL changed after the provider was constructed', async () => {
    const provider = new OpenAiTtsProvider();
    process.env.SPEECH_BASE_URL = 'http://elsewhere:9000';
    const fetchMock = mockFetch({});

    await provider.synthesize('hello', 'alloy');

    expect(calledUrl(fetchMock)).toBe('http://elsewhere:9000/v1/audio/speech');
  });
});

describe('which key authenticates', () => {
  it('prefers SPEECH_API_KEY', async () => {
    process.env.SPEECH_API_KEY = 'sk-speech';
    const fetchMock = mockFetch({});

    await new OpenAiTtsProvider().synthesize('hello', 'alloy');

    expect(calledInit(fetchMock).headers).toMatchObject({
      Authorization: 'Bearer sk-speech',
    });
  });

  it('falls back to OPENAI_API_KEY, so a chat key is enough', async () => {
    const fetchMock = mockFetch({});

    await new OpenAiTtsProvider().synthesize('hello', 'alloy');

    expect(calledInit(fetchMock).headers).toMatchObject({
      Authorization: 'Bearer sk-openai',
    });
  });

  /**
   * The previous code defaulted to `''` and sent `Authorization: Bearer `,
   * turning a missing key into an upstream 401 that reads like a wrong one.
   */
  it('refuses to call with no key, naming both variables', async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchMock = mockFetch({});

    await expect(
      new OpenAiTtsProvider().synthesize('hello', 'alloy'),
    ).rejects.toThrow(/SPEECH_API_KEY.*OPENAI_API_KEY/s);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses transcription with no key too', async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchMock = mockFetch({ text: '' });

    await expect(
      new OpenAiSttProvider().transcribe(Buffer.from('x'), 'audio/webm'),
    ).rejects.toThrow(/SPEECH_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('the request bodies are unchanged', () => {
  it('sends the configured TTS model and the requested voice', async () => {
    process.env.TTS_MODEL = 'tts-1-hd';
    const fetchMock = mockFetch({});

    await new OpenAiTtsProvider().synthesize('hello', 'nova');

    expect(JSON.parse(calledInit(fetchMock).body as string)).toEqual({
      model: 'tts-1-hd',
      input: 'hello',
      voice: 'nova',
      response_format: 'mp3',
    });
  });

  it('defaults the models when unset', async () => {
    delete process.env.TTS_MODEL;
    const fetchMock = mockFetch({});

    await new OpenAiTtsProvider().synthesize('hello', 'alloy');

    expect(JSON.parse(calledInit(fetchMock).body as string)).toMatchObject({
      model: 'tts-1',
    });
  });

  it('returns the transcript text', async () => {
    mockFetch({ text: 'spoken words' });

    const text = await new OpenAiSttProvider().transcribe(
      Buffer.from('x'),
      'audio/webm',
    );

    expect(text).toBe('spoken words');
  });

  it('surfaces an upstream failure rather than returning empty audio', async () => {
    mockFetch({}, false);

    await expect(
      new OpenAiTtsProvider().synthesize('hello', 'alloy'),
    ).rejects.toThrow(/OpenAI TTS error \(404\)/);
  });
});
