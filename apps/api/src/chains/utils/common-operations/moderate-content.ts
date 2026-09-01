import { type ModerationInstance } from '../../moderation-instance.js';
import { runModeration } from '../chain-utils.js';
import type {
  BaseChatChainInput,
  ChainTrackingContext,
} from '../../types/common.js';
import { type TrackAiUsage } from '../../../ai-usage/types.js';

export const moderateContent = async (
  moderator: ModerationInstance,
  input: BaseChatChainInput,
  moderateHistory = true,
  tracking?: ChainTrackingContext,
  trackAiUsage?: TrackAiUsage,
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

  if (tracking && trackAiUsage) {
    const estimatedTokens = Math.ceil(contentToModerate.length / 4);
    await trackAiUsage({
      organizationId: tracking.organizationId,
      projectId: tracking.projectId ?? null,
      userId: tracking.userId ?? null,
      step: 'MODERATION',
      provider: 'openai',
      model: 'text-moderation-latest',
      inputTokens: estimatedTokens,
      outputTokens: 0,
      totalTokens: estimatedTokens,
      durationMs,
    });
  }
};
