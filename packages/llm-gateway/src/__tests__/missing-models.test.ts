import { describe, expect, it, vi } from 'vitest';

import { LlmGateway } from '../resolve-model';
import { loadRouteTable } from '../route-table';
import type { CredentialSource } from '../types';

const routes = loadRouteTable({
  version: 1,
  routes: {
    pulled: {
      provider: 'openai-compatible',
      connection: 'ollama',
      model: 'bielik:11b',
    },
    'not-pulled': {
      provider: 'openai-compatible',
      connection: 'ollama',
      model: 'qwen2.5:7b',
    },
    'down-server': {
      provider: 'openai-compatible',
      connection: 'vllm',
      model: 'llama',
    },
    'gpt-5.4': { provider: 'azure', model: 'gpt-5.4' },
  },
});

const credentials: CredentialSource = {
  forProvider: vi.fn(async (_provider, options) => ({
    baseUrl: `http://${options?.connection}/v1`,
  })),
};

const listing = (...ids: string[]) =>
  new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }));

function fetchFor() {
  return vi.fn(async (url: string) =>
    url.startsWith('http://ollama')
      ? listing('bielik:11b')
      : Promise.reject(new TypeError('fetch failed')),
  ) as unknown as typeof globalThis.fetch & ReturnType<typeof vi.fn>;
}

describe('LlmGateway.missingModels', () => {
  it('names only models a server that answered does not have', async () => {
    const gateway = new LlmGateway({ routes, credentials });

    const missing = await gateway.missingModels(
      ['pulled', 'not-pulled', 'down-server', 'gpt-5.4'],
      { fetch: fetchFor() },
    );

    // A server that is down is not "missing" its models — hiding them would
    // empty the picker for a blip — and a cloud route is never probed.
    expect([...missing]).toEqual(['not-pulled']);
  });

  it('asks again only after the cache window', async () => {
    const gateway = new LlmGateway({ routes, credentials });
    const fetch = fetchFor();
    let now = 1_000;

    await gateway.missingModels(['pulled'], { fetch, now: () => now });
    now += 10_000;
    await gateway.missingModels(['pulled'], { fetch, now: () => now });
    expect(fetch).toHaveBeenCalledTimes(1);

    now += 30_000;
    await gateway.missingModels(['pulled'], { fetch, now: () => now });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
