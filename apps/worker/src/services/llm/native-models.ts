import type { EmbeddingModelV4, LanguageModelV4 } from '@ai-sdk/provider';
import { gatewayFromEnv } from '@ragenai/llm-gateway';

/**
 * This app's binding to the gateway.
 *
 * Thinner than the apps/web and apps/api twins, and not because it was
 * simplified: the worker has no multimodal swap and no reasoning effort, so
 * there is nothing to defer and no catalogue to inject. Its model getters were
 * already `async`, which is what the gateway needs, so each of these is one
 * call rather than a deferred `LanguageModelV4`.
 *
 * There is no path to choose between. `LLM_GATEWAY` used to pick the proxy or
 * this, and B6 removed the flag with the proxy — routing decisions live in the
 * route table now (ADR-49).
 *
 * `scope` is threaded from the org the job belongs to. The environment
 * credential source ignores it; per-org keys in ragen-token-vault will not
 * (ADR-13/ADR-32), and the worker is the surface where that matters most,
 * because every ingest already knows its organization.
 */

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
