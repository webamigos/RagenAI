import type { LiteLLMModelEntry } from './litellm-config';

/**
 * The `infra/litellm/config.yaml` shipped in the repo only wires Azure
 * OpenAI, AWS Bedrock, Google Vertex and Scaleway — none of which a new
 * self-hoster can use in five minutes. These two entries let the wizard
 * paste a plain OpenAI or Anthropic key and get a working model instead.
 */
export type LlmProviderChoice = 'openai' | 'anthropic';

export interface LlmProviderConfig {
  label: string;
  apiKeyEnvVar: string;
  modelName: string;
  litellmModel: string;
}

export const LLM_PROVIDERS: Record<LlmProviderChoice, LlmProviderConfig> = {
  openai: {
    label: 'OpenAI',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    modelName: 'gpt-4o-mini',
    litellmModel: 'openai/gpt-4o-mini',
  },
  anthropic: {
    label: 'Anthropic',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    modelName: 'claude-haiku-4-5',
    litellmModel: 'anthropic/claude-haiku-4-5-20251001',
  },
};

export interface LlmProviderChoiceResult {
  envUpdates: Record<string, string>;
  liteLLMEntry: LiteLLMModelEntry;
}

export function resolveLlmProviderChoice(
  choice: LlmProviderChoice,
  apiKey: string,
): LlmProviderChoiceResult {
  const config = LLM_PROVIDERS[choice];

  return {
    envUpdates: {
      [config.apiKeyEnvVar]: apiKey,
      DEFAULT_MODEL: config.modelName,
      DEFAULT_MODEL_PROVIDER: 'litellm',
    },
    liteLLMEntry: {
      modelName: config.modelName,
      model: config.litellmModel,
      apiKeyEnvVar: config.apiKeyEnvVar,
    },
  };
}
