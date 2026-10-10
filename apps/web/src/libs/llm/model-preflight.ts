import {
  gatewayFromEnv,
  MissingCredentialsError,
  multimodalPolicyFromEnv,
  selectModelForContent,
  UnknownModelError,
} from '@ragenai/llm-gateway';

import { ModelNotConfiguredError } from '@/libs/chains/errors';

/**
 * The gateway's "this deployment cannot call that model" failures, as the
 * chat's own error, or `undefined` for anything else.
 *
 * Only these two. Anything else — a malformed `VERTEX_CREDENTIALS`, a vault
 * that did not answer — is a different fault and keeps its own message.
 */
export function asModelNotConfigured(
  error: unknown,
  modelId: string,
): ModelNotConfiguredError | undefined {
  if (error instanceof ModelNotConfiguredError) {
    return error;
  }
  if (
    error instanceof MissingCredentialsError ||
    error instanceof UnknownModelError
  ) {
    return new ModelNotConfiguredError(modelId, error.message);
  }
  return undefined;
}

/** Stands in for a turn's messages when all the policy asks is "any images?". */
const AN_IMAGE_TURN = [{ content: [{ type: 'image' }] }] as const;

/**
 * The model the chain will actually call for this turn.
 *
 * A turn with images on a model listed in `MULTIMODAL_TEXT_ONLY_MODELS` goes to
 * `MULTIMODAL_FALLBACK_MODEL` instead, inside the stream. Asked through the
 * gateway's own `selectModelForContent`, so the two cannot disagree.
 */
export function modelForTurn(modelId: string, hasImages: boolean): string {
  return hasImages
    ? selectModelForContent(modelId, AN_IMAGE_TURN, multimodalPolicyFromEnv())
    : modelId;
}

/**
 * Resolve the turn's model before the stream starts, and refuse the turn if
 * the deployment cannot call it.
 *
 * `nativeChatInstance` resolves lazily, inside the AI SDK's `doStream`, so a
 * model whose provider has no credentials used to fail *after* retrieval had
 * run: the stream ended with no output, the AI SDK's promises rejected with
 * nobody listening, and the reader saw sources and no answer. Resolving here
 * turns that into an ordinary error event before anything is stored.
 *
 * It checks the model the turn will really use — the vision fallback for a
 * turn with images, when that applies — not the one that was asked for.
 * Checking the requested one would pass a turn whose fallback has no keys, and
 * refuse one the fallback could have answered.
 *
 * It builds a provider client and calls nothing, so it costs no request. The
 * client is not reused — the chain resolves its own.
 */
export async function assertModelIsServed(
  modelId: string | undefined,
  options: { organizationId?: string; hasImages?: boolean } = {},
): Promise<void> {
  if (!modelId) {
    // `nativeChatInstance` refuses an empty id with its own message.
    return;
  }
  const servedBy = modelForTurn(modelId, options.hasImages ?? false);
  try {
    await gatewayFromEnv().resolveModel(servedBy, {
      scope: options.organizationId
        ? { organizationId: options.organizationId }
        : undefined,
    });
  } catch (error) {
    throw asModelNotConfigured(error, servedBy) ?? error;
  }
}
