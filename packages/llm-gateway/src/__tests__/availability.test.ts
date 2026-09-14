import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { providerIsConfigured } from '../credentials-from-env';
import { LlmGateway } from '../resolve-model';
import { loadRouteTable } from '../route-table';
import type { CredentialSource, ProviderFactory } from '../types';

const routes = loadRouteTable({
  version: 1,
  routes: {
    'gpt-4.1': { provider: 'openai', model: 'gpt-4.1' },
    'gpt-5.4': { provider: 'azure', model: 'gpt-5.4' },
    'claude-opus-5': {
      provider: 'bedrock',
      model: 'eu.anthropic.claude-opus-5',
    },
    'gpt-oss-120b': {
      provider: 'openai-compatible',
      model: 'gpt-oss-120b',
      connection: 'scaleway',
    },
  },
});

const credentials: CredentialSource = {
  forProvider: vi.fn(async () => ({ apiKey: 'k' })),
};
const factories = {
  openai: vi.fn(() => ({})) as unknown as ProviderFactory,
  azure: vi.fn(() => ({})) as unknown as ProviderFactory,
};

const ORIGINAL = { ...process.env };

beforeEach(() => {
  for (const key of Object.keys(process.env)) {
    if (/^(OPENAI|AZURE|AWS|VERTEX|SCW|LLM)_/.test(key)) {
      delete process.env[key];
    }
  }
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

/**
 * The shipped route table describes Ragen's own installation. Most deployments
 * are not that, and the commonest one by far is "I have an OpenAI key and
 * nothing else" — which used to mean a model picker full of models that failed
 * on the first click.
 */
describe('what a deployment can actually serve', () => {
  it('offers only the models it has credentials for', () => {
    process.env.OPENAI_API_KEY = 'sk-test';

    const gateway = new LlmGateway({ routes, credentials, factories });

    expect(gateway.availableModels()).toEqual(['gpt-4.1']);
  });

  it('grows as providers are configured', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.AZURE_API_KEY = 'k';
    process.env.AZURE_API_BASE = 'https://example.openai.azure.com';

    const gateway = new LlmGateway({ routes, credentials, factories });

    expect(gateway.availableModels()).toEqual(['gpt-4.1', 'gpt-5.4']);
  });

  it('says no for a routed model whose provider is not configured', () => {
    // Routed but unusable is the case that matters: answering on the table
    // alone put these in the picker.
    process.env.OPENAI_API_KEY = 'sk-test';

    const gateway = new LlmGateway({ routes, credentials, factories });

    expect(gateway.serves('gpt-4.1')).toBe(true);
    expect(gateway.serves('claude-opus-5')).toBe(false);
  });

  it('serves nothing when nothing is configured', () => {
    const gateway = new LlmGateway({ routes, credentials, factories });

    expect(gateway.availableModels()).toEqual([]);
  });

  it('can be overridden, which restores the table-only answer', () => {
    const gateway = new LlmGateway({
      routes,
      credentials,
      factories,
      isConfigured: () => true,
    });

    expect(gateway.availableModels()).toHaveLength(4);
  });
});

describe('providerIsConfigured', () => {
  it('needs only OPENAI_API_KEY for the openai family', () => {
    // The point of keeping `openai` separate from `openai-compatible`: one
    // variable, no base URL, no connection name.
    process.env.OPENAI_API_KEY = 'sk-test';

    expect(providerIsConfigured('openai')).toBe(true);
  });

  it('needs every variable for a provider that takes several', () => {
    process.env.AZURE_API_KEY = 'k';

    expect(providerIsConfigured('azure')).toBe(false);
  });

  it('is false for an openai-compatible route naming no connection', () => {
    expect(providerIsConfigured('openai-compatible')).toBe(false);
  });

  it('follows the connection name to its own variables', () => {
    process.env.LLM_OLLAMA_BASE_URL = 'http://localhost:11434/v1';

    expect(providerIsConfigured('openai-compatible', 'ollama')).toBe(true);
    expect(providerIsConfigured('openai-compatible', 'vllm')).toBe(false);
  });
});
