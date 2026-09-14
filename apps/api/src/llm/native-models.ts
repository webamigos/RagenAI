import type { EmbeddingModelV4, LanguageModelV4 } from '@ai-sdk/provider';
import {
  gatewayFromEnv,
  nativeChatModel,
  usingNativeGateway,
} from '@ragenai/llm-gateway';

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

export { usingNativeGateway };

export function nativeChatInstance(options: {
  model?: string;
  reasoningEffort?: ReasoningEffortLevel;
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
