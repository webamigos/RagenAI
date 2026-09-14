import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  EnvCredentialSource,
  MissingCredentialsError,
} from '../credentials-from-env';

const source = new EnvCredentialSource();
const ORIGINAL = { ...process.env };

beforeEach(() => {
  for (const key of Object.keys(process.env)) {
    if (/^(AZURE|AWS|VERTEX|SCW|LLM)_/.test(key)) {
      delete process.env[key];
    }
  }
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('credentials from the environment', () => {
  it('reads the same variables the proxy already uses', async () => {
    // Deliberate: a deployment running LiteLLM today needs no new secrets to
    // run the gateway, so the two can be compared directly while the flag
    // still chooses between them.
    process.env.AZURE_API_KEY = 'k';
    process.env.AZURE_API_BASE = 'https://example.openai.azure.com';

    await expect(source.forProvider('azure')).resolves.toEqual({
      apiKey: 'k',
      baseUrl: 'https://example.openai.azure.com',
    });
  });

  it('names every variable that is missing, not just the first', async () => {
    // A boot failure that reports one of three missing keys costs three
    // restarts to diagnose.
    await expect(source.forProvider('bedrock')).rejects.toThrow(
      /AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_BEDROCK_REGION/,
    );
  });

  it('throws MissingCredentialsError rather than returning a blank', async () => {
    await expect(source.forProvider('vertex')).rejects.toBeInstanceOf(
      MissingCredentialsError,
    );
  });

  describe('an OpenAI-compatible upstream', () => {
    it('derives its variables from the connection name', async () => {
      // Q6: adding vLLM, Ollama, TGI or a LiteLLM proxy has to be a route plus
      // two environment variables, with no edit to this package.
      process.env.LLM_MY_VLLM_BASE_URL = 'http://vllm:8000/v1';
      process.env.LLM_MY_VLLM_API_KEY = 'secret';

      await expect(
        source.forProvider('openai-compatible', { connection: 'my-vllm' }),
      ).resolves.toEqual({
        baseUrl: 'http://vllm:8000/v1',
        apiKey: 'secret',
      });
    });

    it('still accepts the proxy-era names for scaleway', async () => {
      process.env.SCW_API_BASE = 'https://api.scaleway.ai/v1';
      process.env.SCW_API_KEY = 'scw';

      await expect(
        source.forProvider('openai-compatible', { connection: 'scaleway' }),
      ).resolves.toEqual({
        baseUrl: 'https://api.scaleway.ai/v1',
        apiKey: 'scw',
      });
    });

    it('prefers the new name when both are set', async () => {
      process.env.SCW_API_BASE = 'https://old';
      process.env.LLM_SCALEWAY_BASE_URL = 'https://new';

      const credentials = await source.forProvider('openai-compatible', {
        connection: 'scaleway',
      });

      expect(credentials.baseUrl).toBe('https://new');
    });

    it('needs a base URL, but tolerates an upstream with no key', async () => {
      // A local Ollama has no API key and that is not a misconfiguration.
      process.env.LLM_OLLAMA_BASE_URL = 'http://localhost:11434/v1';

      await expect(
        source.forProvider('openai-compatible', { connection: 'ollama' }),
      ).resolves.toEqual({
        baseUrl: 'http://localhost:11434/v1',
        apiKey: undefined,
      });
    });

    it('refuses a route that names no connection', async () => {
      await expect(source.forProvider('openai-compatible')).rejects.toThrow(
        /connection/,
      );
    });
  });
});
