import { describe, expect, it, vi } from 'vitest';

import { probeModels } from '../probe';
import { loadRouteTable } from '../route-table';
import type { CredentialSource } from '../types';

const routes = loadRouteTable({
  version: 1,
  routes: {
    'local-chat': {
      provider: 'openai-compatible',
      connection: 'ollama',
      model: 'bielik:11b',
    },
    'local-embed': {
      provider: 'openai-compatible',
      connection: 'ollama',
      model: 'bge-m3',
    },
    'local-small': {
      provider: 'openai-compatible',
      connection: 'ollama',
      model: 'qwen2.5:7b-instruct',
    },
    'other-server': {
      provider: 'openai-compatible',
      connection: 'vllm',
      model: 'llama',
    },
    'gpt-5.4': { provider: 'azure', model: 'gpt-5.4' },
  },
});

const credentials: CredentialSource = {
  forProvider: vi.fn(async (_provider, options) => ({
    baseUrl: `http://${options?.connection}:11434/v1/`,
    apiKey: options?.connection === 'vllm' ? 'secret' : undefined,
  })),
};

const listing = (...ids: string[]) =>
  new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), {
    status: 200,
  });

describe('probeModels', () => {
  it('says which models a local server lists, with one request per server', async () => {
    const fetch = vi.fn(async () => listing('bielik:11b', 'bge-m3:latest'));

    const result = await probeModels(
      routes,
      credentials,
      ['local-chat', 'local-embed', 'local-small'],
      { fetch },
    );

    expect(result).toEqual([
      expect.objectContaining({ modelId: 'local-chat', state: 'ok' }),
      // Pulled without a tag, listed as `:latest`.
      expect.objectContaining({ modelId: 'local-embed', state: 'ok' }),
      // Never pulled: what an operator fixes with `ollama pull`.
      {
        modelId: 'local-small',
        state: 'missing',
        connection: 'ollama',
        upstreamModel: 'qwen2.5:7b-instruct',
      },
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'http://ollama:11434/v1/models',
      expect.anything(),
    );
  });

  it('sends the connection’s key when it has one', async () => {
    const fetch = vi.fn(async () => listing('llama'));

    await probeModels(routes, credentials, ['other-server'], { fetch });

    expect(fetch).toHaveBeenCalledWith(
      'http://vllm:11434/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
      }),
    );
  });

  it.each([
    [
      'a refused connection',
      () => Promise.reject(new TypeError('fetch failed')),
    ],
    ['an error status', async () => new Response('nope', { status: 502 })],
    ['a body that is not a model list', async () => new Response('{"x":1}')],
    [
      // Not "missing": the response never described the server's models.
      'a list with an entry that has no id',
      async () =>
        new Response(JSON.stringify({ data: [{ id: 'bielik:11b' }, {}] })),
    ],
  ])('reports the server unreachable on %s', async (_case, impl) => {
    const fetch = vi.fn(impl as typeof globalThis.fetch);

    const [probe] = await probeModels(routes, credentials, ['local-chat'], {
      fetch,
    });

    expect(probe?.state).toBe('unreachable');
  });

  it('does not probe a cloud route, which has no free call to make', async () => {
    const fetch = vi.fn();

    const result = await probeModels(
      routes,
      credentials,
      ['gpt-5.4', 'no-route'],
      { fetch },
    );

    expect(result.map((probe) => probe.state)).toEqual([
      'not-probed',
      'not-probed',
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports unreachable, not a throw, when the connection has no base URL', async () => {
    const missing: CredentialSource = {
      forProvider: vi.fn(async () => {
        throw new Error('no credentials for openai-compatible');
      }),
    };

    const [probe] = await probeModels(routes, missing, ['local-chat'], {
      fetch: vi.fn(),
    });

    expect(probe?.state).toBe('unreachable');
  });
});
