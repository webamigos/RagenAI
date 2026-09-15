import { describe, expect, it } from 'vitest';

import { LLM_PROVIDERS, resolveLlmProviderChoice } from '../llm-provider';

describe('resolveLlmProviderChoice', () => {
  it('wires OpenAI: chat, rephrasing and embeddings off one key', () => {
    const result = resolveLlmProviderChoice('openai', 'sk-test-key');

    expect(result.envUpdates).toEqual({
      OPENAI_API_KEY: 'sk-test-key',
      DEFAULT_MODEL: 'gpt-4o-mini',
      DEFAULT_MODEL_PROVIDER: 'litellm',
      REPHRASE_MODEL: 'gpt-4o-mini',
      EMBEDDINGS_MODEL: 'text-embedding-3-small',
      VECTOR_SIZE: '1536',
    });
    expect(result.embeddingsConfigured).toBe(true);

    // The route table is what a scaffolded install actually reads, since
    // `LLM_GATEWAY` is `native`. Both models resolve through the one key.
    expect(result.routes).toEqual([
      { modelName: 'gpt-4o-mini', provider: 'openai', model: 'gpt-4o-mini' },
      {
        modelName: 'text-embedding-3-small',
        provider: 'openai',
        model: 'text-embedding-3-small',
      },
    ]);
  });

  it('wires Anthropic, which has no embeddings API', () => {
    const result = resolveLlmProviderChoice('anthropic', 'sk-ant-test-key');

    expect(result.envUpdates).toEqual({
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
      DEFAULT_MODEL: 'claude-haiku-4-5-direct',
      DEFAULT_MODEL_PROVIDER: 'litellm',
      REPHRASE_MODEL: 'claude-haiku-4-5-direct',
    });
    // Leaving EMBEDDINGS_MODEL alone is the point: overriding it with
    // something this key cannot serve would break the knowledge base in a
    // way that only shows up on the first upload.
    expect(result.envUpdates.EMBEDDINGS_MODEL).toBeUndefined();
    expect(result.envUpdates.VECTOR_SIZE).toBeUndefined();
    expect(result.embeddingsConfigured).toBe(false);

    // Routed to the gateway's own `anthropic` provider — the chat model only.
    // The route table has no embedding entry for the same reason the env has
    // no EMBEDDINGS_MODEL: there is nothing to point either at.
    expect(result.routes).toEqual([
      {
        modelName: 'claude-haiku-4-5-direct',
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
      },
    ]);
  });

  it('never leaves REPHRASE_MODEL on the shipped Vertex default', () => {
    // .env.example ships gemini-2.5-flash, and multi-query expansion runs on
    // every turn by default — so an install that configured only a chat
    // model would fail on the *first* step of the RAG chain.
    for (const choice of ['openai', 'anthropic'] as const) {
      const { envUpdates } = resolveLlmProviderChoice(choice, 'key');
      expect(envUpdates.REPHRASE_MODEL).toBe(LLM_PROVIDERS[choice].modelName);
      expect(envUpdates.REPHRASE_MODEL).not.toContain('gemini');
    }
  });

  it('keeps VECTOR_SIZE in step with the embedding model it configures', () => {
    // A mismatch here makes Qdrant reject every upsert, and rag-core's
    // vector contract has no way to notice.
    const openai = LLM_PROVIDERS.openai.embeddings;
    const { envUpdates } = resolveLlmProviderChoice('openai', 'key');

    expect(envUpdates.VECTOR_SIZE).toBe(String(openai?.vectorSize));
    expect(envUpdates.EMBEDDINGS_MODEL).toBe(openai?.modelName);
  });
});

/**
 * The two choices that configure a whole install from one account.
 *
 * Both are here because of what the wizard's own comment says about the
 * shipped route table: it names four providers a new self-hoster has no
 * credentials for. Scaleway is the sharpest case — it *is* in that table, so
 * an install could see the models and reach none of them.
 */
describe('resolveLlmProviderChoice — one key, a working install', () => {
  it('gives OpenRouter chat and embeddings, so the knowledge base works', () => {
    const result = resolveLlmProviderChoice('openrouter', 'sk-or-test');

    expect(result.embeddingsConfigured).toBe(true);
    expect(result.envUpdates.OPENROUTER_API_KEY).toBe('sk-or-test');
    expect(result.routes.map((r) => r.provider)).toEqual([
      'openrouter',
      'openrouter',
    ]);
    // The upstream is namespaced and the id is not: the id is what the
    // application and the catalogue use.
    expect(result.routes[0].model).toContain('/');
    expect(result.routes[0].modelName).not.toContain('/');
  });

  it('matches VECTOR_SIZE to the embedding model, which Qdrant fixes at creation', () => {
    expect(
      resolveLlmProviderChoice('openrouter', 'k').envUpdates.VECTOR_SIZE,
    ).toBe('1536');
    // Scaleway's is the repository default, so this one alone changes nothing.
    expect(
      resolveLlmProviderChoice('scaleway', 'k', 'https://x/v1').envUpdates
        .VECTOR_SIZE,
    ).toBe('3584');
  });

  it('carries the connection on a Scaleway route, without which it reads the wrong credentials', () => {
    const result = resolveLlmProviderChoice(
      'scaleway',
      'scw-key',
      'https://api.scaleway.ai/project/v1',
    );

    expect(result.routes.every((r) => r.connection === 'scaleway')).toBe(true);
    expect(result.routes.every((r) => r.provider === 'openai-compatible')).toBe(
      true,
    );
  });

  it('writes the Scaleway base URL, because its endpoint carries the project id', () => {
    const result = resolveLlmProviderChoice(
      'scaleway',
      'scw-key',
      'https://api.scaleway.ai/project/v1',
    );

    expect(result.envUpdates.SCW_API_BASE).toBe(
      'https://api.scaleway.ai/project/v1',
    );
    expect(result.envUpdates.SCW_API_KEY).toBe('scw-key');
  });

  it('writes no base URL for a provider whose endpoint is a constant', () => {
    const result = resolveLlmProviderChoice('openrouter', 'sk-or-test');

    expect(result.envUpdates.SCW_API_BASE).toBeUndefined();
  });
});
