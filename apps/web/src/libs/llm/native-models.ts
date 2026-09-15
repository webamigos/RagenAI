import type { EmbeddingModelV4, LanguageModelV4 } from '@ai-sdk/provider';
import {
  gatewayFromEnv,
  nativeChatModel,
  usingNativeGateway,
} from '@ragenai/llm-gateway';

import { supportsReasoningEffort } from '@/app/components/config';

import type { ReasoningEffortLevel } from './types';

/**
 * The application's side of `LLM_GATEWAY`.
 *
 * Thin on purpose, and tested for exactly that reason: it is the only place
 * that decides whether a model call reaches a provider directly or goes through
 * the proxy, and a binding that silently picked the wrong one would show up as
 * a measurement that found no difference. `AGENTS.md` calls this the "five-line
 * file that fails silently" case.
 *
 * `supportsReasoningEffort` is injected here rather than read inside the
 * package: which models reason is `MODEL_REGISTRY`'s business, which is
 * presentation, and the gateway deliberately does not depend on it.
 */

/** Whether this process talks to providers directly. Re-exported for callers. */
export { usingNativeGateway };

export function nativeChatInstance(options: {
  model?: string;
  reasoningEffort?: ReasoningEffortLevel;
  temperature?: number;
  organizationId?: string;
}): LanguageModelV4 {
  if (!options.model) {
    // The proxy path fell back to a hard-coded `gpt-5.4-nano`, which has not
    // been provisioned for some time — so that fallback only ever turned a
    // missing model id into an upstream 404 on the first turn. Refusing here
    // says the same thing at the point the mistake was made.
    throw new Error(
      'a model id is required: no model was requested and DEFAULT_MODEL resolved to nothing',
    );
  }

  return nativeChatModel(gatewayFromEnv(), {
    modelId: options.model,
    reasoningEffort: options.reasoningEffort,
    temperature: options.temperature,
    supportsReasoningEffort,
    // Unused by the environment credential source, and threaded anyway so the
    // per-org keys in ragen-token-vault need no change here (ADR-13/ADR-32).
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
