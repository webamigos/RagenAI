import { logger } from '../logger';
import { type UsageMetricsCore } from './usage-metrics-core';
import { Role } from '@/generated/prisma/client';
import type { VercelAIUsage, UsageMetrics } from './types';

export type UsagePeriodInfo = {
  id: string;
  startDate: Date;
  endDate: Date;
};

export class UsageTracker {
  constructor(private readonly tracker: UsageMetricsCore) {}

  //Safe track to avoid unhandled promise rejections, we don't want to await tracing operations
  private async safeTrack(operation: () => Promise<void>) {
    try {
      await operation();
    } catch (error) {
      logger.error({ err: error }, 'Usage tracking failed');
    }
  }

  incChatCompletionTokens(usage: VercelAIUsage) {
    this.safeTrack(async () => {
      if (!usage) {
        logger.warn(
          'No usage metadata found, cannot track chat completion tokens',
        );
        return;
      }

      const { promptTokens, completionTokens, totalTokens } = usage;

      await this.tracker.track('chatCompletionInputTokens', promptTokens);
      await this.tracker.track('chatCompletionOutputTokens', completionTokens);
      await this.tracker.track('chatCompletionTotalTokens', totalTokens);
    });
  }

  incEmbeddingsTokens(usage: { prompt_tokens: number; total_tokens: number }) {
    this.safeTrack(async () => {
      if (!usage) {
        logger.warn('No usage metadata found, cannot track embeddings tokens');
        return;
      }

      const { prompt_tokens, total_tokens } = usage;

      await this.tracker.track('embeddingsPromptTokens', prompt_tokens);
      await this.tracker.track('embeddingsTotalTokens', total_tokens);
    });
  }

  incMessagesCount(role: Role, count: number = 1) {
    this.safeTrack(async () => {
      switch (role) {
        case Role.USER:
          await this.tracker.track('messagesUser', count);
          break;
        case Role.ASSISTANT:
          await this.tracker.track('messagesAssistant', count);
          break;
      }
      await this.tracker.track('messagesTotal', count);
    });
  }

  incUploadedFilesSize(fileSize: number) {
    this.safeTrack(async () => {
      await this.tracker.track('filesUploadedSize', fileSize);
    });
  }

  incUploadedFilesCount(count: number = 1) {
    this.safeTrack(async () => {
      await this.tracker.track('filesUploaded', count);
    });
  }

  incThreadsCount(count: number = 1) {
    this.safeTrack(async () => {
      await this.tracker.track('createdThreads', count);
    });
  }

  async getCurrentPeriodMetrics(): Promise<{
    metrics: UsageMetrics;
    period: UsagePeriodInfo | null;
  }> {
    try {
      const currentSubscription = await this.tracker.getCurrentPeriod();

      if (!currentSubscription) {
        return { metrics: {}, period: null };
      }

      // TODO: Usage metrics storage was removed during Better Auth Stripe migration.
      // Returning empty metrics until usage period tracking is reimplemented.
      return {
        metrics: {},
        period: {
          id: currentSubscription.id,
          startDate: currentSubscription.periodStart ?? new Date(),
          endDate: currentSubscription.periodEnd ?? new Date(),
        },
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to get active metrics');
      throw error;
    }
  }
}
