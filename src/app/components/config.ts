export const LOCAL_STORAGE_THREAD_KEY = 'threadId';
export const SESSION_STORAGE_TEMP_MESSAGE_KEY = 'tempMessage';

export type ModelProvider =
  | 'openai'
  | 'google'
  | 'anthropic'
  | 'bedrock'
  | 'ollama'
  | 'openrouter'
  | 'fireworks'
  | 'azure-openai';

/** Visual grouping for the model selector UI (maps to the original provider behind the model) */
export type ModelOrigin = 'openai' | 'google' | 'anthropic' | 'perplexity';

export type AvailableModel = {
  value: string;
  label: string;
  provider: ModelProvider;
  origin: ModelOrigin;
  reasoning?: boolean;
};

// All models are routed through OpenRouter as a unified gateway.
// The `origin` field is used only for UI grouping in the model selector.
export const availableModels: AvailableModel[] = [
  // OpenAI Models
  {
    value: 'openai/gpt-5.2',
    label: 'GPT-5.2 Thinking',
    provider: 'openrouter',
    origin: 'openai',
    reasoning: true,
  },
  {
    value: 'openai/gpt-5.2-chat',
    label: 'GPT-5.2 Instant',
    provider: 'openrouter',
    origin: 'openai',
  },

  // Google Gemini Models
  {
    value: 'google/gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    provider: 'openrouter',
    origin: 'google',
    reasoning: true,
  },

  // Anthropic Claude Models
  {
    value: 'anthropic/claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    provider: 'openrouter',
    origin: 'anthropic',
    reasoning: true,
  },

  // Perplexity Models
  {
    value: 'perplexity/sonar-pro',
    label: 'Perplexity Sonar Pro',
    provider: 'openrouter',
    origin: 'perplexity',
  },
] as const;

/** Maps legacy model IDs (stored in DB) to current OpenRouter model IDs */
const legacyModelIdMap: Record<string, string> = {
  'gpt-5.2': 'openai/gpt-5.2',
  'gpt-5.2-chat-latest': 'openai/gpt-5.2-chat',
  'gpt-4o': 'openai/gpt-5.2-chat',
  'gpt-4o-mini': 'openai/gpt-5.2-chat',
  'o3-mini': 'openai/gpt-5.2',
  'openai/gpt-4o': 'openai/gpt-5.2-chat',
  'openai/gpt-4o-mini': 'openai/gpt-5.2-chat',
  'openai/o3-mini': 'openai/gpt-5.2',
  'gemini-3-flash-preview': 'google/gemini-3-flash-preview',
  'gemini-2.0-flash': 'google/gemini-3-flash-preview',
  'claude-sonnet-4-6': 'anthropic/claude-sonnet-4.6',
  'claude-haiku-4-5-20251001': 'anthropic/claude-sonnet-4.6',
  'claude-3-7-sonnet-latest': 'anthropic/claude-sonnet-4.6',
  'claude-haiku-4.5': 'anthropic/claude-sonnet-4.6',
  'anthropic/claude-haiku-4.5': 'anthropic/claude-sonnet-4.6',
  'anthropic/claude-3.7-sonnet': 'anthropic/claude-sonnet-4.6',
};

/** Normalize a model ID, converting legacy IDs to current OpenRouter IDs */
export const normalizeModelId = (modelValue: string): string => {
  return legacyModelIdMap[modelValue] || modelValue;
};

export const getModelProvider = (
  modelValue: string,
): ModelProvider | undefined => {
  const normalized = normalizeModelId(modelValue);
  const found = availableModels.find((model) => model.value === normalized);
  if (found) {
    return found.provider;
  }

  // Infer provider from OpenRouter-style prefix (e.g. "google/gemini-..." → openrouter)
  if (normalized.includes('/')) {
    return 'openrouter';
  }

  return undefined;
};

export const isReasoningModel = (modelValue: string): boolean => {
  const normalized = normalizeModelId(modelValue);
  return availableModels.some(
    (model) => model.value === normalized && model.reasoning === true,
  );
};

export const getProviderRequirements = (
  provider: ModelProvider,
): { envVars: string[]; optional?: boolean } => {
  switch (provider) {
    case 'openai':
      return { envVars: ['OPENAI_API_KEY'] };
    case 'google':
      return { envVars: ['GOOGLE_API_KEY'] };
    case 'anthropic':
      return { envVars: ['ANTHROPIC_API_KEY'] };
    case 'bedrock':
      return {
        envVars: ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
      };
    case 'ollama':
      return { envVars: ['OLLAMA_HOST'] };
    case 'openrouter':
      return { envVars: ['OPENROUTER_API_KEY'] };
    case 'fireworks':
      return { envVars: ['FIREWORKS_API_KEY'] };
    case 'azure-openai':
      return {
        envVars: [
          'AZURE_OPENAI_KEY',
          'AZURE_OPENAI_INSTANCE',
          'AZURE_OPENAI_DEPLOYMENT',
          'AZURE_OPENAI_VERSION',
        ],
      };
    default:
      return { envVars: [] };
  }
};

const isProviderConfigured = (provider: ModelProvider): boolean => {
  if (provider === 'openrouter') {
    return !!process.env.OPENROUTER_API_KEY;
  }
  if (provider === 'openai') {
    return true;
  }

  const requirements = getProviderRequirements(provider);
  return requirements.envVars.every((envVar) => process.env[envVar]);
};

const originDisplayNames: Record<ModelOrigin, string> = {
  openai: 'OpenAI',
  google: 'Google',
  anthropic: 'Anthropic',
  perplexity: 'Perplexity',
};

export const getProviderDisplayName = (provider: ModelProvider): string => {
  switch (provider) {
    case 'openai':
      return 'OpenAI';
    case 'google':
      return 'Google';
    case 'anthropic':
      return 'Anthropic';
    case 'bedrock':
      return 'AWS Bedrock';
    case 'ollama':
      return 'Ollama';
    case 'openrouter':
      return 'OpenRouter';
    case 'fireworks':
      return 'Fireworks';
    case 'azure-openai':
      return 'Azure OpenAI';
    default:
      return provider;
  }
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

  const originOrder: ModelOrigin[] = [
    'openai',
    'google',
    'anthropic',
    'perplexity',
  ];

  return originOrder
    .filter((origin) => grouped[origin])
    .map((origin) => grouped[origin]);
};

/** @deprecated Use groupModelsByOrigin instead */
export const groupModelsByProvider = (
  models: AvailableModel[],
): Array<{
  provider: ModelProvider;
  displayName: string;
  models: AvailableModel[];
}> => {
  const grouped = models.reduce(
    (acc, model) => {
      const provider = model.provider;
      if (!acc[provider]) {
        acc[provider] = {
          provider,
          displayName: getProviderDisplayName(provider),
          models: [],
        };
      }
      acc[provider].models.push(model);
      return acc;
    },
    {} as Record<
      ModelProvider,
      { provider: ModelProvider; displayName: string; models: AvailableModel[] }
    >,
  );

  const providerOrder: ModelProvider[] = [
    'openai',
    'google',
    'anthropic',
    'bedrock',
    'azure-openai',
    'ollama',
    'openrouter',
    'fireworks',
  ];

  return providerOrder
    .filter((provider) => grouped[provider])
    .map((provider) => grouped[provider])
    .concat(
      Object.values(grouped).filter(
        (group) => !providerOrder.includes(group.provider),
      ),
    );
};

// Filter available models based on environment configuration
// NOTE: This is deprecated for client-side use - use getAvailableModelsForOrganization server action instead
// This function is kept for backward compatibility and server-side usage where organization context is not available
export const getAvailableModels = (): AvailableModel[] => {
  return availableModels.filter((model) =>
    isProviderConfigured(model.provider),
  );
};
