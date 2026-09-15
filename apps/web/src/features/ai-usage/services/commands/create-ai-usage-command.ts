import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import type { CreateAiUsageInput } from '../../contracts/ai-usage.types';
import { calculateCost } from '../../constants/ai-pricing';
import { chargeTeamTokenUsage } from '@/features/teams/services/queries/check-team-rate-limit-query';

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
        // `team` rather than a raw `teamId`: the column carries a relation now,
        // and Prisma refuses a scalar foreign key alongside `connect` on the
        // same create. `threadId` next to it is a plain column with no
        // relation, which is why it stays a scalar.
        ...(input.teamId ? { team: { connect: { id: input.teamId } } } : {}),
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
  // The team's per-minute token window is charged from the same numbers that
  // reach the usage row, because this is the one point every chat surface
  // already passes through with a real token count in hand. Charging it at the
  // call sites instead would mean remembering to, at each of them, which is
  // how `tpm` came to be enforced nowhere at all.
  await chargeTeamTokenUsage(input.teamId, input.totalTokens);
}
