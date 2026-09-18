import type { EmbeddingModelV4, LanguageModelV4 } from '@ai-sdk/provider';
import { gatewayFromEnv, nativeChatModel } from '@ragenai/llm-gateway';

import { supportsReasoningEffort } from './model-registry.js';
import { type ReasoningEffortLevel } from './types/index.js';

/**
 * This app's side of `LLM_GATEWAY`. The apps/web twin is
 * `apps/web/src/libs/llm/native-models.ts`, and the two are deliberately
 * separate files rather than one shared helper: `supportsReasoningEffort` is
 * the only thing they inject, each app reaches it by its own path, and the
 * duplication is four lines against a new shared package that would exist only
 * to hold them.
 *
 * Thin, and tested for that reason — this is the only place deciding whether a
 * model call reaches a provider directly, and a binding that picked wrong would
 * surface as a measurement that found no difference.
 */

export function nativeChatInstance(options: {
  model?: string;
  reasoningEffort?: ReasoningEffortLevel;
  temperature?: number;
  organizationId?: string;
}): LanguageModelV4 {
  if (!options.model) {
    throw new Error(
      'a model id is required: no model was requested and DEFAULT_MODEL resolved to nothing',
    );
  }

  return nativeChatModel(gatewayFromEnv(), {
    modelId: options.model,
    reasoningEffort: options.reasoningEffort,
    temperature: options.temperature,
    supportsReasoningEffort,
    scope: options.organizationId
      ? { organizationId: options.organizationId }
      : undefined,
  });
}

export function nativeEmbeddingInstance(
  modelId: string,
  organizationId?: string,
): Promise<EmbeddingModelV4> {
  return gatewayFromEnv().resolveEmbeddingModel(modelId, {
    scope: organizationId ? { organizationId } : undefined,
  });
}

/**
 * The provider that actually served a turn, for the `ai_usage` metadata.
 *
 * It is deliberately **not** put in the `provider` column. That column is the
 * key `calculateCost` looks pricing up under, and the `litellm` namespace there
 * holds the whole catalogue — Scaleway, Vertex and Bedrock models alike — so
 * writing `vertex` or `openai-compatible` into it would find no pricing entry
 * and silently record every turn as costing zero. The monthly cost ceiling is
 * computed from those rows, so that failure would be quiet and expensive.
 *
 * Attribution therefore rides in metadata until the pricing table is keyed by
 * real provider. Anyone moving it must move the pricing table first.
 */
export function servingProvider(modelId: string): string | undefined {
  try {
    return gatewayFromEnv().routeFor(modelId)?.provider;
  } catch {
    return undefined;
  }
}

/**
 * Whether this deployment can actually answer with `modelId`.
 *
 * Asked before a chat chain is built, because the alternative is worse than a
 * bad answer: an unroutable model reaches `streamText`, the provider is never
 * constructed, and the AI SDK raises `AI_NoOutputGeneratedError` from a
 * `TransformStream` flush callback — outside any request-scoped `catch`, so it
 * lands as an unhandled rejection and takes the process down. One request with
 * a bad `model` therefore ended the service for every caller.
 *
 * `routeFor` is a synchronous lookup in the loaded route table, so this costs
 * nothing per request. A table that cannot be read at all is a different
 * failure and is left to surface as itself, rather than being reported here as
 * "no such model".
 */
export function isModelRoutable(modelId: string): boolean {
  return gatewayFromEnv().routeFor(modelId) !== undefined;
}

/** The model ids this deployment serves, for an error message that helps. */
export function routableModels(): string[] {
  return gatewayFromEnv().availableModels();
}
