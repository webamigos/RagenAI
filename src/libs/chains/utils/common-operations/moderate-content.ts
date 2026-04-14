import type { ModerationInstance } from '@/app/lib/services/llm';
import { AiUsageStep } from '@/generated/prisma/client';
import { trackAiUsage } from '@/features/ai-usage/services/commands/create-ai-usage-command';
import { runModeration } from '../chain-utils';
import type {
  BaseChatChainInput,
  ChainTrackingContext,
} from '../../types/common';

export const moderateContent = async (
  moderator: ModerationInstance,
  input: BaseChatChainInput,
  moderateHistory = true,
  tracking?: ChainTrackingContext,
): Promise<void> => {
  if (!moderator) {
    throw new Error('Error moderating content: No moderation instance');
  }

  const contentToModerate = moderateHistory
    ? `${input.question} ${input.chat_history}`
    : input.question;

  const startMs = Date.now();
  await runModeration(moderator, contentToModerate);
  const durationMs = Date.now() - startMs;

  if (tracking) {
    const estimatedTokens = Math.ceil(contentToModerate.length / 4);
    void trackAiUsage({
      organizationId: tracking.organizationId,
      projectId: tracking.projectId ?? null,
      userId: tracking.userId ?? null,
      step: AiUsageStep.MODERATION,
      provider: 'openai',
      model: 'text-moderation-latest',
      inputTokens: estimatedTokens,
      outputTokens: 0,
      totalTokens: estimatedTokens,
      durationMs,
    });
  }
};
