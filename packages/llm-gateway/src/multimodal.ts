/**
 * Swap a text-only model for a vision-capable one when the turn carries images.
 *
 * Ported from `chat-completion-factory.ts`, where it lived inside a `fetch`
 * hook that parsed the outgoing `/chat/completions` body and rewrote
 * `body.model`. That worked because every call went to one OpenAI-compatible
 * endpoint. With native Azure, Bedrock and Vertex providers there is no shared
 * wire format to rewrite, and — more to the point — this was never really a
 * request rewrite. It is **model selection**, so it belongs before the model is
 * resolved rather than after it has been serialised.
 *
 * Configuration is unchanged, so a deployment keeps its existing variables:
 *   MULTIMODAL_TEXT_ONLY_MODELS — CSV of model ids that cannot handle vision
 *   MULTIMODAL_FALLBACK_MODEL   — the model id to swap to
 * With either unset, nothing is swapped.
 */

/** A message content part, loosely typed — only its `type` matters here. */
type ContentPart = { readonly type?: unknown };
type Message = { readonly content?: unknown };

/**
 * Part types that mean "not just text".
 *
 * AI SDK 7 normalises to `image` and `file`; the rest are the provider-native
 * spellings the previous implementation matched, kept because a caller may
 * hand over messages it built itself.
 */
const MULTIMODAL_PART_TYPES = new Set([
  'image',
  'image_url',
  'input_image',
  'file',
  'document',
  'input_document',
]);

export function hasMultimodalContent(messages: readonly Message[]): boolean {
  for (const message of messages) {
    if (!Array.isArray(message?.content)) {
      continue;
    }
    for (const part of message.content as ContentPart[]) {
      if (
        typeof part?.type === 'string' &&
        MULTIMODAL_PART_TYPES.has(part.type)
      ) {
        return true;
      }
    }
  }
  return false;
}

export type MultimodalPolicy = {
  /** Model ids that cannot accept images. */
  readonly textOnlyModels: ReadonlySet<string>;
  /** Where to send a multimodal turn instead. */
  readonly fallbackModel?: string;
};

export function multimodalPolicyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): MultimodalPolicy {
  const csv = env.MULTIMODAL_TEXT_ONLY_MODELS ?? '';
  return {
    textOnlyModels: new Set(
      csv
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
    fallbackModel: env.MULTIMODAL_FALLBACK_MODEL || undefined,
  };
}

/**
 * The model id to actually use for this turn.
 *
 * Returns the id unchanged unless every condition holds: a fallback is
 * configured, the requested model is listed as text-only, and the turn really
 * does carry non-text content.
 */
export function selectModelForContent(
  modelId: string,
  messages: readonly Message[],
  policy: MultimodalPolicy,
): string {
  if (!policy.fallbackModel) {
    return modelId;
  }
  if (!policy.textOnlyModels.has(modelId)) {
    return modelId;
  }
  if (!hasMultimodalContent(messages)) {
    return modelId;
  }
  return policy.fallbackModel;
}
