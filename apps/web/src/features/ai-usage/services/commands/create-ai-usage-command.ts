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

    const inputTokens = Number.isFinite(input.inputTokens)
      ? input.inputTokens
      : 0;
    const outputTokens = Number.isFinite(input.outputTokens)
      ? input.outputTokens
      : 0;
    const totalTokens = Number.isFinite(input.totalTokens)
      ? input.totalTokens
      : inputTokens + outputTokens;
    const safeCost = Number.isFinite(estimatedCost) ? estimatedCost : 0;

    await db.aiUsage.create({
      data: {
        organization: { connect: { id: input.organizationId } },
        ...(input.projectId
          ? { project: { connect: { id: input.projectId } } }
          : {}),
        ...(input.userId ? { user: { connect: { id: input.userId } } } : {}),
        threadId: input.threadId ?? null,
        step: input.step,
        provider: input.provider,
        model: input.model,
        inputTokens,
        outputTokens,
        totalTokens,
        estimatedCost: safeCost,
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
 * Tracking wrapper that never throws — DB errors are caught and logged so
 * tracking failures cannot break the caller. Returns a Promise so callers
 * can `await` to ensure durability before the request closes; calling
 * without `await` is also safe (`void trackAiUsage(...)`).
 */
export async function trackAiUsage(input: CreateAiUsageInput): Promise<void> {
  await createAiUsageCommand(input).catch(() => {});
}
