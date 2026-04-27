/**
 * Central model registry — maps LiteLLM model IDs to their display config.
 *
 * Models not in this registry will use inferred defaults (visible, auto-labeled).
 * Internal models (rephrase, rerank, embeddings) are marked as not visible.
 */

export type ModelProvider = 'litellm';

/** Visual grouping for the model selector UI (maps to the original provider behind the model) */
export type ModelOrigin = 'openai' | 'google' | 'anthropic';

export type ModelRegistryEntry = {
  /** Display name shown in the UI */
  displayName: string;
  /** Whether the model is visible to users in the model selector */
  visible: boolean;
  /** Visual grouping origin */
  origin: ModelOrigin;
  /** Whether the model supports extended thinking / reasoning */
  reasoning?: boolean;
  /**
   * Whether the model accepts the OpenAI `reasoning_effort` parameter
   * (`'low' | 'medium' | 'high'`). True for GPT-OSS via Scaleway. Models
   * that support reasoning through other contracts (Claude extended thinking,
   * Gemini thoughts) leave this falsy.
   */
  supportsReasoningEffort?: boolean;
};

export const MODEL_REGISTRY: Record<string, ModelRegistryEntry> = {
  // --- OpenAI (Azure) ---
  'gpt-5.4': {
    displayName: 'GPT 5.4',
    visible: true,
    origin: 'openai',
  },
  'gpt-5.4-mini': {
    displayName: 'GPT 5.4 Mini',
    visible: true,
    origin: 'openai',
  },
  'gpt-5.4-nano': {
    displayName: 'GPT 5.4 Nano',
    visible: false, // internal: used for rephrase
    origin: 'openai',
  },
  'gpt-5.3-chat': {
    displayName: 'GPT 5.3 Chat',
    visible: true,
    origin: 'openai',
  },

  // --- Scaleway (OpenAI-compatible) ---
  'gpt-oss-120b': {
    displayName: 'GPT-OSS 120B (Deep thinking)',
    visible: true,
    origin: 'openai',
    reasoning: true,
    supportsReasoningEffort: true,
  },
  'mistral-small-3.2': {
    displayName: 'Mistral Small 3.2',
    visible: true,
    origin: 'openai',
  },

  // --- Anthropic (Bedrock) ---
  'claude-sonnet-4-6': {
    displayName: 'Claude Sonnet 4.6',
    visible: true,
    origin: 'anthropic',
    reasoning: true,
  },
  'claude-opus-4-6': {
    displayName: 'Claude Opus 4.6',
    visible: true,
    origin: 'anthropic',
    reasoning: true,
  },
  'claude-haiku-4-5': {
    displayName: 'Claude Haiku 4.5',
    visible: true,
    origin: 'anthropic',
  },

  // --- Google (Vertex AI) ---
  'gemini-3-flash-preview': {
    displayName: 'Gemini 3 Flash Preview',
    visible: true,
    origin: 'google',
  },
  'gemini-2.5-pro': {
    displayName: 'Gemini 2.5 Pro',
    visible: true,
    origin: 'google',
    reasoning: true,
  },
  'gemini-2.5-flash': {
    displayName: 'Gemini 2.5 Flash',
    visible: true,
    origin: 'google',
  },
  'gemini-2.5-flash-lite': {
    displayName: 'Gemini 2.5 Flash Lite',
    visible: true,
    origin: 'google',
  },

  // --- Internal models (not visible to users) ---
  'cohere-rerank-v3-5': {
    displayName: 'Cohere Rerank v3.5',
    visible: false, // internal: used for reranking
    origin: 'openai',
  },
  'cohere-embed-multilingual-v3': {
    displayName: 'Cohere Embed Multilingual v3',
    visible: false, // internal: used for embeddings
    origin: 'openai',
  },
};
