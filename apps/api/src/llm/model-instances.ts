import type { LanguageModelV3 } from '@ai-sdk/provider';
import { ChatCompletionFactory } from './chat-completion-factory.js';
import { EmbeddingsFactory } from './embeddings-factory.js';
import { isReasoningModel, normalizeModelId } from './model-registry.js';
import { type ChatCompletionOptions } from './types/chat-completion.js';
import { type LiteLLMCredentials } from './types/credentials.js';
import { type EmbeddingsProvider } from './types/embeddings.js';
import { modelsSchema } from './types/credentials.js';
import { type TrackAiUsage } from '../ai-usage/types.js';
import { resolveEmbeddingsModel } from '@ragenai/rag-core';

/**
 * Ported from apps/web's src/app/lib/services/llm.ts (only
 * createChatCompletionInstance/createEmbeddingsInstance — the piece
 * initializeBasicRag needs to instantiate models from resolved
 * credentials/settings). Not ported: createChatCompletionInstanceWithOrg
 * (unused by this slice's callers), modelsSchema/getDefaultModel (env-only,
 * apps/api/src/llm/types/credentials.ts already has a local equivalent),
 * createModerationInstance (already ported separately as
 * apps/api/src/chains/moderation-instance.ts).
 * See docs/adrs/21-monorepo-and-api-decoupling.md.
 */

// Models that don't support the temperature parameter (reasoning/thinking models).
const MODELS_WITHOUT_TEMPERATURE = ['o1', 'o3', 'o3-mini', 'o4-mini'];

function supportsTemperature(model: string): boolean {
  if (!model) {
    return true;
  }
  return !MODELS_WITHOUT_TEMPERATURE.some((m) => model.includes(m));
}

function getLiteLLMCredentials(): LiteLLMCredentials {
  const baseUrl = process.env.LITELLM_PROXY_URL;
  if (!baseUrl) {
    throw new Error('LITELLM_PROXY_URL is required');
  }
  return {
    provider: 'litellm',
    baseUrl,
    apiKey: process.env.LITELLM_MASTER_KEY,
  };
}

function getDefaultModel(): string {
  const config = modelsSchema.parse({
    provider: process.env.DEFAULT_MODEL_PROVIDER,
    model: process.env.DEFAULT_MODEL,
  });
  return config.model;
}

// Lazy-initialized credentials/default model (deferred to first use, not
// import time — matches the original's laziness, e.g. so a build step that
// imports this module doesn't require DEFAULT_MODEL_PROVIDER/DEFAULT_MODEL
// to already be set).
let cachedCredentials: LiteLLMCredentials | null = null;
function litellmCredentials(): LiteLLMCredentials {
  if (!cachedCredentials) {
    cachedCredentials = getLiteLLMCredentials();
  }
  return cachedCredentials;
}

let cachedDefaultModel: string | null = null;
function defaultModel(): string {
  if (!cachedDefaultModel) {
    cachedDefaultModel = getDefaultModel();
  }
  return cachedDefaultModel;
}

export function createChatCompletionInstance(
  options: ChatCompletionOptions & { litellmApiKey?: string },
  streaming = true,
): LanguageModelV3 {
  const rawModel = options.model || options.modelName || defaultModel();
  const selectedModel = rawModel ? normalizeModelId(rawModel) : undefined;

  let temperature = options.temperature;
  if (selectedModel && !supportsTemperature(selectedModel)) {
    temperature = undefined;
  }

  const reasoning = selectedModel ? isReasoningModel(selectedModel) : false;

  const credentials: LiteLLMCredentials = options.litellmApiKey
    ? { ...litellmCredentials(), apiKey: options.litellmApiKey }
    : litellmCredentials();

  return ChatCompletionFactory.createInstance(credentials, {
    model: selectedModel,
    temperature,
    streaming,
    reasoning,
    reasoningEffort: options.reasoningEffort,
  });
}

export function createEmbeddingsInstance(
  {
    organizationId,
    userId,
    projectId,
    litellmApiKey,
  }: {
    organizationId?: string;
    userId?: string;
    projectId?: string;
    litellmApiKey?: string;
  } = {},
  trackAiUsage?: TrackAiUsage,
): EmbeddingsProvider {
  const credentials: LiteLLMCredentials = litellmApiKey
    ? { ...litellmCredentials(), apiKey: litellmApiKey }
    : litellmCredentials();

  return EmbeddingsFactory.createInstance(
    credentials,
    { model: resolveEmbeddingsModel() },
    organizationId,
    userId,
    projectId,
    trackAiUsage,
  );
}
