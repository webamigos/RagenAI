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

/**
 * Headers are what make "attach any OpenAI-compatible gateway" true rather
 * than nearly true: Portkey routes on `x-portkey-provider`, OpenRouter
 * attributes on `HTTP-Referer`, and a base URL plus a key expresses neither.
 */
describe('extra headers for a connection', () => {
  it('are absent when the variable is unset', async () => {
    delete process.env.LLM_PORTKEY_HEADERS;
    process.env.LLM_PORTKEY_BASE_URL = 'http://localhost:8787/v1';

    const credentials = await new EnvCredentialSource().forProvider(
      'openai-compatible',
      { connection: 'portkey' },
    );

    expect(credentials.headers).toBeUndefined();
  });

  it('are read as a JSON object', async () => {
    process.env.LLM_PORTKEY_BASE_URL = 'http://localhost:8787/v1';
    process.env.LLM_PORTKEY_HEADERS =
      '{"x-portkey-provider":"openai","x-portkey-trace-id":"ragen"}';

    const credentials = await new EnvCredentialSource().forProvider(
      'openai-compatible',
      { connection: 'portkey' },
    );

    expect(credentials.headers).toEqual({
      'x-portkey-provider': 'openai',
      'x-portkey-trace-id': 'ragen',
    });
  });

  it('derives the variable name from the connection', async () => {
    process.env.LLM_MY_GATEWAY_BASE_URL = 'http://localhost:9000/v1';
    process.env.LLM_MY_GATEWAY_HEADERS = '{"x-tenant":"acme"}';

    const credentials = await new EnvCredentialSource().forProvider(
      'openai-compatible',
      { connection: 'my-gateway' },
    );

    expect(credentials.headers).toEqual({ 'x-tenant': 'acme' });
  });

  /**
   * Ignoring a malformed value would route traffic to the wrong upstream, or
   * bill it to the wrong account, with nothing to read in either case.
   */
  it('throws on content that is not a JSON object', async () => {
    process.env.LLM_PORTKEY_BASE_URL = 'http://localhost:8787/v1';

    process.env.LLM_PORTKEY_HEADERS = 'x-portkey-provider=openai';
    await expect(
      new EnvCredentialSource().forProvider('openai-compatible', {
        connection: 'portkey',
      }),
    ).rejects.toThrow(/must be a JSON object/);

    process.env.LLM_PORTKEY_HEADERS = '["a","b"]';
    await expect(
      new EnvCredentialSource().forProvider('openai-compatible', {
        connection: 'portkey',
      }),
    ).rejects.toThrow(/must be a JSON object/);
  });

  it('throws when a header value is not a string', async () => {
    process.env.LLM_PORTKEY_BASE_URL = 'http://localhost:8787/v1';
    process.env.LLM_PORTKEY_HEADERS = '{"x-retries":3}';

    await expect(
      new EnvCredentialSource().forProvider('openai-compatible', {
        connection: 'portkey',
      }),
    ).rejects.toThrow(/"x-retries" must be a string/);
  });
});

/**
 * The third Azure variable. Reading two of a provider's three and ignoring the
 * rest is what `VERTEX_CREDENTIALS` already cost — twice is a pattern.
 */
describe('Azure api-version', () => {
  it('is passed through when the deployment pins one', async () => {
    process.env.AZURE_API_KEY = 'k';
    process.env.AZURE_API_BASE = 'https://example.openai.azure.com';
    process.env.AZURE_API_VERSION = '2026-05-01-preview';

    const credentials = await new EnvCredentialSource().forProvider('azure');

    expect(credentials.apiVersion).toBe('2026-05-01-preview');
  });

  it('is left unset when the deployment does not, so the provider defaults', async () => {
    process.env.AZURE_API_KEY = 'k';
    process.env.AZURE_API_BASE = 'https://example.openai.azure.com';
    delete process.env.AZURE_API_VERSION;

    const credentials = await new EnvCredentialSource().forProvider('azure');

    expect(credentials.apiVersion).toBeUndefined();
  });
});
