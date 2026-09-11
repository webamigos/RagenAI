import { describe, expect, it } from 'vitest';

import { resolveLlmProviderChoice } from '../llm-provider';

describe('resolveLlmProviderChoice', () => {
  it('wires OpenAI: env updates plus a matching LiteLLM entry', () => {
    const result = resolveLlmProviderChoice('openai', 'sk-test-key');

    expect(result.envUpdates).toEqual({
      OPENAI_API_KEY: 'sk-test-key',
      DEFAULT_MODEL: 'gpt-4o-mini',
      DEFAULT_MODEL_PROVIDER: 'litellm',
    });
    expect(result.liteLLMEntry).toEqual({
      modelName: 'gpt-4o-mini',
      model: 'openai/gpt-4o-mini',
      apiKeyEnvVar: 'OPENAI_API_KEY',
    });
  });

  it('wires Anthropic: env updates plus a matching LiteLLM entry', () => {
    const result = resolveLlmProviderChoice('anthropic', 'sk-ant-test-key');

    expect(result.envUpdates).toEqual({
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
      DEFAULT_MODEL: 'claude-haiku-4-5-direct',
      DEFAULT_MODEL_PROVIDER: 'litellm',
    });
    expect(result.liteLLMEntry.model).toBe(
      'anthropic/claude-haiku-4-5-20251001',
    );
  });
});
