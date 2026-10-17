import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { routeFileJsonSchema } from '../json-schema';
import { LlmGateway } from '../resolve-model';
import { InvalidRouteTableError, loadRouteTable } from '../route-table';
import type { CredentialSource } from '../types';

const credentials: CredentialSource = {
  forProvider: vi.fn(async () => ({ apiKey: 'k' })),
};

/** Ollama is "configured" when its base URL is set; here, only it is. */
const onlyOllama = (_provider: string, connection?: string) =>
  connection === 'ollama';

const routes = loadRouteTable({
  version: 1,
  routes: {
    'local-chat': {
      provider: 'openai-compatible',
      connection: 'ollama',
      model: 'bielik:11b',
      display: 'Bielik 11B',
      capabilities: ['chat'],
    },
    'local-embed': {
      provider: 'openai-compatible',
      connection: 'ollama',
      model: 'bge-m3',
      display: 'BGE-M3',
    },
    // A cloud id aliased to a local model: described, so it is shown under the
    // local name rather than the catalogue's cloud one.
    'gemini-2.5-flash': {
      provider: 'openai-compatible',
      connection: 'ollama',
      model: 'qwen2.5:7b-instruct',
      display: 'Qwen 2.5 7B',
      capabilities: ['chat', 'vision'],
    },
    // Undescribed: the catalogue speaks for it, as before.
    'gpt-oss-120b': {
      provider: 'openai-compatible',
      connection: 'ollama',
      model: 'bielik:11b',
    },
    // Described but not served: its connection has no credentials.
    'cloud-described': {
      provider: 'openai-compatible',
      connection: 'scaleway',
      model: 'x',
      display: 'Not here',
      capabilities: ['chat'],
    },
  },
});

describe('a route that describes itself', () => {
  const gateway = new LlmGateway({
    routes,
    credentials,
    isConfigured: onlyOllama,
  });

  it('is listed with its name and capabilities', () => {
    expect(gateway.describedModels()).toEqual([
      {
        id: 'gemini-2.5-flash',
        displayName: 'Qwen 2.5 7B',
        capabilities: ['chat', 'vision'],
      },
      { id: 'local-chat', displayName: 'Bielik 11B', capabilities: ['chat'] },
      // No `capabilities` means none: an embedding route with a name is not a
      // chat model, and the consumer must not have to guess.
      { id: 'local-embed', displayName: 'BGE-M3', capabilities: [] },
    ]);
  });

  it('is not listed when its upstream is not configured', () => {
    // Same rule as availableModels: offering it would fail on the first click.
    const ids = gateway.describedModels().map((model) => model.id);
    expect(ids).not.toContain('cloud-described');
  });

  it('is not listed without `display`, so the catalogue keeps speaking for it', () => {
    const ids = gateway.describedModels().map((model) => model.id);
    expect(ids).not.toContain('gpt-oss-120b');
    expect(gateway.availableModels()).toContain('gpt-oss-120b');
  });
});

describe('the description fields', () => {
  const table = (route: Record<string, unknown>) => ({
    version: 1,
    routes: {
      m: {
        provider: 'openai-compatible',
        connection: 'ollama',
        model: 'm',
        ...route,
      },
    },
  });

  it('rejects an empty display name', () => {
    expect(() => loadRouteTable(table({ display: '  ' }))).toThrow(
      InvalidRouteTableError,
    );
  });

  it('rejects a capability it does not know', () => {
    expect(() =>
      loadRouteTable(table({ display: 'M', capabilities: ['telepathy'] })),
    ).toThrow(InvalidRouteTableError);
  });
});

describe('routes.schema.json', () => {
  it('is what the zod schema generates', () => {
    // The file's own comment says it is generated and guarded. This is the
    // guard: an editor that accepts a field the loader rejects, or the other
    // way round, is worse than no schema.
    const onDisk = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../../../infra/llm-gateway/routes.schema.json'),
        'utf8',
      ),
    );
    expect(onDisk).toEqual(routeFileJsonSchema());
  });
});
