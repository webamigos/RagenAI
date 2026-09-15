import type { EmbeddingModelV4, LanguageModelV4 } from '@ai-sdk/provider';
import { gatewayFromEnv, usingNativeGateway } from '@ragenai/llm-gateway';

/**
 * This app's side of `LLM_GATEWAY`.
 *
 * Thinner than the apps/web and apps/api twins, and not because it was
 * simplified: the worker has no multimodal swap and no reasoning effort, so
 * there is nothing to defer and no catalogue to inject. Its model getters were
 * already `async`, which is what the gateway needs — so here the flag is a
 * plain branch rather than a deferred `LanguageModelV4`.
 *
 * `scope` is threaded from the org the job belongs to. The environment
 * credential source ignores it; per-org keys in ragen-token-vault will not
 * (ADR-13/ADR-32), and the worker is the surface where that matters most,
 * because every ingest already knows its organization.
 */

export { usingNativeGateway };

export function nativeChatModel(
  modelId: string,
  orgId?: string,
): Promise<LanguageModelV4> {
  return gatewayFromEnv().resolveModel(modelId, {
    scope: orgId ? { organizationId: orgId } : undefined,
  });
}

export function nativeEmbeddingModel(
  modelId: string,
  orgId?: string,
): Promise<EmbeddingModelV4> {
  return gatewayFromEnv().resolveEmbeddingModel(modelId, {
    scope: orgId ? { organizationId: orgId } : undefined,
  });
}
