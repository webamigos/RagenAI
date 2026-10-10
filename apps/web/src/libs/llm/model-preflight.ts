import {
  gatewayFromEnv,
  MissingCredentialsError,
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
 * It builds a provider client and calls nothing, so it costs no request. The
 * client is not reused — the chain resolves its own, and may pick a different
 * model for a turn with images (`selectModelForContent`).
 */
export async function assertModelIsServed(
  modelId: string | undefined,
  organizationId?: string,
): Promise<void> {
  if (!modelId) {
    // `nativeChatInstance` refuses an empty id with its own message.
    return;
  }
  try {
    await gatewayFromEnv().resolveModel(modelId, {
      scope: organizationId ? { organizationId } : undefined,
    });
  } catch (error) {
    throw asModelNotConfigured(error, modelId) ?? error;
  }
}
