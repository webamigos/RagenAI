import type { ModerationInstance } from '@/app/lib/services/llm';
import { runModeration } from '../chain-utils';
import type {
  BaseChatChainInput,
  ChainTrackingContext,
} from '../../types/common';

export const moderateContent = async (
  moderator: ModerationInstance,
  input: BaseChatChainInput,
  moderateHistory = true,
  _tracking?: ChainTrackingContext,
): Promise<void> => {
  if (!moderator) {
    throw new Error('Error moderating content: No moderation instance');
  }

  const contentToModerate = moderateHistory
    ? `${input.question} ${input.chat_history}`
    : input.question;

  // Moderation uses OpenAI's free API directly (not through LiteLLM),
  // so usage tracking is not applicable here.
  await runModeration(moderator, contentToModerate);
};
