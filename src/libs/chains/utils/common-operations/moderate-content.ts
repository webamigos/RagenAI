import type { ModerationInstance } from '@/app/lib/services/llm';
import { runModeration } from '../chain-utils';
import type { BaseChatChainInput } from '../../types/common';

export const moderateContent = async (
  moderator: ModerationInstance,
  input: BaseChatChainInput,
  moderateHistory = true
): Promise<void> => {
  if (!moderator) {
    throw new Error('Error moderating content: No moderation instance');
  }

  const contentToModerate = moderateHistory
    ? `${input.question} ${input.chat_history}`
    : input.question;
  await runModeration(moderator, contentToModerate);
};
