/**
 * The LLM catalogue: LiteLLM model IDs mapped to how the product presents them.
 *
 * This is *presentation* metadata, not the list of models a deployment serves.
 * Which models exist is decided by `infra/litellm/config.yaml` and read at
 * runtime from the proxy's `/v1/models`; this module supplies the label,
 * grouping and visibility for the IDs that come back, and the set of IDs an
 * administrator may put on an organization's allowlist.
 *
 * Keying is the thing to get right: LiteLLM model IDs carry **no provider
 * prefix**. `apps/admin` once kept its own copy that did (`openai/gpt-5.3-chat`),
 * which matched nothing and silently emptied organizations' model pickers
 * instead of restricting them. That is why this lives in one place — see
 * docs/lessons/hand-copied-lists-drift-and-typecheck-only-sees-one.md.
 */
export type ModelProvider = 'litellm';

/** Visual grouping for the model selector UI (maps to the original provider behind the model) */
export type ModelOrigin = 'openai' | 'google' | 'anthropic' | 'mistral';

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
  'gpt-5.6-sol': {
    displayName: 'GPT 5.6 Sol',
    visible: true,
    origin: 'openai',
    // Assumed to reason automatically server-side, same as the Claude/Gemini
    // reasoning entries below (no supportsReasoningEffort) — unconfirmed,
    // this model is untested end to end (see infra/litellm/config.yaml).
    // Revisit once real Azure access lets a live call settle it.
    reasoning: true,
  },
  'gpt-5.6-terra': {
    displayName: 'GPT 5.6 Terra',
    visible: true,
    origin: 'openai',
  },
  'gpt-5.6-luna': {
    displayName: 'GPT 5.6 Luna',
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
    origin: 'mistral',
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
  'claude-sonnet-5': {
    displayName: 'Claude Sonnet 5',
    visible: true,
    origin: 'anthropic',
    reasoning: true,
  },
  'claude-opus-5': {
    displayName: 'Claude Opus 5',
    visible: true,
    origin: 'anthropic',
    reasoning: true,
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
    // internal-only: used as SCORING_MODEL default for the leads scoring
    // pipeline. Not exposed in the chat picker.
    visible: false,
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
  'bge-multilingual-gemma2': {
    displayName: 'BGE Multilingual Gemma 2',
    visible: false, // internal: used for embeddings (Scaleway)
    origin: 'openai',
  },
  'qwen3-embedding-8b': {
    displayName: 'Qwen3 Embedding 8B',
    visible: false, // internal: used for embeddings/reranking (Scaleway)
    origin: 'openai',
  },
};

export type AvailableModel = {
  value: string;
  label: string;
  provider: ModelProvider;
  origin: ModelOrigin;
  reasoning?: boolean;
  supportsReasoningEffort?: boolean;
};

/** Whether the model accepts the OpenAI `reasoning_effort` parameter. */
export function supportsReasoningEffort(modelValue: string): boolean {
  return MODEL_REGISTRY[modelValue]?.supportsReasoningEffort === true;
}

/** Whether the model supports extended thinking / reasoning. */
export function isReasoningModel(modelValue: string): boolean {
  return MODEL_REGISTRY[modelValue]?.reasoning === true;
}

/** Pass-through today — the hook for mapping a retired model ID to its successor. */
export function normalizeModelId(modelValue: string): string {
  return modelValue;
}

/**
 * The models a user can choose in chat, and therefore the only ones worth
 * allowing or denying per organization. Entries marked `visible: false` are
 * internal (rephrase, summary, embeddings, reranking) and are never picked.
 */
export function selectableModels(): (ModelRegistryEntry & { value: string })[] {
  return Object.entries(MODEL_REGISTRY)
    .filter(([, entry]) => entry.visible)
    .map(([value, entry]) => ({ value, ...entry }));
}
