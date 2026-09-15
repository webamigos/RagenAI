import type { LanguageModelV4 } from '@ai-sdk/provider';
import { normalizeModelId } from './model-registry.js';
import { type ChatCompletionOptions } from './types/chat-completion.js';
import { type EmbeddingsProvider } from './types/embeddings.js';
import { modelsSchema } from './types/credentials.js';
import { type TrackAiUsage } from '../ai-usage/types.js';
import { resolveEmbeddingsModel } from '@ragenai/rag-core';
import {
  nativeChatInstance,
  nativeEmbeddingInstance,
} from './native-models.js';
import { TrackedEmbeddingsProvider } from './embeddings-factory.js';

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

function getDefaultModel(): string {
  const config = modelsSchema.parse({
    provider: process.env.DEFAULT_MODEL_PROVIDER,
    model: process.env.DEFAULT_MODEL,
  });
  return config.model;
}

// Lazy, deferred to first use rather than import time, so a build step that
// imports this module does not have to have DEFAULT_MODEL set.
let cachedDefaultModel: string | null = null;
function defaultModel(): string {
  if (!cachedDefaultModel) {
    cachedDefaultModel = getDefaultModel();
  }
  return cachedDefaultModel;
}

export function createChatCompletionInstance(
  options: ChatCompletionOptions,
): LanguageModelV4 {
  const rawModel = options.model || options.modelName || defaultModel();
  const selectedModel = rawModel ? normalizeModelId(rawModel) : undefined;

  let temperature = options.temperature;
  if (selectedModel && !supportsTemperature(selectedModel)) {
    temperature = undefined;
  }

  return nativeChatInstance({
    model: selectedModel,
    reasoningEffort: options.reasoningEffort,
    // Normalized above: undefined for models that reject the parameter.
    temperature,
  });
}

export function createEmbeddingsInstance(
  {
    organizationId,
    userId,
    projectId,
  }: {
    organizationId?: string;
    userId?: string;
    projectId?: string;
  } = {},
  trackAiUsage?: TrackAiUsage,
): EmbeddingsProvider {
  const embeddingsModel = resolveEmbeddingsModel();

  // `litellm` is the pricing namespace `calculateCost` looks under, and it
  // holds the whole catalogue — Scaleway, Vertex and Bedrock models alike.
  // Writing the real upstream here finds no entry and records every embedding
  // at **zero**, which the monthly cost ceiling is then computed from. The
  // name outlived the proxy; moving it is B6b, and it moves with the pricing
  // table or not at all.
  return new TrackedEmbeddingsProvider(
    nativeEmbeddingInstance(embeddingsModel, organizationId),
    embeddingsModel,
    'litellm',
    organizationId,
    userId,
    projectId,
    trackAiUsage,
  );
}
