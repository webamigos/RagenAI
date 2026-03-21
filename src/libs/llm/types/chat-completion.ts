export type OpenRouterProviderPreferences = {
  order?: string[];
  only?: string[];
  ignore?: string[];
  data_collection?: 'deny' | 'allow';
  zdr?: boolean;
  sort?: 'price' | 'throughput' | 'latency';
  allow_fallbacks?: boolean;
  require_parameters?: boolean;
};

export type BaseCompletionConfig = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
  verbose?: boolean;
  reasoning?: boolean;
  providerPreferences?: OpenRouterProviderPreferences;
};

export type ChatCompletionOptions = {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
  modelName?: string;
};
