import { Logger } from '@nestjs/common';
import {
  calculateCost as calculateCostFromTable,
  priceFor,
} from '@ragenai/platform-contracts';

// The table lives once, in @ragenai/platform-contracts (ADR-33); apps/web and
// apps/worker price from the same one. This binding only adds the warning.
const logger = new Logger('AiPricing');

export function calculateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  if (!priceFor(provider, model)) {
    logger.warn(
      `No pricing found for provider="${provider}" model="${model}". Cost will be 0.`,
    );
  }
  return calculateCostFromTable(provider, model, inputTokens, outputTokens);
}
