import { Logger } from '@nestjs/common';
import {
  calculateCost as calculateCostFromTable,
  priceFor,
} from '@ragenai/platform-contracts';
import { routeDescribesItself } from '@ragenai/llm-gateway';

// The table lives once, in @ragenai/platform-contracts (ADR-33); apps/web and
// apps/worker price from the same one. This binding only adds the warning.
const logger = new Logger('AiPricing');

export function calculateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  // As in apps/web: a self-described (local) model has no per-token bill.
  if (routeDescribesItself(model)) {
    return 0;
  }
  if (!priceFor(provider, model)) {
    logger.warn(
      `No pricing found for provider="${provider}" model="${model}". Cost will be 0.`,
    );
  }
  return calculateCostFromTable(provider, model, inputTokens, outputTokens);
}
