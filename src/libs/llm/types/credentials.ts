export type ModelProvider =
  | 'bedrock'
  | 'openai'
  | 'ollama'
  | 'anthropic'
  | 'google'
  | 'openrouter'
  | 'fireworks'
  | 'azure-openai';

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

export type FireworksCredentials = BaseProviderCredentials & {
  provider: 'fireworks';
  apiKey: string;
};

export type AzureOpenAICredentials = BaseProviderCredentials & {
  provider: 'azure-openai';
  apiKey: string;
  instanceName: string;
  deploymentName: string;
  apiVersion: string;
};

export type ProviderCredentials =
  | OpenAICredentials
  | BedrockCredentials
  | OllamaCredentials
  | AnthropicCredentials
  | GoogleCredentials
  | OpenRouterCredentials
  | FireworksCredentials
  | AzureOpenAICredentials;
