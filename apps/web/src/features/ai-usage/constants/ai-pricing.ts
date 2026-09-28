import {
  calculateCost as calculateCostFromTable,
  priceFor,
} from '@ragenai/platform-contracts';

import { logger } from '@/app/lib/utils/logger';

// The table lives once, in @ragenai/platform-contracts (ADR-33); apps/api and
// apps/worker price from the same one. This binding only adds the warning.
export { AI_PRICING, EUR_TO_USD, priceFor } from '@ragenai/platform-contracts';

export function calculateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  if (!priceFor(provider, model)) {
    logger.warn(
      `[ai-pricing] No pricing found for provider="${provider}" model="${model}". Cost will be 0.`,
    );
  }
  return calculateCostFromTable(provider, model, inputTokens, outputTokens);
}
