import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import type { CreateAiUsageInput } from '../../contracts/ai-usage.types';
import { calculateCost } from '../../constants/ai-pricing';

export async function createAiUsageCommand(
  input: CreateAiUsageInput,
): Promise<void> {
  try {
    const estimatedCost =
      input.estimatedCost ??
      calculateCost(
        input.provider,
        input.model,
        input.inputTokens,
        input.outputTokens,
      );

    await db.aiUsage.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        threadId: input.threadId ?? null,
        userId: input.userId ?? null,
        step: input.step,
        provider: input.provider,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        totalTokens: input.totalTokens,
        estimatedCost: estimatedCost,
        durationMs: input.durationMs ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  } catch (error) {
    logger.error({ err: error, input }, 'Failed to create AI usage record');
    throw error;
  }
}

/**
 * Fire-and-forget wrapper that never throws or blocks the caller.
 */
export function trackAiUsage(input: CreateAiUsageInput): void {
  createAiUsageCommand(input).catch((error) => {
    logger.error({ err: error }, 'trackAiUsage: unhandled error');
  });
}
