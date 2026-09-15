import { describe, expect, it, vi } from 'vitest';

import { EMBEDDING_PROVIDER_FACTORIES } from '../embedding-providers';
import { PROVIDER_FACTORIES } from '../providers';
import {
  EmbeddingsUnsupportedError,
  LlmGateway,
  UnknownModelError,
} from '../resolve-model';
import { loadRouteTable } from '../route-table';
import type {
  CredentialSource,
  EmbeddingProviderFactory,
  ProviderFactory,
} from '../types';

const routes = loadRouteTable({
  version: 1,
  routes: {
    'qwen3-embedding-8b': {
      provider: 'openai-compatible',
      model: 'qwen3-embedding-8b',
      connection: 'scaleway',
    },
    'gpt-5.4': { provider: 'azure', model: 'gpt-5.4' },
    'claude-haiku-4-5-direct': {
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
    },
  },
});

const credentials: CredentialSource = {
  forProvider: vi.fn(async () => ({ apiKey: 'k', baseUrl: 'https://u' })),
};

describe('resolving an embedding model', () => {
  it('routes through the embedding factory the table names', async () => {
    const compatible = vi.fn(() => ({
      id: 'embedding-model',
    })) as unknown as EmbeddingProviderFactory;

    const gateway = new LlmGateway({
      routes,
      credentials,
      embeddingFactories: { 'openai-compatible': compatible },
    });

    await gateway.resolveEmbeddingModel('qwen3-embedding-8b');

    expect(compatible).toHaveBeenCalledWith(
      {
        provider: 'openai-compatible',
        model: 'qwen3-embedding-8b',
        connection: 'scaleway',
      },
      { apiKey: 'k', baseUrl: 'https://u' },
    );
  });

  it('passes the upstream model name, not the id it is filed under', async () => {
    const table = loadRouteTable({
      version: 1,
      routes: {
        'bge-multilingual-gemma2': {
          provider: 'openai-compatible',
          connection: 'scaleway',
          model: 'bge-multilingual-gemma2-v1',
        },
      },
    });
    const compatible = vi.fn(() => ({})) as unknown as EmbeddingProviderFactory;

    const gateway = new LlmGateway({
      routes: table,
      credentials,
      embeddingFactories: { 'openai-compatible': compatible },
    });
    await gateway.resolveEmbeddingModel('bge-multilingual-gemma2');

    expect(compatible).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'bge-multilingual-gemma2-v1' }),
      expect.anything(),
    );
  });

  it('throws UnknownModelError for a model the table does not route', async () => {
    const gateway = new LlmGateway({ routes, credentials });

    await expect(
      gateway.resolveEmbeddingModel('text-embedding-3-small'),
    ).rejects.toThrow(UnknownModelError);
  });

  /**
   * The chat and embedding tables are separate objects over the same routes.
   * A route resolved as an embedding must not quietly produce a chat model —
   * that would typecheck at the seam and fail inside `embedMany`, which is the
   * hardest place to read it from.
   */
  it('does not reach the chat factory for the same route', async () => {
    const chat = vi.fn(() => ({})) as unknown as ProviderFactory;
    const embedding = vi.fn(() => ({})) as unknown as EmbeddingProviderFactory;

    const gateway = new LlmGateway({
      routes,
      credentials,
      factories: { azure: chat },
      embeddingFactories: { azure: embedding },
    });

    await gateway.resolveEmbeddingModel('gpt-5.4');

    expect(embedding).toHaveBeenCalledOnce();
    expect(chat).not.toHaveBeenCalled();
  });

  /**
   * Providers that serve chat and no embeddings, because the upstream has no
   * embeddings API at all. Listed rather than inferred so that adding a
   * provider forces the decision: anything missing from the embedding table
   * and absent here fails this test.
   */
  const SERVE_NO_EMBEDDINGS = ['anthropic'];

  it('has an embedding factory for every chat provider that serves embeddings', () => {
    const chat = Object.keys(PROVIDER_FACTORIES).sort();

    expect(Object.keys(EMBEDDING_PROVIDER_FACTORIES).sort()).toEqual(
      chat.filter((provider) => !SERVE_NO_EMBEDDINGS.includes(provider)),
    );
  });

  /**
   * The model id is routed, so `UnknownModelError` would send an operator to
   * the route table to add an entry that is already there. What is wrong is
   * the entry's provider, and the error says so.
   */
  it('names the provider when a route points at one with no embeddings', async () => {
    const gateway = new LlmGateway({ routes, credentials });

    await expect(
      gateway.resolveEmbeddingModel('claude-haiku-4-5-direct'),
    ).rejects.toThrow(EmbeddingsUnsupportedError);
    await expect(
      gateway.resolveEmbeddingModel('claude-haiku-4-5-direct'),
    ).rejects.toThrow(/anthropic/);
  });
});
