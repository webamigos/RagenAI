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
    expect(result.liteLLMEntries).toEqual([
      {
        modelName: 'gpt-4o-mini',
        model: 'openai/gpt-4o-mini',
        apiKeyEnvVar: 'OPENAI_API_KEY',
      },
      {
        modelName: 'text-embedding-3-small',
        model: 'openai/text-embedding-3-small',
        apiKeyEnvVar: 'OPENAI_API_KEY',
      },
    ]);
    expect(result.embeddingsConfigured).toBe(true);
  });

  it('wires Anthropic, which has no embeddings API', () => {
    const result = resolveLlmProviderChoice('anthropic', 'sk-ant-test-key');

    expect(result.envUpdates).toEqual({
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
      DEFAULT_MODEL: 'claude-haiku-4-5-direct',
      DEFAULT_MODEL_PROVIDER: 'litellm',
      REPHRASE_MODEL: 'claude-haiku-4-5-direct',
    });
    expect(result.liteLLMEntries).toEqual([
      {
        modelName: 'claude-haiku-4-5-direct',
        model: 'anthropic/claude-haiku-4-5-20251001',
        apiKeyEnvVar: 'ANTHROPIC_API_KEY',
      },
    ]);
    // Leaving EMBEDDINGS_MODEL alone is the point: overriding it with
    // something this key cannot serve would break the knowledge base in a
    // way that only shows up on the first upload.
    expect(result.envUpdates.EMBEDDINGS_MODEL).toBeUndefined();
    expect(result.envUpdates.VECTOR_SIZE).toBeUndefined();
    expect(result.embeddingsConfigured).toBe(false);
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

  it('gives every LiteLLM entry the key env var it was configured with', () => {
    for (const choice of ['openai', 'anthropic'] as const) {
      const { liteLLMEntries } = resolveLlmProviderChoice(choice, 'key');
      for (const entry of liteLLMEntries) {
        expect(entry.apiKeyEnvVar).toBe(LLM_PROVIDERS[choice].apiKeyEnvVar);
      }
    }
  });
});
