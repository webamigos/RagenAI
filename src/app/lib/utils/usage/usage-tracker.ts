import { LLMResult } from '@langchain/core/outputs';
import { logger } from '../logger';
import { UsageMetricsCore } from './usage-metrics-core';
import { Role, UsagePeriod } from '@prisma/client';
import type { UsageMetrics } from './types';

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

  trackChatCompletionTokens(llmResult: LLMResult) {
    this.safeTrack(async () => {
      const generations = llmResult.generations[0][0] as any;
      const message = generations.message;
      const usageMetadata = message.usage_metadata;
      if (!usageMetadata) {
        logger.warn('No usage metadata found');
        return;
      }

      const { input_tokens, output_tokens, total_tokens } = usageMetadata;

      await this.tracker.track('chatCompletionInputTokens', input_tokens);
      await this.tracker.track('chatCompletionOutputTokens', output_tokens);
      await this.tracker.track('chatCompletionTotalTokens', total_tokens);
    });
  }

  trackMessagesCount(role: Role, count: number) {
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

  trackUploadedFilesSize(fileSize: number) {
    this.safeTrack(async () => {
      await this.tracker.track('filesUploadedSize', fileSize);
    });
  }

  trackUploadedFilesCount(count: number) {
    this.safeTrack(async () => {
      await this.tracker.track('filesUploaded', count);
    });
  }

  trackCreatedThreads(count: number) {
    this.safeTrack(async () => {
      await this.tracker.track('createdThreads', count);
    });
  }

  async getActiveMetrics(): Promise<{
    metrics: UsageMetrics;
    period: Pick<UsagePeriod, 'start_date' | 'end_date' | 'id'> | null;
  }> {
    try {
      const currentPeriod = await this.tracker.getCurrentPeriod();

      if (!currentPeriod) {
        return { metrics: {}, period: null };
      }

      return {
        metrics: currentPeriod?.metrics as UsageMetrics,
        period: {
          id: currentPeriod?.id || 0,
          start_date: currentPeriod?.start_date || new Date(),
          end_date: currentPeriod?.end_date || new Date(),
        },
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to get active metrics');
      throw error;
    }
  }
}
