export type ModelProvider = 'bedrock' | 'openai' | 'ollama';

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

export type ProviderCredentials =
  | OpenAICredentials
  | BedrockCredentials
  | OllamaCredentials;
