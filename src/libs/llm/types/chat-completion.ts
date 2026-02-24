export type BaseCompletionConfig = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
  verbose?: boolean;
};

export type ChatCompletionOptions = {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
  modelName?: string;
};
