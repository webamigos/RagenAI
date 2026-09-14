import { describe, expect, it, vi } from 'vitest';

import { EnvCredentialSource } from '../credentials-from-env';
import { LlmGateway, UnknownModelError } from '../resolve-model';
import { loadRouteTable } from '../route-table';
import type { CredentialSource, ProviderFactory } from '../types';

const routes = loadRouteTable({
  version: 1,
  routes: {
    'gpt-5.4': { provider: 'azure', model: 'gpt-5.4' },
    'gpt-oss-120b': {
      provider: 'openai-compatible',
      model: 'gpt-oss-120b',
      connection: 'scaleway',
    },
  },
});

/** Records what each factory was handed, without reaching a provider. */
function spyFactories() {
  const azure = vi.fn(() => ({
    id: 'azure-model',
  })) as unknown as ProviderFactory;
  const compatible = vi.fn(() => ({
    id: 'compatible-model',
  })) as unknown as ProviderFactory;
  return { azure, 'openai-compatible': compatible };
}

const credentials: CredentialSource = {
  forProvider: vi.fn(async () => ({ apiKey: 'k', baseUrl: 'https://u' })),
};

describe('resolving a model', () => {
  it('routes through the provider the table names', async () => {
    const factories = spyFactories();
    const gateway = new LlmGateway({ routes, credentials, factories });

    await gateway.resolveModel('gpt-5.4');

    expect(factories.azure).toHaveBeenCalledWith(
      { provider: 'azure', model: 'gpt-5.4' },
      { apiKey: 'k', baseUrl: 'https://u' },
    );
    expect(factories['openai-compatible']).not.toHaveBeenCalled();
  });

  it('asks for the connection the route names', async () => {
    const factories = spyFactories();
    const source: CredentialSource = {
      forProvider: vi.fn(async () => ({ baseUrl: 'https://u' })),
    };
    const gateway = new LlmGateway({ routes, credentials: source, factories });

    await gateway.resolveModel('gpt-oss-120b');

    expect(source.forProvider).toHaveBeenCalledWith('openai-compatible', {
      connection: 'scaleway',
      scope: undefined,
    });
  });

  it('threads the scope through to the credential source', async () => {
    // Unused by the env source, and that is the point: per-org and per-team
    // keys from ragen-token-vault arrive as a second CredentialSource, not as
    // a change to this call.
    const factories = spyFactories();
    const source: CredentialSource = {
      forProvider: vi.fn(async () => ({ apiKey: 'k' })),
    };
    const gateway = new LlmGateway({ routes, credentials: source, factories });

    await gateway.resolveModel('gpt-5.4', {
      scope: { organizationId: 'org-1' },
    });

    expect(source.forProvider).toHaveBeenCalledWith('azure', {
      connection: undefined,
      scope: { organizationId: 'org-1' },
    });
  });

  it('refuses a model it has no route for', async () => {
    const gateway = new LlmGateway({
      routes,
      credentials,
      factories: spyFactories(),
    });

    await expect(gateway.resolveModel('claude-9')).rejects.toBeInstanceOf(
      UnknownModelError,
    );
  });

  it('answers whether it serves a model without building one', () => {
    // `isConfigured` is pinned so this stays a question about the route table.
    // Whether the deployment holds the credentials is a second condition, and
    // it has its own tests in availability.test.ts.
    const factories = spyFactories();
    const gateway = new LlmGateway({
      routes,
      credentials,
      factories,
      isConfigured: () => true,
    });

    expect(gateway.serves('gpt-5.4')).toBe(true);
    expect(gateway.serves('claude-9')).toBe(false);
    expect(factories.azure).not.toHaveBeenCalled();
  });

  it('surfaces a missing credential rather than building a broken model', async () => {
    // The real env source, with nothing set: the failure has to be about the
    // missing variable, not a provider erroring later on an empty key.
    const factories = spyFactories();
    const gateway = new LlmGateway({
      routes,
      credentials: new EnvCredentialSource(),
      factories,
    });
    const previous = process.env.AZURE_API_KEY;
    delete process.env.AZURE_API_KEY;

    await expect(gateway.resolveModel('gpt-5.4')).rejects.toThrow(
      /AZURE_API_KEY/,
    );
    expect(factories.azure).not.toHaveBeenCalled();

    if (previous !== undefined) {
      process.env.AZURE_API_KEY = previous;
    }
  });
});
