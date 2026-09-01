export type ReasoningEffortLevel = 'low' | 'medium' | 'high';

export type BaseCompletionConfig = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
  verbose?: boolean;
  reasoning?: boolean;
  /**
   * OpenAI `reasoning_effort` param — passed through to LiteLLM and onward to
   * Scaleway GPT-OSS. When set, the factory also rewrites `max_tokens` to
   * `max_completion_tokens` (the param GPT-OSS expects) on the outgoing body.
   */
  reasoningEffort?: ReasoningEffortLevel;
};

export type ChatCompletionOptions = {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
  modelName?: string;
  reasoningEffort?: ReasoningEffortLevel;
};
