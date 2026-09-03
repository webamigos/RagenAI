import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { calculateCost } from './ai-pricing.js';
import { type CreateAiUsageInput } from './types.js';

/**
 * Ported from apps/web's createAiUsageCommand/trackAiUsage
 * (src/features/ai-usage/services/commands/create-ai-usage-command.ts).
 * Never throws — a tracking failure must not break the caller. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  async track(input: CreateAiUsageInput): Promise<void> {
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

      await this.prisma.client.aiUsage.create({
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
      // Swallow — tracking must never break the caller (matches apps/web's
      // trackAiUsage wrapper behavior).
      this.logger.error('Failed to create AI usage record', {
        err: error,
        input,
      });
    }
  }
}
