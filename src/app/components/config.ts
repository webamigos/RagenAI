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

export type AvailableModel = {
  value: string;
  label: string;
  provider: ModelProvider;
};
export const availableModels: AvailableModel[] = [
  // OpenAI Models
  { value: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
  { value: 'gpt-4o-mini', label: 'GPT-4o mini', provider: 'openai' },
  { value: 'o1', label: 'OpenAI o1', provider: 'openai' },
  { value: 'o1-mini', label: 'OpenAI o1-mini', provider: 'openai' },
  { value: 'o3-mini', label: 'OpenAI o3-mini', provider: 'openai' },
  { value: 'gpt-4', label: 'GPT-4', provider: 'openai' },

  // Google Gemini Models
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'google' },
  {
    value: 'gemini-2.5-flash-preview-04-17',
    label: 'Gemini 2.5 Flash Preview',
    provider: 'google',
  },
  {
    value: 'gemini-2.5-pro-preview-03-25',
    label: 'Gemini 2.5 Pro Preview',
    provider: 'google',
  },

  // Anthropic Claude Models
  {
    value: 'claude-3-7-sonnet-latest',
    label: 'Claude 3.7 Sonnet',
    provider: 'anthropic',
  },
  {
    value: 'claude-3-5-sonnet-20241022',
    label: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
  },
  {
    value: 'claude-3-5-haiku-latest',
    label: 'Claude 3.5 Haiku',
    provider: 'anthropic',
  },
  {
    value: 'claude-3-5-haiku-20241022',
    label: 'Claude 3.5 Haiku (Oct)',
    provider: 'anthropic',
  },
] as const;

// Helper function to get provider for a model
export const getModelProvider = (
  modelValue: string
): ModelProvider | undefined => {
  return availableModels.find((model) => model.value === modelValue)?.provider;
};

// Helper function to check if a provider requires API keys that might not be configured
export const getProviderRequirements = (
  provider: ModelProvider
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

// Helper function to check if provider is configured via environment variables
const isProviderConfigured = (provider: ModelProvider): boolean => {
  // OpenAI is always available since it's used by default and can work with org API keys
  if (provider === 'openai') return true;

  const requirements = getProviderRequirements(provider);
  return requirements.envVars.every((envVar) => process.env[envVar]);
};

// Filter available models based on environment configuration
export const getAvailableModels = (): AvailableModel[] => {
  return availableModels.filter((model) =>
    isProviderConfigured(model.provider)
  );
};
