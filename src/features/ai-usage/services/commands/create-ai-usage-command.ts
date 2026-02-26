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
        organization_id: input.organizationId,
        project_id: input.projectId ?? null,
        thread_id: input.threadId ?? null,
        user_id: input.userId ?? null,
        step: input.step,
        provider: input.provider,
        model: input.model,
        input_tokens: input.inputTokens,
        output_tokens: input.outputTokens,
        total_tokens: input.totalTokens,
        estimated_cost: estimatedCost,
        duration_ms: input.durationMs ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  } catch (error) {
    logger.error({ err: error, input }, 'Failed to create AI usage record');
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
