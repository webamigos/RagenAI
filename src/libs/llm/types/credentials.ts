export type ModelProvider =
  | 'bedrock'
  | 'openai'
  | 'ollama'
  | 'anthropic'
  | 'google'
  | 'openrouter';

export type BaseProviderCredentials = {
  provider: ModelProvider;
};

export type OpenAICredentials = BaseProviderCredentials & {
  provider: 'openai';
  apiKey: string;
};

export type BedrockCredentials = BaseProviderCredentials & {
  provider: 'bedrock';
  region: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
};

export type OllamaCredentials = BaseProviderCredentials & {
  provider: 'ollama';
  baseUrl: string;
};

export type AnthropicCredentials = BaseProviderCredentials & {
  provider: 'anthropic';
  apiKey: string;
};

export type GoogleCredentials = BaseProviderCredentials & {
  provider: 'google';
  apiKey: string;
};

export type OpenRouterCredentials = BaseProviderCredentials & {
  provider: 'openrouter';
  apiKey: string;
};

export type ProviderCredentials =
  | OpenAICredentials
  | BedrockCredentials
  | OllamaCredentials
  | AnthropicCredentials
  | GoogleCredentials
  | OpenRouterCredentials;
