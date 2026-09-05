// Duplicated from apps/web's src/features/ai-usage/constants/ai-pricing.ts —
// see docs/adrs/21-monorepo-and-api-decoupling.md. Keep in sync manually
// until a real shared package exists.
import { Logger } from '@nestjs/common';

const logger = new Logger('AiPricing');

type ModelPricing = {
  input: number; // per 1M tokens
  output: number; // per 1M tokens
};

const PRICING: Record<string, Record<string, ModelPricing>> = {
  openai: {
    'gpt-4o': { input: 2.5, output: 10 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'o3-mini': { input: 1.1, output: 4.4 },
    'gpt-5.2': { input: 2.0, output: 8.0 },
    'gpt-5.2-chat': { input: 2.0, output: 8.0 },
    'gpt-5.3-chat': { input: 2.0, output: 8.0 },
    'text-embedding-3-small': { input: 0.02, output: 0 },
    'text-embedding-3-large': { input: 0.13, output: 0 },
    'text-embedding-ada-002': { input: 0.1, output: 0 },
    'omni-moderation-latest': { input: 0, output: 0 },
    'text-moderation-latest': { input: 0, output: 0 },
  },
  anthropic: {
    'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
    'claude-3.7-sonnet': { input: 3, output: 15 },
    'claude-haiku-4.5': { input: 0.8, output: 4 },
    'claude-sonnet-4.6': { input: 3, output: 15 },
    'claude-opus-4.6': { input: 5, output: 25 },
  },
  google: {
    'gemini-2.0-flash': { input: 0.1, output: 0.4 },
    'gemini-3-flash-preview': { input: 0.5, output: 3.0 },
  },
  bedrock: {
    'anthropic.claude-3-7-sonnet-20250219-v1:0': { input: 3, output: 15 },
    'anthropic.claude-3-5-haiku-20241022-v1:0': { input: 0.8, output: 4 },
    'anthropic.claude-3-5-sonnet-20241022-v2:0': { input: 3, output: 15 },
    'amazon.titan-embed-text-v1': { input: 0.1, output: 0 },
    'cohere.embed-multilingual-v3': { input: 0.1, output: 0 },
  },
  // LiteLLM is the unified gateway — `AiUsageService.track()` stores
  // `provider: 'litellm'` when the caller can't map the model back to its
  // upstream. Keep model IDs here in sync with `infra/litellm/config.yaml` (the
  // source of truth) and with apps/web's copy of this file.
  litellm: {
    'gpt-5.4': { input: 2.0, output: 8.0 },
    'gpt-5.4-nano': { input: 0.1, output: 0.4 },
    'gpt-5.3-chat': { input: 2.0, output: 8.0 },
    'gpt-5.6-sol': { input: 5.0, output: 30.0 },
    'gpt-5.6-terra': { input: 2.0, output: 12.0 },
    'gpt-5.6-luna': { input: 0.2, output: 1.2 },
    'claude-sonnet-4-6': { input: 3, output: 15 },
    'claude-opus-4-6': { input: 5, output: 25 },
    'claude-haiku-4-5': { input: 0.8, output: 4 },
    'claude-sonnet-5': { input: 2, output: 10 },
    'claude-opus-5': { input: 5, output: 25 },
    'gemini-3-flash-preview': { input: 0.5, output: 3.0 },
    'gemini-2.5-flash': { input: 0.1, output: 0.4 },
    'cohere-embed-multilingual-v3': { input: 0.1, output: 0 },
    // Cohere Rerank bills per search unit, not per token. Zeroed out
    // until we add a per-request cost field to the pricing model.
    'cohere-rerank-v3-5': { input: 0, output: 0 },
    // Scaleway Generative APIs (EUR per 1M tokens — values stored as the
    // numeric rate; treated as USD by the AI Usage UI which is currency-
    // agnostic).
    'gpt-oss-120b': { input: 0.15, output: 0.6 },
    'mistral-small-3.2': { input: 0.15, output: 0.35 },
    'bge-multilingual-gemma2': { input: 0.1, output: 0 },
    // Scaleway rerank uses qwen3-embedding-8b (bi-encoder via /v1/rerank).
    'qwen3-embedding-8b': { input: 0.1, output: 0 },
  },
  openrouter: {
    'openai/gpt-4o': { input: 2.5, output: 10 },
    'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
    'openai/o3-mini': { input: 1.1, output: 4.4 },
    'openai/gpt-5.2': { input: 2.0, output: 8.0 },
    'openai/gpt-5.2-chat': { input: 2.0, output: 8.0 },
    'openai/gpt-5.3-chat': { input: 2.0, output: 8.0 },
    'google/gemini-3-flash-preview': { input: 0.5, output: 3.0 },
    'anthropic/claude-haiku-4.5': { input: 0.8, output: 4 },
    'anthropic/claude-3.7-sonnet': { input: 3, output: 15 },
    'anthropic/claude-sonnet-4.6': { input: 3, output: 15 },
    'anthropic/claude-opus-4.6': { input: 15, output: 75 },
    'perplexity/sonar-pro': { input: 3, output: 15 },
  },
};

export function calculateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = PRICING[provider]?.[model];
  if (!pricing) {
    logger.warn(
      `No pricing found for provider="${provider}" model="${model}". Cost will be 0.`,
    );
    return 0;
  }

  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );
}
