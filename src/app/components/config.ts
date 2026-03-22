export const LOCAL_STORAGE_THREAD_KEY = 'threadId';
export const SESSION_STORAGE_TEMP_MESSAGE_KEY = 'tempMessage';

export type ModelProvider = 'litellm';

/** Visual grouping for the model selector UI (maps to the original provider behind the model) */
export type ModelOrigin = 'openai' | 'google' | 'anthropic';

export type AvailableModel = {
  value: string;
  label: string;
  provider: ModelProvider;
  origin: ModelOrigin;
  reasoning?: boolean;
};

// Static fallback list — the real model list is fetched dynamically from LiteLLM /models endpoint.
// These are used when LiteLLM is unreachable and must match model_name values in litellm/config.yaml.
export const availableModels: AvailableModel[] = [
  // Azure OpenAI — GPT models
  {
    value: 'gpt-5.4-pro',
    label: 'GPT-5.4 Pro',
    provider: 'litellm',
    origin: 'openai',
    reasoning: true,
  },
  {
    value: 'gpt-5.4',
    label: 'GPT-5.4',
    provider: 'litellm',
    origin: 'openai',
  },
  {
    value: 'gpt-5.4-mini',
    label: 'GPT-5.4 Mini',
    provider: 'litellm',
    origin: 'openai',
  },
  {
    value: 'gpt-5.4-nano',
    label: 'GPT-5.4 Nano',
    provider: 'litellm',
    origin: 'openai',
  },
  {
    value: 'gpt-5.3-chat',
    label: 'GPT-5.3 Chat',
    provider: 'litellm',
    origin: 'openai',
  },

  // AWS Bedrock — Claude models
  {
    value: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    provider: 'litellm',
    origin: 'anthropic',
    reasoning: true,
  },
  {
    value: 'claude-opus-4-6',
    label: 'Claude Opus 4.6',
    provider: 'litellm',
    origin: 'anthropic',
    reasoning: true,
  },
  {
    value: 'claude-sonnet-4-5',
    label: 'Claude Sonnet 4.5',
    provider: 'litellm',
    origin: 'anthropic',
    reasoning: true,
  },
  {
    value: 'claude-opus-4-5',
    label: 'Claude Opus 4.5',
    provider: 'litellm',
    origin: 'anthropic',
    reasoning: true,
  },
  {
    value: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    provider: 'litellm',
    origin: 'anthropic',
  },
  {
    value: 'claude-sonnet-4',
    label: 'Claude Sonnet 4',
    provider: 'litellm',
    origin: 'anthropic',
    reasoning: true,
  },

  // Google Vertex AI — Gemini models (preview)
  {
    value: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro Preview',
    provider: 'litellm',
    origin: 'google',
    reasoning: true,
  },
  {
    value: 'gemini-3.1-flash-lite-preview',
    label: 'Gemini 3.1 Flash Lite Preview',
    provider: 'litellm',
    origin: 'google',
  },
  {
    value: 'gemini-3-pro-preview',
    label: 'Gemini 3 Pro Preview',
    provider: 'litellm',
    origin: 'google',
    reasoning: true,
  },
  {
    value: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash Preview',
    provider: 'litellm',
    origin: 'google',
  },
  {
    value: 'gemini-2.5-flash-lite-preview',
    label: 'Gemini 2.5 Flash Lite Preview',
    provider: 'litellm',
    origin: 'google',
  },
  {
    value: 'gemini-2.5-flash-preview',
    label: 'Gemini 2.5 Flash Preview',
    provider: 'litellm',
    origin: 'google',
  },
  // Google Vertex AI — Gemini models (stable)
  {
    value: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'litellm',
    origin: 'google',
    reasoning: true,
  },
  {
    value: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'litellm',
    origin: 'google',
  },
  {
    value: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    provider: 'litellm',
    origin: 'google',
  },
  {
    value: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    provider: 'litellm',
    origin: 'google',
  },
  {
    value: 'gemini-2.0-flash-lite',
    label: 'Gemini 2.0 Flash Lite',
    provider: 'litellm',
    origin: 'google',
  },
] as const;

/** Normalize a model ID — pass through as-is (no legacy models to map) */
export const normalizeModelId = (modelValue: string): string => {
  return modelValue;
};

export const getModelProvider = (_modelValue: string): ModelProvider => {
  return 'litellm';
};

export const isReasoningModel = (modelValue: string): boolean => {
  return availableModels.some(
    (model) => model.value === modelValue && model.reasoning === true,
  );
};

const originDisplayNames: Record<ModelOrigin, string> = {
  openai: 'OpenAI',
  google: 'Google',
  anthropic: 'Anthropic',
};

export const getProviderDisplayName = (_provider: ModelProvider): string => {
  return 'LiteLLM';
};

/** Group models by their visual origin (OpenAI, Google, Anthropic, etc.) for the model selector UI */
export const groupModelsByOrigin = (
  models: AvailableModel[],
): Array<{
  origin: ModelOrigin;
  displayName: string;
  models: AvailableModel[];
}> => {
  const grouped = models.reduce(
    (acc, model) => {
      const origin = model.origin;
      if (!acc[origin]) {
        acc[origin] = {
          origin,
          displayName: originDisplayNames[origin],
          models: [],
        };
      }
      acc[origin].models.push(model);
      return acc;
    },
    {} as Record<
      ModelOrigin,
      { origin: ModelOrigin; displayName: string; models: AvailableModel[] }
    >,
  );

  const originOrder: ModelOrigin[] = ['openai', 'google', 'anthropic'];

  return originOrder
    .filter((origin) => grouped[origin])
    .map((origin) => grouped[origin]);
};
