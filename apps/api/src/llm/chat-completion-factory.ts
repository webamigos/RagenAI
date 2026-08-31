import { Logger } from '@nestjs/common';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { supportsReasoningEffort } from './model-registry.js';

import type {
  BaseCompletionConfig,
  LiteLLMCredentials,
  ReasoningEffortLevel,
} from './types/index.js';

const logger = new Logger('ChatCompletionFactory');

/**
 * Content-part types that indicate multimodal input. Covers AI SDK v5/v6
 * OpenAI provider shapes (image_url, image, file) and Anthropic-style
 * (document, input_image, input_document).
 */
const MULTIMODAL_PART_TYPES = new Set([
  'image_url',
  'image',
  'input_image',
  'file',
  'document',
  'input_document',
]);

function hasMultimodalContent(body: unknown): boolean {
  if (
    !body ||
    typeof body !== 'object' ||
    !Array.isArray((body as { messages?: unknown }).messages)
  ) {
    return false;
  }
  const messages = (body as { messages: unknown[] }).messages;
  for (const msg of messages) {
    const content = (msg as { content?: unknown })?.content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const part of content) {
      const type = (part as { type?: unknown })?.type;
      if (typeof type === 'string' && MULTIMODAL_PART_TYPES.has(type)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Optional swap of text-only models to a vision-capable model when the
 * outgoing /chat/completions body contains image/document content parts.
 *
 * Configured via env:
 *   MULTIMODAL_TEXT_ONLY_MODELS  — CSV of model_names that cannot handle vision
 *                                  (e.g. "gpt-oss-120b")
 *   MULTIMODAL_FALLBACK_MODEL    — model_name to swap to (e.g. "mistral-small-3.2")
 *
 * If either is unset, no rewriting happens.
 */
function maybeRewriteModelForMultimodal(body: {
  model?: unknown;
  messages?: unknown;
}): void {
  const fallback = process.env.MULTIMODAL_FALLBACK_MODEL;
  const textOnlyCsv = process.env.MULTIMODAL_TEXT_ONLY_MODELS;
  if (!fallback || !textOnlyCsv) {
    return;
  }
  const currentModel = body.model;
  if (typeof currentModel !== 'string') {
    return;
  }
  const textOnly = new Set(
    textOnlyCsv
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
  );
  if (!textOnly.has(currentModel)) {
    return;
  }
  if (!hasMultimodalContent(body)) {
    return;
  }
  logger.log(
    `Multimodal content detected — routing to vision-capable model: ${currentModel} -> ${fallback}`,
  );
  body.model = fallback;
}

/**
 * Inject OpenAI `reasoning_effort` into the outgoing /chat/completions body
 * for models that support it (GPT-OSS via Scaleway). Also renames `max_tokens`
 * to `max_completion_tokens` since reasoning models reject the legacy field.
 *
 * No-op for any other model — `drop_params: true` in LiteLLM strips unknown
 * fields before forwarding upstream.
 */
function applyReasoningEffort(
  body: { model?: unknown; max_tokens?: unknown } & Record<string, unknown>,
  reasoningEffort: ReasoningEffortLevel,
): void {
  if (typeof body.model !== 'string') {
    return;
  }
  if (!supportsReasoningEffort(body.model)) {
    return;
  }
  body.reasoning_effort = reasoningEffort;
  if (
    body.max_tokens !== undefined &&
    body.max_completion_tokens === undefined
  ) {
    body.max_completion_tokens = body.max_tokens;
    delete body.max_tokens;
  }
  logger.log(
    `Injected reasoning_effort=${reasoningEffort} for deep-thinking model ${body.model}`,
  );
}

export class ChatCompletionFactory {
  static createInstance(
    credentials: LiteLLMCredentials,
    config: BaseCompletionConfig,
  ): LanguageModelV3 {
    if (!credentials.baseUrl) {
      throw new Error('LiteLLM baseUrl is required');
    }

    const baseUrl = credentials.baseUrl.endsWith('/')
      ? credentials.baseUrl.slice(0, -1)
      : credentials.baseUrl;

    const reasoningEffort = config.reasoningEffort;

    const litellm = createOpenAI({
      baseURL: `${baseUrl}/v1`,
      apiKey: credentials.apiKey || 'sk-litellm',
      fetch: async (url, init) => {
        if (init?.body && typeof init.body === 'string') {
          try {
            const body = JSON.parse(init.body);
            maybeRewriteModelForMultimodal(body);
            if (reasoningEffort) {
              applyReasoningEffort(body, reasoningEffort);
            }
            init = { ...init, body: JSON.stringify(body) };
          } catch {
            // not JSON, pass through
          }
        }
        return fetch(url, init);
      },
    });

    // Use .chat() to hit /chat/completions instead of /responses (which LiteLLM doesn't support)
    return litellm.chat(config.model || 'gpt-5.4-nano');
  }
}
