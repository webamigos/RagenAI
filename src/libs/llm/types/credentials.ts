export type ModelProvider = 'bedrock' | 'openai';

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

export type ProviderCredentials = OpenAICredentials | BedrockCredentials;
