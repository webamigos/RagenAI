import { logger } from '@/app/lib/utils/logger';

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
  },
  openrouter: {
    'openai/gpt-4o': { input: 2.5, output: 10 },
    'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
    'openai/o3-mini': { input: 1.1, output: 4.4 },
    'openai/gpt-5.2': { input: 2.0, output: 8.0 },
    'openai/gpt-5.2-chat': { input: 2.0, output: 8.0 },
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
      `[ai-pricing] No pricing found for provider="${provider}" model="${model}". Cost will be 0.`,
    );
    return 0;
  }

  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );
}
